import { okResponse, errorResponse, Errors, ROLE_RANK, type Session, type Doc, type Role } from "../lib";
import type { Env } from "../index";

type BlameEntry = { u: string; n: string; t: string; c: string | null } | null;

async function getCallerInfo(db: D1Database, projectId: string, userId: string): Promise<{ role: Role; name: string } | null> {
  const row = await db.prepare("SELECT role, name FROM project_members WHERE project_id = ? AND user_id = ?")
    .bind(projectId, userId).first<{ role: Role; name: string }>();
  return row ? { role: row.role, name: row.name } : null;
}

function computeBlame(
  oldLines: string[],
  newLines: string[],
  oldBlame: BlameEntry[],
  current: { u: string; n: string; t: string; c: string | null },
): BlameEntry[] {
  const m = oldLines.length;
  const n = newLines.length;

  if (m > 3000 || n > 3000) {
    return newLines.map((line, i) =>
      i < m && line === oldLines[i] ? (oldBlame[i] ?? null) : current,
    );
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  const matchMap = new Map<number, number>();
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (oldLines[i - 1] === newLines[j - 1]) {
      matchMap.set(j - 1, i - 1);
      i--; j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  return newLines.map((_, idx) => {
    const oldIdx = matchMap.get(idx);
    return oldIdx !== undefined ? (oldBlame[oldIdx] ?? null) : current;
  });
}

export async function handleDocs(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  const parts = url.pathname.replace(/^\/docs\/?/, "").split("/");
  const docId = parts[0] || null;
  const subResource = parts[1] || null;
  const subId = parts[2] || null;
  const params = url.searchParams;

  // GET /docs?projectId=xxx[&folderId=yyy] — any member
  if (!docId && request.method === "GET") {
    const projectId = params.get("projectId");
    if (!projectId) return errorResponse(Errors.BAD_REQUEST);

    const caller = await getCallerInfo(env.DB, projectId, user.userId);
    if (caller === null) return errorResponse(Errors.FORBIDDEN);
    const role = caller.role;

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
      const rootFolderId = params.get("rootFolderId");
      let rows;
      if (rootFolderId) {
        rows = await env.DB.prepare(`
          WITH RECURSIVE subtree(id) AS (
            SELECT id FROM folders WHERE id = ?
            UNION ALL
            SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
          )
          ${docWithAuthor}
          WHERE d.project_id = ? AND d.folder_id IN (SELECT id FROM subtree)
            AND (LOWER(d.title) LIKE LOWER(?) OR LOWER(COALESCE(pm.name, d.author_id)) LIKE LOWER(?))
          ORDER BY d.title ASC
        `).bind(rootFolderId, projectId, `%${q}%`, `%${q}%`).all<DocWithAuthor>();
      } else {
        rows = await env.DB.prepare(`${docWithAuthor} WHERE d.project_id = ? AND (LOWER(d.title) LIKE LOWER(?) OR LOWER(COALESCE(pm.name, d.author_id)) LIKE LOWER(?)) ORDER BY d.title ASC`)
          .bind(projectId, `%${q}%`, `%${q}%`).all<DocWithAuthor>();
      }
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

    const caller = await getCallerInfo(env.DB, body.projectId, user.userId);
    if (caller === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[caller.role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

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

  // GET /docs/:id/revisions/:revisionId — any member
  if (docId && subResource === "revisions" && subId && request.method === "GET") {
    const meta = await env.DB.prepare("SELECT project_id FROM docs WHERE id = ?").bind(docId).first<{ project_id: string }>();
    if (!meta) return errorResponse(Errors.NOT_FOUND);
    const caller = await getCallerInfo(env.DB, meta.project_id, user.userId);
    if (caller === null) return errorResponse(Errors.FORBIDDEN);
    const revision = await env.DB.prepare(
      "SELECT id, editor_id, editor_name, created_at, changelog FROM asset_revisions WHERE id = ? AND asset_type = 'doc' AND asset_id = ?",
    ).bind(subId, docId).first<{ id: string; editor_id: string; editor_name: string; created_at: string; changelog: string | null }>();
    if (!revision) return errorResponse(Errors.NOT_FOUND);
    const r2Object = await env.ASSETS.get(`${meta.project_id}/${docId}/v/${subId}`);
    const content = r2Object ? await r2Object.text() : "";
    return okResponse({ ...revision, content });
  }

  // GET /docs/:id/revisions — any member
  if (docId && subResource === "revisions" && !subId && request.method === "GET") {
    const meta = await env.DB.prepare("SELECT project_id FROM docs WHERE id = ?").bind(docId).first<{ project_id: string }>();
    if (!meta) return errorResponse(Errors.NOT_FOUND);
    const caller = await getCallerInfo(env.DB, meta.project_id, user.userId);
    if (caller === null) return errorResponse(Errors.FORBIDDEN);
    const rows = await env.DB.prepare(
      "SELECT id, editor_id, editor_name, created_at, changelog FROM asset_revisions WHERE asset_type = 'doc' AND asset_id = ? ORDER BY created_at DESC",
    ).bind(docId).all<{ id: string; editor_id: string; editor_name: string; created_at: string; changelog: string | null }>();
    return okResponse(rows.results);
  }

  // GET /docs/:id — any member of the doc's project
  if (docId && request.method === "GET") {
    const meta = await env.DB.prepare("SELECT project_id FROM docs WHERE id = ?").bind(docId).first<{ project_id: string }>();
    if (!meta) return errorResponse(Errors.NOT_FOUND);
    const caller = await getCallerInfo(env.DB, meta.project_id, user.userId);
    if (caller === null) return errorResponse(Errors.FORBIDDEN);
    const row = await env.DB.prepare("SELECT * FROM docs WHERE id = ?").bind(docId).first<Doc>();
    if (!row) return errorResponse(Errors.NOT_FOUND);
    const [r2Content, r2Blame] = await Promise.all([
      env.ASSETS.get(`${meta.project_id}/${docId}`),
      env.ASSETS.get(`${meta.project_id}/${docId}.blame`),
    ]);
    const content = r2Content ? await r2Content.text() : "";
    const blame: BlameEntry[] = r2Blame ? JSON.parse(await r2Blame.text()) : [];
    return okResponse({ ...row, content, blame, myRole: caller.role });
  }

  // PUT /docs/:id — editor or above
  if (docId && request.method === "PUT") {
    type DocRow = { id: string; title: string; project_id: string; author_id: string; published_at: string | null; show_heading: number; show_last_updated: number; folder_id: string | null; created_at: string; updated_at: string };
    const doc = await env.DB.prepare("SELECT * FROM docs WHERE id = ?").bind(docId).first<DocRow>();
    if (!doc) return errorResponse(Errors.NOT_FOUND);

    const caller = await getCallerInfo(env.DB, doc.project_id, user.userId);
    if (caller === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[caller.role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const body = await request.json<Partial<{ title: string; content: string; publishedAt: string | null; showHeading: boolean; showLastUpdated: boolean; folderId: string | null; changelog: string }>>();
    const now = new Date().toISOString();
    let returnContent: string | undefined;

    if (body.content !== undefined) {
      returnContent = body.content;
      const blameKey = `${doc.project_id}/${docId}.blame`;
      const [oldR2, oldBlameR2] = await Promise.all([
        env.ASSETS.get(`${doc.project_id}/${docId}`),
        env.ASSETS.get(blameKey),
      ]);
      const oldContent = oldR2 ? await oldR2.text() : "";
      if (body.content !== oldContent) {
        const oldBlame: BlameEntry[] = oldBlameR2 ? JSON.parse(await oldBlameR2.text()) : [];
        const newBlame = computeBlame(
          oldContent.split("\n"),
          body.content.split("\n"),
          oldBlame,
          { u: user.userId, n: caller.name, t: now, c: body.changelog ?? null },
        );
        const revisionId = crypto.randomUUID();
        await Promise.all([
          env.ASSETS.put(`${doc.project_id}/${docId}`, body.content),
          env.ASSETS.put(blameKey, JSON.stringify(newBlame)),
          env.ASSETS.put(`${doc.project_id}/${docId}/v/${revisionId}`, body.content),
        ]);
        await env.DB.prepare(
          "INSERT INTO asset_revisions (id, asset_type, asset_id, project_id, editor_id, editor_name, created_at, data, changelog) VALUES (?, 'doc', ?, ?, ?, ?, ?, NULL, ?)",
        ).bind(revisionId, docId, doc.project_id, user.userId, caller.name, now, body.changelog ?? null).run();
      }
    }

    const showHeading = body.showHeading !== undefined ? (body.showHeading ? 1 : 0) : null;
    const showLastUpdated = body.showLastUpdated !== undefined ? (body.showLastUpdated ? 1 : 0) : null;

    await env.DB.prepare(
      "UPDATE docs SET title = COALESCE(?, title), published_at = ?, show_heading = COALESCE(?, show_heading), show_last_updated = COALESCE(?, show_last_updated), updated_at = ? WHERE id = ?",
    ).bind(body.title ?? null, body.publishedAt ?? null, showHeading, showLastUpdated, now, docId).run();

    if (body.folderId !== undefined) {
      await env.DB.prepare("UPDATE docs SET folder_id = ? WHERE id = ?")
        .bind(body.folderId, docId).run();
    }

    if (returnContent === undefined) {
      const r2Object = await env.ASSETS.get(`${doc.project_id}/${docId}`);
      returnContent = r2Object ? await r2Object.text() : "";
    }
    const updated = {
      ...doc,
      title: body.title ?? doc.title,
      published_at: body.publishedAt ?? null,
      show_heading: showHeading !== null ? showHeading : doc.show_heading,
      show_last_updated: showLastUpdated !== null ? showLastUpdated : doc.show_last_updated,
      folder_id: body.folderId !== undefined ? body.folderId : doc.folder_id,
      updated_at: now,
    };
    return okResponse({ ...updated, content: returnContent });
  }

  // DELETE /docs/:id — editor or above
  if (docId && request.method === "DELETE") {
    const doc = await env.DB.prepare("SELECT project_id FROM docs WHERE id = ?").bind(docId).first<{ project_id: string }>();
    if (!doc) return errorResponse(Errors.NOT_FOUND);

    const caller = await getCallerInfo(env.DB, doc.project_id, user.userId);
    if (caller === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[caller.role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const revisions = await env.DB.prepare("SELECT id FROM asset_revisions WHERE asset_type = 'doc' AND asset_id = ?")
      .bind(docId).all<{ id: string }>();
    await Promise.all([
      env.ASSETS.delete(`${doc.project_id}/${docId}`),
      env.ASSETS.delete(`${doc.project_id}/${docId}.blame`),
      ...revisions.results.map(r => env.ASSETS.delete(`${doc.project_id}/${docId}/v/${r.id}`)),
    ]);
    await env.DB.prepare("DELETE FROM docs WHERE id = ?").bind(docId).run();
    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
