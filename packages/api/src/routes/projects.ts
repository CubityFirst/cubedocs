import { okResponse, errorResponse, Errors, ROLE_RANK, ProjectFeatures, type Session, type Project, type Role } from "../lib";
import type { Env } from "../index";

const VANITY_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

async function getCallerRole(db: D1Database, projectId: string, userId: string): Promise<Role | null> {
  const row = await db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND accepted = 1")
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
      "SELECT p.*, pm.role, pm.is_favourite, (SELECT COUNT(*) FROM docs WHERE project_id = p.id) as doc_count, (SELECT COUNT(*) FROM project_members WHERE project_id = p.id AND accepted = 1) as member_count FROM projects p INNER JOIN project_members pm ON pm.project_id = p.id WHERE pm.user_id = ? AND pm.accepted = 1 ORDER BY pm.is_favourite DESC, p.created_at DESC",
    ).bind(user.userId).all<Project & { role: Role; is_favourite: number; doc_count: number; member_count: number }>();
    return okResponse(rows.results);
  }

  // POST /projects
  if (!projectId && request.method === "POST") {
    const body = await request.json<{ name: string; description?: string }>();
    if (!body.name) return errorResponse(Errors.BAD_REQUEST);

    // Look up owner's name from auth worker
    const authHeader = request.headers.get("Authorization");
    const lookupRes = await env.AUTH.fetch("https://auth/lookup-by-id", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
      body: JSON.stringify({}),
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
      "INSERT INTO project_members (id, project_id, user_id, email, name, role, invited_by, created_at, accepted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
    ).bind(crypto.randomUUID(), id, user.userId, user.email, ownerName, "owner", user.userId, now).run();

    return okResponse({ id, name: body.name, ownerId: user.userId, createdAt: now }, 201);
  }

  // GET /projects/:id — any member can view
  if (projectId && request.method === "GET") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.NOT_FOUND);
    const row = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first<Project>();
    if (!row) return errorResponse(Errors.NOT_FOUND);
    return okResponse({ ...row, role });
  }

  // PATCH /projects/:id/favourite — toggle favourite for current user
  if (projectId && parts[1] === "favourite" && request.method === "PATCH") {
    const row = await env.DB.prepare("SELECT is_favourite FROM project_members WHERE project_id = ? AND user_id = ? AND accepted = 1")
      .bind(projectId, user.userId).first<{ is_favourite: number }>();
    if (row === null) return errorResponse(Errors.NOT_FOUND);
    const next = row.is_favourite ? 0 : 1;
    await env.DB.prepare("UPDATE project_members SET is_favourite = ? WHERE project_id = ? AND user_id = ?")
      .bind(next, projectId, user.userId).run();
    return okResponse({ is_favourite: next });
  }

  // PATCH /projects/:id — admin or owner
  if (projectId && request.method === "PATCH") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.NOT_FOUND);
    if (ROLE_RANK[role] < ROLE_RANK["admin"]) return errorResponse(Errors.FORBIDDEN);

    const body = await request.json<{ name?: string; description?: string | null; publishedAt?: string | null; changelogMode?: string; vanitySlug?: string | null; aiEnabled?: boolean; aiSummarizationType?: string; homeDocEnabled?: boolean }>();
    if (body.name !== undefined && !body.name.trim()) return errorResponse(Errors.BAD_REQUEST);
    if (body.changelogMode !== undefined && !["off", "on", "enforced"].includes(body.changelogMode)) return errorResponse(Errors.BAD_REQUEST);
    if (body.aiSummarizationType !== undefined && !["automatic", "manual"].includes(body.aiSummarizationType)) return errorResponse(Errors.BAD_REQUEST);
    if (body.vanitySlug !== undefined && body.vanitySlug !== null) {
      if (!VANITY_SLUG_REGEX.test(body.vanitySlug) || body.vanitySlug.length < 3 || body.vanitySlug.length > 50) return errorResponse(Errors.BAD_REQUEST);
      const proj = await env.DB.prepare("SELECT features FROM projects WHERE id = ?").bind(projectId).first<{ features: number }>();
      if (!proj || !(proj.features & ProjectFeatures.CUSTOM_LINK)) return errorResponse(Errors.FORBIDDEN);
    }
    if (body.aiEnabled !== undefined) {
      const proj = await env.DB.prepare("SELECT features FROM projects WHERE id = ?").bind(projectId).first<{ features: number }>();
      if (!proj || !(proj.features & ProjectFeatures.AI_FEATURES)) return errorResponse(Errors.FORBIDDEN);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (body.name !== undefined) { fields.push("name = ?"); values.push(body.name.trim()); }
    if (body.description !== undefined) { fields.push("description = ?"); values.push(body.description ?? null); }
    if (body.publishedAt !== undefined) { fields.push("published_at = ?"); values.push(body.publishedAt ?? null); }
    if (body.changelogMode !== undefined) { fields.push("changelog_mode = ?"); values.push(body.changelogMode); }
    if (body.vanitySlug !== undefined) { fields.push("vanity_slug = ?"); values.push(body.vanitySlug ?? null); }
    if (body.aiEnabled !== undefined) { fields.push("ai_enabled = ?"); values.push(body.aiEnabled ? 1 : 0); }
    if (body.aiSummarizationType !== undefined) { fields.push("ai_summarization_type = ?"); values.push(body.aiSummarizationType); }
    if (body.homeDocEnabled === true) {
      const proj = await env.DB.prepare("SELECT home_doc_id FROM projects WHERE id = ?").bind(projectId).first<{ home_doc_id: string | null }>();
      if (!proj?.home_doc_id) {
        const docId = crypto.randomUUID();
        const now = new Date().toISOString();
        await env.ASSETS.put(`${projectId}/${docId}`, "");
        await env.DB.prepare(
          "INSERT INTO docs (id, title, project_id, author_id, folder_id, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)",
        ).bind(docId, "Home", projectId, user.userId, now, now).run();
        fields.push("home_doc_id = ?");
        values.push(docId);
      }
    } else if (body.homeDocEnabled === false) {
      fields.push("home_doc_id = ?");
      values.push(null);
    }
    if (fields.length === 0) return errorResponse(Errors.BAD_REQUEST);

    values.push(projectId);
    try {
      await env.DB.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("UNIQUE")) return errorResponse(Errors.CONFLICT);
      throw e;
    }

    const updated = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first<Project>();
    return okResponse(updated);
  }

  // DELETE /projects/:id — owner only
  if (projectId && request.method === "DELETE") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role !== "owner") return errorResponse(Errors.NOT_FOUND);

    // Collect all docs and their revisions for R2 cleanup
    const docs = await env.DB.prepare("SELECT id FROM docs WHERE project_id = ?").bind(projectId).all<{ id: string }>();
    const docIds = docs.results.map(d => d.id);

    const revisions = docIds.length > 0
      ? await env.DB.prepare(
          `SELECT asset_id, id FROM asset_revisions WHERE asset_type = 'doc' AND asset_id IN (${docIds.map(() => "?").join(",")})`,
        ).bind(...docIds).all<{ asset_id: string; id: string }>()
      : { results: [] };

    // Collect all files for R2 cleanup
    const files = await env.DB.prepare("SELECT id FROM files WHERE project_id = ?").bind(projectId).all<{ id: string }>();

    // Delete R2 assets in parallel
    await Promise.all([
      ...docIds.flatMap(docId => [
        env.ASSETS.delete(`${projectId}/${docId}`),
        env.ASSETS.delete(`${projectId}/${docId}.blame`),
      ]),
      ...revisions.results.map(r => env.ASSETS.delete(`${projectId}/${r.asset_id}/v/${r.id}`)),
      ...files.results.map(f => env.ASSETS.delete(`files/${f.id}`)),
    ]);

    // Delete orphaned asset_revisions (no cascade on this table)
    if (docIds.length > 0) {
      await env.DB.prepare(
        `DELETE FROM asset_revisions WHERE asset_type = 'doc' AND asset_id IN (${docIds.map(() => "?").join(",")})`,
      ).bind(...docIds).run();
    }

    await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(projectId).run();
    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
