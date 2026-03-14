import { okResponse, errorResponse, Errors, ROLE_RANK, type Session, type Project, type Role } from "../lib";
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

export async function handleProjects(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  const parts = url.pathname.replace(/^\/projects\/?/, "").split("/");
  const projectId = parts[0] || null;

  // GET /projects — list owned projects + projects where user is a member
  if (!projectId && request.method === "GET") {
    const owned = await env.DB.prepare(
      "SELECT p.*, (SELECT COUNT(*) FROM docs WHERE project_id = p.id) as doc_count FROM projects p WHERE p.owner_id = ? ORDER BY p.created_at DESC",
    ).bind(user.userId).all<Project & { doc_count: number }>();

    const membered = await env.DB.prepare(
      "SELECT p.*, (SELECT COUNT(*) FROM docs WHERE project_id = p.id) as doc_count FROM projects p INNER JOIN project_members pm ON pm.project_id = p.id WHERE pm.user_id = ? ORDER BY p.created_at DESC",
    ).bind(user.userId).all<Project & { doc_count: number }>();

    const seen = new Set<string>();
    const results: (Project & { doc_count: number })[] = [];
    for (const p of [...owned.results, ...membered.results]) {
      if (!seen.has(p.id)) { seen.add(p.id); results.push(p); }
    }

    return okResponse(results);
  }

  // POST /projects
  if (!projectId && request.method === "POST") {
    const body = await request.json<{ name: string; slug: string }>();
    if (!body.name || !body.slug) return errorResponse(Errors.BAD_REQUEST);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO projects (id, name, slug, owner_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, body.name, body.slug, user.userId, now).run();

    return okResponse({ id, name: body.name, slug: body.slug, ownerId: user.userId, createdAt: now }, 201);
  }

  // GET /projects/:id — any member can view
  if (projectId && request.method === "GET") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.NOT_FOUND);
    const row = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first<Project>();
    if (!row) return errorResponse(Errors.NOT_FOUND);
    return okResponse(row);
  }

  // PATCH /projects/:id — admin or owner
  if (projectId && request.method === "PATCH") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.NOT_FOUND);
    if (ROLE_RANK[role] < ROLE_RANK["admin"]) return errorResponse(Errors.FORBIDDEN);

    const body = await request.json<{ name?: string; description?: string | null }>();
    if (body.name !== undefined && !body.name.trim()) return errorResponse(Errors.BAD_REQUEST);

    const fields: string[] = [];
    const values: unknown[] = [];
    if (body.name !== undefined) { fields.push("name = ?"); values.push(body.name.trim()); }
    if (body.description !== undefined) { fields.push("description = ?"); values.push(body.description ?? null); }
    if (fields.length === 0) return errorResponse(Errors.BAD_REQUEST);

    values.push(projectId);
    await env.DB.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();

    const updated = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first<Project>();
    return okResponse(updated);
  }

  // DELETE /projects/:id — owner only
  if (projectId && request.method === "DELETE") {
    const row = await env.DB.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?")
      .bind(projectId, user.userId).first();
    if (!row) return errorResponse(Errors.NOT_FOUND);
    await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(projectId).run();
    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
