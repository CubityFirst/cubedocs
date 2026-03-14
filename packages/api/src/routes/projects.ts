import { okResponse, errorResponse, Errors, type Session, type Project } from "@cubedocs/shared";
import type { Env } from "../index";

export async function handleProjects(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  const parts = url.pathname.replace(/^\/projects\/?/, "").split("/");
  const projectId = parts[0] || null;

  // GET /projects
  if (!projectId && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT * FROM projects WHERE owner_id = ? ORDER BY created_at DESC",
    ).bind(user.userId).all<Project>();
    return okResponse(rows.results);
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

  // GET /projects/:id
  if (projectId && request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM projects WHERE id = ? AND owner_id = ?")
      .bind(projectId, user.userId).first<Project>();
    if (!row) return errorResponse(Errors.NOT_FOUND);
    return okResponse(row);
  }

  // DELETE /projects/:id
  if (projectId && request.method === "DELETE") {
    const row = await env.DB.prepare("SELECT id FROM projects WHERE id = ? AND owner_id = ?")
      .bind(projectId, user.userId).first();
    if (!row) return errorResponse(Errors.NOT_FOUND);
    await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(projectId).run();
    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
