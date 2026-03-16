import { okResponse, errorResponse, Errors, ROLE_RANK, type Session, type Project, type Role } from "../lib";
import type { Env } from "../index";

async function getCallerRole(db: D1Database, projectId: string, userId: string): Promise<Role | null> {
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

  // GET /projects — list projects where user is a member (includes owned)
  if (!projectId && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT p.*, pm.role, (SELECT COUNT(*) FROM docs WHERE project_id = p.id) as doc_count, (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) as member_count, (SELECT COUNT(*) FROM passwords WHERE project_id = p.id) as password_count FROM projects p INNER JOIN project_members pm ON pm.project_id = p.id WHERE pm.user_id = ? ORDER BY p.created_at DESC",
    ).bind(user.userId).all<Project & { role: Role; doc_count: number; member_count: number; password_count: number }>();
    return okResponse(rows.results);
  }

  // POST /projects
  if (!projectId && request.method === "POST") {
    const body = await request.json<{ name: string; description?: string }>();
    if (!body.name) return errorResponse(Errors.BAD_REQUEST);

    // Look up owner's name from auth worker
    const lookupRes = await env.AUTH.fetch("https://auth/lookup-by-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: user.userId }),
    });
    let ownerName = user.email;
    if (lookupRes.ok) {
      const data = await lookupRes.json<{ ok: boolean; data?: { name: string } }>();
      if (data.ok && data.data) ownerName = data.data.name;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO projects (id, name, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, body.name, body.description ?? null, user.userId, now).run();

    await env.DB.prepare(
      "INSERT INTO project_members (id, project_id, user_id, email, name, role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), id, user.userId, user.email, ownerName, "owner", user.userId, now).run();

    return okResponse({ id, name: body.name, ownerId: user.userId, createdAt: now }, 201);
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

    const body = await request.json<{ name?: string; description?: string | null; publishedAt?: string | null; vaultEnabled?: boolean; changelogMode?: string }>();
    if (body.name !== undefined && !body.name.trim()) return errorResponse(Errors.BAD_REQUEST);
    if (body.changelogMode !== undefined && !["off", "on", "enforced"].includes(body.changelogMode)) return errorResponse(Errors.BAD_REQUEST);

    const fields: string[] = [];
    const values: unknown[] = [];
    if (body.name !== undefined) { fields.push("name = ?"); values.push(body.name.trim()); }
    if (body.description !== undefined) { fields.push("description = ?"); values.push(body.description ?? null); }
    if (body.publishedAt !== undefined) { fields.push("published_at = ?"); values.push(body.publishedAt ?? null); }
    if (body.vaultEnabled !== undefined) { fields.push("vault_enabled = ?"); values.push(body.vaultEnabled ? 1 : 0); }
    if (body.changelogMode !== undefined) { fields.push("changelog_mode = ?"); values.push(body.changelogMode); }
    if (fields.length === 0) return errorResponse(Errors.BAD_REQUEST);

    values.push(projectId);
    await env.DB.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();

    const updated = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first<Project>();
    return okResponse(updated);
  }

  // DELETE /projects/:id — owner only
  if (projectId && request.method === "DELETE") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role !== "owner") return errorResponse(Errors.NOT_FOUND);
    await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(projectId).run();
    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
