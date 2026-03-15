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

  // GET /folders?projectId=xxx&parentId=yyy
  if (!folderId && request.method === "GET") {
    const projectId = params.get("projectId");
    if (!projectId) return errorResponse(Errors.BAD_REQUEST);

    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);

    const parentId = params.get("parentId");
    const rows = parentId
      ? await env.DB.prepare("SELECT * FROM folders WHERE project_id = ? AND parent_id = ? ORDER BY name ASC")
          .bind(projectId, parentId).all<Folder>()
      : await env.DB.prepare("SELECT * FROM folders WHERE project_id = ? AND parent_id IS NULL ORDER BY name ASC")
          .bind(projectId).all<Folder>();

    return okResponse(rows.results);
  }

  // POST /folders — editor or above
  if (!folderId && request.method === "POST") {
    const body = await request.json<{ name: string; projectId: string; parentId?: string | null }>();
    if (!body.name || !body.projectId) return errorResponse(Errors.BAD_REQUEST);

    const role = await getCallerRole(env.DB, body.projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await env.DB.prepare(
      "INSERT INTO folders (id, name, project_id, parent_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, body.name, body.projectId, body.parentId ?? null, now).run();

    return okResponse({ id, name: body.name, project_id: body.projectId, parent_id: body.parentId ?? null, created_at: now }, 201);
  }

  // PUT /folders/:id — editor or above (rename or move)
  if (folderId && request.method === "PUT") {
    const folder = await env.DB.prepare("SELECT project_id FROM folders WHERE id = ?")
      .bind(folderId).first<{ project_id: string }>();
    if (!folder) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, folder.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const body = await request.json<Partial<{ name: string; parentId: string | null }>>();

    if (body.name !== undefined) {
      await env.DB.prepare("UPDATE folders SET name = ? WHERE id = ?")
        .bind(body.name, folderId).run();
    }
    if (body.parentId !== undefined) {
      await env.DB.prepare("UPDATE folders SET parent_id = ? WHERE id = ?")
        .bind(body.parentId, folderId).run();
    }

    const updated = await env.DB.prepare("SELECT * FROM folders WHERE id = ?").bind(folderId).first<Folder>();
    return okResponse(updated);
  }

  // DELETE /folders/:id — editor or above
  if (folderId && request.method === "DELETE") {
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
