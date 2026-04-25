import { okResponse, errorResponse, Errors, type Role } from "../lib";
import type { Env } from "../index";
import type { Session } from "../lib";

interface PendingRow {
  id: string;
  project_id: string;
  user_id: string;
  role: Role;
  invited_by: string;
  created_at: string;
  project_name: string;
  project_description: string | null;
  inviter_name: string | null;
}

export async function handlePendingInvites(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  // GET /pending-invites
  if (request.method === "GET" && url.pathname === "/pending-invites") {
    const rows = await env.DB.prepare(
      `SELECT pm.id, pm.project_id, pm.user_id, pm.role, pm.invited_by, pm.created_at,
              p.name as project_name, p.description as project_description,
              COALESCE(pm_inv.name, 'Unknown') as inviter_name
       FROM project_members pm
       JOIN projects p ON p.id = pm.project_id
       LEFT JOIN project_members pm_inv ON pm_inv.project_id = pm.project_id AND pm_inv.user_id = pm.invited_by AND pm_inv.accepted = 1
       WHERE pm.user_id = ? AND pm.accepted = 0
       ORDER BY pm.created_at DESC`,
    ).bind(user.userId).all<PendingRow>();

    return okResponse(rows.results.map(r => ({
      id: r.id,
      projectId: r.project_id,
      role: r.role,
      invitedBy: r.invited_by,
      inviterName: r.inviter_name ?? "Unknown",
      createdAt: r.created_at,
      projectName: r.project_name,
      projectDescription: r.project_description,
    })));
  }

  // POST /pending-invites/:id/accept
  const acceptMatch = url.pathname.match(/^\/pending-invites\/([^/]+)\/accept$/);
  if (acceptMatch && request.method === "POST") {
    const inviteId = acceptMatch[1];
    const row = await env.DB.prepare(
      "SELECT id FROM project_members WHERE id = ? AND user_id = ? AND accepted = 0",
    ).bind(inviteId, user.userId).first();
    if (!row) return errorResponse(Errors.NOT_FOUND);

    await env.DB.prepare("UPDATE project_members SET accepted = 1 WHERE id = ?")
      .bind(inviteId).run();

    return okResponse({ accepted: true });
  }

  // DELETE /pending-invites/:id (decline)
  const declineMatch = url.pathname.match(/^\/pending-invites\/([^/]+)$/);
  if (declineMatch && request.method === "DELETE") {
    const inviteId = declineMatch[1];
    const row = await env.DB.prepare(
      "SELECT id FROM project_members WHERE id = ? AND user_id = ? AND accepted = 0",
    ).bind(inviteId, user.userId).first();
    if (!row) return errorResponse(Errors.NOT_FOUND);

    await env.DB.prepare("DELETE FROM project_members WHERE id = ?")
      .bind(inviteId).run();

    return okResponse({ declined: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
