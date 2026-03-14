import { okResponse, errorResponse, Errors, ROLE_RANK, type Role, type Member } from "../lib";
import type { Env } from "../index";
import type { Session } from "../lib";

const VALID_ROLES: Role[] = ["viewer", "editor", "admin", "owner"];

interface ProjectRow { owner_id: string; owner_email?: string; owner_name?: string }
interface MemberRow {
  id: string; project_id: string; user_id: string; email: string; name: string;
  role: Role; invited_by: string; created_at: string;
}

// Returns the caller's effective role in the project, or null if not a member.
async function getCallerRole(db: D1Database, projectId: string, userId: string): Promise<Role | null> {
  const project = await db.prepare("SELECT owner_id FROM projects WHERE id = ?")
    .bind(projectId).first<{ owner_id: string }>();
  if (!project) return null;
  if (project.owner_id === userId) return "owner";
  const row = await db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?")
    .bind(projectId, userId).first<{ role: Role }>();
  return row?.role ?? null;
}

export async function handleMembers(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  // URL pattern: /projects/:projectId/members[/:userId]
  const match = url.pathname.match(/^\/projects\/([^/]+)\/members\/?([^/]*)$/);
  if (!match) return errorResponse(Errors.NOT_FOUND);
  const projectId = match[1];
  const targetUserId = match[2] || null;

  const callerRole = await getCallerRole(env.DB, projectId, user.userId);
  if (callerRole === null) return errorResponse(Errors.NOT_FOUND);

  // GET /projects/:id/members — admin/owner can list
  if (!targetUserId && request.method === "GET") {
    if (ROLE_RANK[callerRole] < ROLE_RANK["admin"]) return errorResponse(Errors.FORBIDDEN);

    const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?")
      .bind(projectId).first<ProjectRow>();
    if (!project) return errorResponse(Errors.NOT_FOUND);

    // Look up the owner's details from the auth worker
    const ownerLookupRes = await env.AUTH.fetch("https://auth/lookup-by-id", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: project.owner_id }),
    });
    let ownerEmail = "";
    let ownerName = "";
    if (ownerLookupRes.ok) {
      const ownerData = await ownerLookupRes.json<{ ok: boolean; data?: { email: string; name: string } }>();
      if (ownerData.ok && ownerData.data) {
        ownerEmail = ownerData.data.email;
        ownerName = ownerData.data.name;
      }
    }

    const rows = await env.DB.prepare(
      "SELECT * FROM project_members WHERE project_id = ? ORDER BY created_at ASC",
    ).bind(projectId).all<MemberRow>();

    const members = rows.results.map(r => ({
      id: r.id,
      projectId: r.project_id,
      userId: r.user_id,
      email: r.email,
      name: r.name,
      role: r.role,
      invitedBy: r.invited_by,
      createdAt: r.created_at,
    }));

    // Prepend owner as a synthetic entry
    const ownerEntry: Member = {
      id: `owner-${project.owner_id}`,
      projectId,
      userId: project.owner_id,
      email: ownerEmail,
      name: ownerName,
      role: "owner",
      invitedBy: project.owner_id,
      createdAt: "",
    };

    return okResponse([ownerEntry, ...members]);
  }

  // POST /projects/:id/members — admin/owner can invite
  if (!targetUserId && request.method === "POST") {
    if (ROLE_RANK[callerRole] < ROLE_RANK["admin"]) return errorResponse(Errors.FORBIDDEN);

    const body = await request.json<{ email: string; role: Role }>();
    if (!body.email || !body.role) return errorResponse(Errors.BAD_REQUEST);
    if (!VALID_ROLES.includes(body.role) || body.role === "owner") return errorResponse(Errors.BAD_REQUEST);

    // Look up the user by email from auth worker
    const lookupRes = await env.AUTH.fetch("https://auth/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: body.email }),
    });

    if (!lookupRes.ok) {
      if (lookupRes.status === 404) {
        return Response.json({ ok: false, error: "No user found with that email address.", status: 404 }, { status: 404 });
      }
      return errorResponse(Errors.INTERNAL);
    }

    const lookupData = await lookupRes.json<{ ok: boolean; data?: { userId: string; email: string; name: string } }>();
    if (!lookupData.ok || !lookupData.data) return errorResponse(Errors.INTERNAL);

    const { userId: inviteeId, email: inviteeEmail, name: inviteeName } = lookupData.data;

    // Prevent inviting the project owner
    const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?")
      .bind(projectId).first<{ owner_id: string }>();
    if (!project) return errorResponse(Errors.NOT_FOUND);
    if (project.owner_id === inviteeId) {
      return Response.json({ ok: false, error: "Cannot add the project owner as a member.", status: 409 }, { status: 409 });
    }

    // Check if already a member
    const existing = await env.DB.prepare("SELECT id FROM project_members WHERE project_id = ? AND user_id = ?")
      .bind(projectId, inviteeId).first();
    if (existing) return errorResponse(Errors.CONFLICT);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO project_members (id, project_id, user_id, email, name, role, invited_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, projectId, inviteeId, inviteeEmail, inviteeName, body.role, user.userId, now).run();

    return okResponse({ id, projectId, userId: inviteeId, email: inviteeEmail, name: inviteeName, role: body.role, invitedBy: user.userId, createdAt: now }, 201);
  }

  // PATCH /projects/:id/members/:userId — admin/owner can change roles
  if (targetUserId && request.method === "PATCH") {
    if (ROLE_RANK[callerRole] < ROLE_RANK["admin"]) return errorResponse(Errors.FORBIDDEN);

    const body = await request.json<{ role: Role }>();
    if (!body.role || !VALID_ROLES.includes(body.role) || body.role === "owner") return errorResponse(Errors.BAD_REQUEST);

    // Prevent changing the project owner's role
    const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?")
      .bind(projectId).first<{ owner_id: string }>();
    if (!project) return errorResponse(Errors.NOT_FOUND);
    if (project.owner_id === targetUserId) return errorResponse(Errors.FORBIDDEN);

    const row = await env.DB.prepare("SELECT id, role FROM project_members WHERE project_id = ? AND user_id = ?")
      .bind(projectId, targetUserId).first<{ id: string; role: Role }>();
    if (!row) return errorResponse(Errors.NOT_FOUND);

    // Admins cannot promote to admin or above
    if (callerRole === "admin" && ROLE_RANK[body.role] >= ROLE_RANK["admin"]) {
      return errorResponse(Errors.FORBIDDEN);
    }
    // Admins cannot change another admin's role
    if (callerRole === "admin" && ROLE_RANK[row.role] >= ROLE_RANK["admin"]) {
      return errorResponse(Errors.FORBIDDEN);
    }

    await env.DB.prepare("UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?")
      .bind(body.role, projectId, targetUserId).run();

    const updated = await env.DB.prepare("SELECT * FROM project_members WHERE project_id = ? AND user_id = ?")
      .bind(projectId, targetUserId).first<MemberRow>();
    if (!updated) return errorResponse(Errors.NOT_FOUND);

    return okResponse({
      id: updated.id, projectId: updated.project_id, userId: updated.user_id,
      email: updated.email, name: updated.name, role: updated.role,
      invitedBy: updated.invited_by, createdAt: updated.created_at,
    });
  }

  // DELETE /projects/:id/members/:userId — admin/owner can remove
  if (targetUserId && request.method === "DELETE") {
    if (ROLE_RANK[callerRole] < ROLE_RANK["admin"]) return errorResponse(Errors.FORBIDDEN);

    // Prevent removing the project owner
    const project = await env.DB.prepare("SELECT owner_id FROM projects WHERE id = ?")
      .bind(projectId).first<{ owner_id: string }>();
    if (!project) return errorResponse(Errors.NOT_FOUND);
    if (project.owner_id === targetUserId) return errorResponse(Errors.FORBIDDEN);

    const row = await env.DB.prepare("SELECT id, role FROM project_members WHERE project_id = ? AND user_id = ?")
      .bind(projectId, targetUserId).first<{ id: string; role: Role }>();
    if (!row) return errorResponse(Errors.NOT_FOUND);

    // Admins cannot remove other admins
    if (callerRole === "admin" && ROLE_RANK[row.role] >= ROLE_RANK["admin"]) {
      return errorResponse(Errors.FORBIDDEN);
    }

    await env.DB.prepare("DELETE FROM project_members WHERE project_id = ? AND user_id = ?")
      .bind(projectId, targetUserId).run();

    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
