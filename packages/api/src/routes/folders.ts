import { okResponse, errorResponse, Errors, ROLE_RANK, type Session, type Folder, type Role } from "../lib";
import type { Env } from "../index";

async function getCallerRole(db: D1Database, projectId: string, userId: string): Promise<Role | null> {
  const project = await db.prepare("SELECT owner_id FROM projects WHERE id = ?")
    .bind(projectId).first<{ owner_id: string }>();
  if (!project) return null;
  if (project.owner_id === userId) return "owner";
  const row = await db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?")
    .bind(projectId, userId).first<{ role: Role }>();
  return row?.role ?? null;
}

export async function handleFolders(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  const parts = url.pathname.replace(/^\/folders\/?/, "").split("/");
  const folderId = parts[0] || null;
  const params = url.searchParams;

  // GET /folders?projectId=xxx[&parentId=yyy|&rootFolderId=zzz][&type=docs|passwords]
  if (!folderId && request.method === "GET") {
    const projectId = params.get("projectId");
    if (!projectId) return errorResponse(Errors.BAD_REQUEST);

    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);

    const parentId = params.get("parentId");
    const rootFolderId = params.get("rootFolderId");
    const type = params.get("type") ?? "docs";

    let rows;
    if (rootFolderId) {
      rows = await env.DB.prepare(`
        WITH RECURSIVE subtree(id, name, type, project_id, parent_id, created_at) AS (
          SELECT id, name, type, project_id, parent_id, created_at
            FROM folders WHERE id = ? AND project_id = ? AND type = ?
          UNION ALL
          SELECT f.id, f.name, f.type, f.project_id, f.parent_id, f.created_at
            FROM folders f JOIN subtree s ON f.parent_id = s.id
        )
        SELECT * FROM subtree WHERE id != ? ORDER BY name ASC
      `).bind(rootFolderId, projectId, type, rootFolderId).all<Folder>();
    } else if (parentId) {
      rows = await env.DB.prepare(
        "SELECT * FROM folders WHERE project_id = ? AND parent_id = ? AND type = ? ORDER BY name ASC",
      ).bind(projectId, parentId, type).all<Folder>();
    } else {
      rows = await env.DB.prepare(
        "SELECT * FROM folders WHERE project_id = ? AND parent_id IS NULL AND type = ? ORDER BY name ASC",
      ).bind(projectId, type).all<Folder>();
    }

    return okResponse(rows.results);
  }

  // GET /folders/counts?projectId=xxx[&type=docs|passwords]
  // Returns { [folderId]: { docs: number; folders: number } } with recursive subtree counts.
  if (folderId === "counts" && request.method === "GET") {
    const projectId = params.get("projectId");
    if (!projectId) return errorResponse(Errors.BAD_REQUEST);

    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);

    const type = params.get("type") ?? "docs";
    const itemTable = type === "passwords" ? "passwords" : "docs";

    // Build a (ancestor_id, folder_id) mapping for every folder in the project, then
    // aggregate: distinct non-self folder_ids = recursive subfolder count,
    // joined item rows = recursive doc/password count.
    const rows = await env.DB.prepare(`
      WITH RECURSIVE subtree(ancestor_id, folder_id) AS (
        SELECT id, id FROM folders WHERE project_id = ? AND type = ?
        UNION ALL
        SELECT s.ancestor_id, f.id
          FROM folders f JOIN subtree s ON f.parent_id = s.folder_id
         WHERE f.project_id = ? AND f.type = ?
      )
      SELECT
        s.ancestor_id AS folder_id,
        COUNT(DISTINCT CASE WHEN s.folder_id != s.ancestor_id THEN s.folder_id END) AS folders,
        COUNT(i.id) AS docs
      FROM subtree s
      LEFT JOIN ${itemTable} i ON i.folder_id = s.folder_id AND i.project_id = ?
      GROUP BY s.ancestor_id
    `).bind(projectId, type, projectId, type, projectId)
      .all<{ folder_id: string; folders: number; docs: number }>();

    const counts: Record<string, { docs: number; folders: number }> = {};
    for (const r of rows.results) counts[r.folder_id] = { docs: r.docs, folders: r.folders };
    return okResponse(counts);
  }

  // POST /folders — editor or above
  if (!folderId && request.method === "POST") {
    const body = await request.json<{ name: string; projectId: string; parentId?: string | null; type?: string }>();
    if (!body.name || !body.projectId) return errorResponse(Errors.BAD_REQUEST);

    const role = await getCallerRole(env.DB, body.projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const type = body.type ?? "docs";

    await env.DB.prepare(
      "INSERT INTO folders (id, name, type, project_id, parent_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(id, body.name, type, body.projectId, body.parentId ?? null, now).run();

    return okResponse({ id, name: body.name, type, project_id: body.projectId, parent_id: body.parentId ?? null, created_at: now }, 201);
  }

  // PUT /folders/:id — editor or above (rename or move)
  if (folderId && folderId !== "counts" && request.method === "PUT") {
    const folder = await env.DB.prepare("SELECT * FROM folders WHERE id = ?")
      .bind(folderId).first<Folder & { type: string }>();
    if (!folder) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, folder.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const body = await request.json<Partial<{ name: string; parentId: string | null }>>();

    const sets: string[] = [];
    const binds: (string | null)[] = [];
    if (body.name !== undefined) { sets.push("name = ?"); binds.push(body.name); }
    if (body.parentId !== undefined) { sets.push("parent_id = ?"); binds.push(body.parentId); }
    if (sets.length > 0) {
      await env.DB.prepare(`UPDATE folders SET ${sets.join(", ")} WHERE id = ?`)
        .bind(...binds, folderId).run();
    }

    return okResponse({
      ...folder,
      name: body.name ?? folder.name,
      parent_id: body.parentId !== undefined ? (body.parentId ?? null) : folder.parent_id,
    });
  }

  // DELETE /folders/:id — editor or above
  if (folderId && folderId !== "counts" && request.method === "DELETE") {
    const folder = await env.DB.prepare("SELECT project_id FROM folders WHERE id = ?")
      .bind(folderId).first<{ project_id: string }>();
    if (!folder) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, folder.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    await env.DB.prepare("DELETE FROM folders WHERE id = ?").bind(folderId).run();
    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
