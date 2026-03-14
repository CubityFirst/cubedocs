import { okResponse, errorResponse, Errors, type Session, type Doc } from "../lib";
import type { Env } from "../index";

export async function handleDocs(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  const parts = url.pathname.replace(/^\/docs\/?/, "").split("/");
  const docId = parts[0] || null;
  const params = url.searchParams;

  // GET /docs?projectId=xxx
  if (!docId && request.method === "GET") {
    const projectId = params.get("projectId");
    if (!projectId) return errorResponse(Errors.BAD_REQUEST);
    const rows = await env.DB.prepare(
      "SELECT * FROM docs WHERE project_id = ? ORDER BY created_at DESC",
    ).bind(projectId).all<Doc>();
    return okResponse(rows.results);
  }

  // POST /docs
  if (!docId && request.method === "POST") {
    const body = await request.json<{ title: string; slug: string; content: string; projectId: string }>();
    if (!body.title || !body.slug || !body.projectId) return errorResponse(Errors.BAD_REQUEST);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO docs (id, slug, title, content, project_id, author_id, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)",
    ).bind(id, body.slug, body.title, body.content ?? "", body.projectId, user.userId, now, now).run();

    return okResponse(
      { id, slug: body.slug, title: body.title, content: body.content ?? "", projectId: body.projectId, authorId: user.userId, publishedAt: null, createdAt: now, updatedAt: now },
      201,
    );
  }

  // GET /docs/:id
  if (docId && request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM docs WHERE id = ?").bind(docId).first<Doc>();
    if (!row) return errorResponse(Errors.NOT_FOUND);
    return okResponse(row);
  }

  // PUT /docs/:id
  if (docId && request.method === "PUT") {
    const body = await request.json<Partial<{ title: string; content: string; publishedAt: string | null }>>();
    const now = new Date().toISOString();
    await env.DB.prepare(
      "UPDATE docs SET title = COALESCE(?, title), content = COALESCE(?, content), published_at = ?, updated_at = ? WHERE id = ? AND author_id = ?",
    ).bind(body.title ?? null, body.content ?? null, body.publishedAt ?? null, now, docId, user.userId).run();
    const updated = await env.DB.prepare("SELECT * FROM docs WHERE id = ?").bind(docId).first<Doc>();
    if (!updated) return errorResponse(Errors.NOT_FOUND);
    return okResponse(updated);
  }

  // DELETE /docs/:id
  if (docId && request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM docs WHERE id = ? AND author_id = ?")
      .bind(docId, user.userId).run();
    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
