import { requireAuthenticatedSession } from "../auth-session";
import { okResponse, errorResponse, Errors } from "../lib";
import { resolvePersonalPlan } from "../plan";
import type { Env } from "../index";

const MAX_BIO_LENGTH = 280;

// PATCH the supporter bio. Pass `null` (or empty/whitespace string) to clear.
//
// Gated to active Ink plan via resolvePersonalPlan, mirroring update-ink-prefs:
// refusing here rather than just hiding the UI prevents a downgrade race
// (sub canceled mid-session, request submitted before JWT refresh) from
// silently writing.
export async function handleUpdateBio(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  const body = await request.json<{ bio?: string | null }>();
  if (!("bio" in body)) return errorResponse(Errors.BAD_REQUEST);

  let normalized: string | null;
  if (body.bio === null) {
    normalized = null;
  } else if (typeof body.bio === "string") {
    const trimmed = body.bio.trim();
    if (trimmed.length === 0) {
      normalized = null;
    } else if (trimmed.length > MAX_BIO_LENGTH) {
      return errorResponse(Errors.BAD_REQUEST);
    } else {
      normalized = trimmed;
    }
  } else {
    return errorResponse(Errors.BAD_REQUEST);
  }

  const planRow = await env.DB.prepare(
    `SELECT personal_plan, personal_plan_status, personal_plan_started_at,
            personal_plan_cancel_at, personal_plan_style, personal_presence_color,
            personal_crit_sparkles,
            granted_plan, granted_plan_expires_at, granted_plan_started_at
     FROM users WHERE id = ?`,
  ).bind(session.userId).first<{
    personal_plan: string | null;
    personal_plan_status: string | null;
    personal_plan_started_at: number | null;
    personal_plan_cancel_at: number | null;
    personal_plan_style: string | null;
    personal_presence_color: string | null;
    personal_crit_sparkles: number | null;
    granted_plan: string | null;
    granted_plan_expires_at: number | null;
    granted_plan_started_at: number | null;
  }>();
  if (!planRow) return errorResponse(Errors.NOT_FOUND);

  const resolved = resolvePersonalPlan(planRow);
  if (resolved.plan !== "ink") return errorResponse(Errors.FORBIDDEN);

  await env.DB.prepare("UPDATE users SET bio = ? WHERE id = ?")
    .bind(normalized, session.userId).run();

  return okResponse({ bio: normalized });
}
