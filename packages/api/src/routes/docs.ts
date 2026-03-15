import { okResponse, errorResponse, Errors, ROLE_RANK, type Session, type Doc, type Role } from "../lib";
import type { Env } from "../index";

async function getCallerRole(db: D1Database, projectId: string, userId: string): Promise<Role | null> {
  const row = await db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?")
    .bind(projectId, userId).first<{ role: Role }>();
  return row?.role ?? null;
}

export async function handleDocs(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  const parts = url.pathname.replace(/^\/docs\/?/, "").split("/");
  const docId = parts[0] || null;
  const params = url.searchParams;

  // GET /docs?projectId=xxx[&folderId=yyy] — any member
  if (!docId && request.method === "GET") {
    const projectId = params.get("projectId");
    if (!projectId) return errorResponse(Errors.BAD_REQUEST);

    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);

    const folderId = params.get("folderId");
    const q = params.get("q");
    const docWithAuthor = `
      SELECT d.id, d.title, d.folder_id, d.author_id, d.created_at, d.updated_at,
        COALESCE(pm.name, d.author_id) AS author_name,
        pm.role AS author_role
      FROM docs d
      LEFT JOIN project_members pm ON pm.project_id = d.project_id AND pm.user_id = d.author_id
    `;

    type DocWithAuthor = Doc & { author_name: string; author_role: string | null };

    if (q) {
      const rows = await env.DB.prepare(`${docWithAuthor} WHERE d.project_id = ? AND LOWER(d.title) LIKE LOWER(?) ORDER BY d.title ASC`)
        .bind(projectId, `%${q}%`).all<DocWithAuthor>();
      return okResponse(rows.results);
    }

    const rows = folderId
      ? await env.DB.prepare(`${docWithAuthor} WHERE d.project_id = ? AND d.folder_id = ? ORDER BY d.title ASC`)
          .bind(projectId, folderId).all<DocWithAuthor>()
      : params.has("folderId")
        ? await env.DB.prepare(`${docWithAuthor} WHERE d.project_id = ? AND d.folder_id IS NULL ORDER BY d.title ASC`)
            .bind(projectId).all<DocWithAuthor>()
        : await env.DB.prepare(`${docWithAuthor} WHERE d.project_id = ? ORDER BY d.created_at DESC`)
            .bind(projectId).all<DocWithAuthor>();
    return okResponse(rows.results);
  }

  // POST /docs — editor or above
  if (!docId && request.method === "POST") {
    const body = await request.json<{ title: string; content: string; projectId: string; folderId?: string | null }>();
    if (!body.title || !body.projectId) return errorResponse(Errors.BAD_REQUEST);

    const role = await getCallerRole(env.DB, body.projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const content = body.content ?? "";
    const folderId = body.folderId ?? null;

    await env.ASSETS.put(`${body.projectId}/${id}`, content);
    await env.DB.prepare(
      "INSERT INTO docs (id, title, project_id, author_id, folder_id, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)",
    ).bind(id, body.title, body.projectId, user.userId, folderId, now, now).run();

    return okResponse(
      { id, title: body.title, content, projectId: body.projectId, authorId: user.userId, folderId, publishedAt: null, createdAt: now, updatedAt: now },
      201,
    );
  }

  // GET /docs/:id — any member of the doc's project
  if (docId && request.method === "GET") {
    const meta = await env.DB.prepare("SELECT project_id FROM docs WHERE id = ?").bind(docId).first<{ project_id: string }>();
    if (!meta) return errorResponse(Errors.NOT_FOUND);
    const role = await getCallerRole(env.DB, meta.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    const row = await env.DB.prepare("SELECT * FROM docs WHERE id = ?").bind(docId).first<Doc>();
    if (!row) return errorResponse(Errors.NOT_FOUND);
    const r2Object = await env.ASSETS.get(`${meta.project_id}/${docId}`);
    const content = r2Object ? await r2Object.text() : "";
    return okResponse({ ...row, content, myRole: role });
  }

  // PUT /docs/:id — editor or above
  if (docId && request.method === "PUT") {
    const doc = await env.DB.prepare("SELECT project_id FROM docs WHERE id = ?").bind(docId).first<{ project_id: string }>();
    if (!doc) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, doc.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const body = await request.json<Partial<{ title: string; content: string; publishedAt: string | null; showHeading: boolean; folderId: string | null }>>();
    const now = new Date().toISOString();

    if (body.content !== undefined) {
      await env.ASSETS.put(`${doc.project_id}/${docId}`, body.content);
    }

    const showHeading = body.showHeading !== undefined ? (body.showHeading ? 1 : 0) : null;

    await env.DB.prepare(
      "UPDATE docs SET title = COALESCE(?, title), published_at = ?, show_heading = COALESCE(?, show_heading), updated_at = ? WHERE id = ?",
    ).bind(body.title ?? null, body.publishedAt ?? null, showHeading, now, docId).run();

    if (body.folderId !== undefined) {
      await env.DB.prepare("UPDATE docs SET folder_id = ? WHERE id = ?")
        .bind(body.folderId, docId).run();
    }

    const updated = await env.DB.prepare("SELECT * FROM docs WHERE id = ?").bind(docId).first<Doc>();
    if (!updated) return errorResponse(Errors.NOT_FOUND);
    const r2Object = await env.ASSETS.get(`${doc.project_id}/${docId}`);
    const content = r2Object ? await r2Object.text() : "";
    return okResponse({ ...updated, content });
  }

  // DELETE /docs/:id — editor or above
  if (docId && request.method === "DELETE") {
    const doc = await env.DB.prepare("SELECT project_id FROM docs WHERE id = ?").bind(docId).first<{ project_id: string }>();
    if (!doc) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, doc.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    await env.ASSETS.delete(`${doc.project_id}/${docId}`);
    await env.DB.prepare("DELETE FROM docs WHERE id = ?").bind(docId).run();
    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
