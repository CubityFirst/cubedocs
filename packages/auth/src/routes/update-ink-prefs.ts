import { requireAuthenticatedSession } from "../auth-session";
import { okResponse, errorResponse, Errors } from "../lib";
import { resolvePersonalPlan, isInkRingStyle, isInkPresenceColor } from "../plan";
import type { Env } from "../index";

// Patch Ink supporter cosmetic prefs: ring style + presence colour. Both
// fields are optional in the body; pass `null` to reset back to default
// (NULL on the row means "use the deterministic default" — see plan.ts).
//
// Gated on the caller having an active Ink plan via resolvePersonalPlan, so
// expired-grant or canceled-paid users can't keep tweaking. Refusing here
// rather than just hiding the UI in the frontend stops a pre-emptive
// downgrade race (sub canceled mid-session, user submits update before the
// JWT refresh) from silently writing.
export async function handleUpdateInkPrefs(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  const body = await request.json<{ style?: string | null; presenceColor?: string | null; critSparkles?: boolean | null }>();

  if (!("style" in body) && !("presenceColor" in body) && !("critSparkles" in body)) return errorResponse(Errors.BAD_REQUEST);

  if ("style" in body && body.style !== null && !isInkRingStyle(body.style)) {
    return errorResponse(Errors.BAD_REQUEST);
  }
  if ("presenceColor" in body && body.presenceColor !== null && !isInkPresenceColor(body.presenceColor)) {
    return errorResponse(Errors.BAD_REQUEST);
  }
  if ("critSparkles" in body && body.critSparkles !== null && typeof body.critSparkles !== "boolean") {
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

  const sets: string[] = [];
  const binds: unknown[] = [];
  if ("style" in body) {
    sets.push("personal_plan_style = ?");
    binds.push(body.style ?? null);
  }
  if ("presenceColor" in body) {
    sets.push("personal_presence_color = ?");
    binds.push(body.presenceColor ?? null);
  }
  if ("critSparkles" in body) {
    sets.push("personal_crit_sparkles = ?");
    // NULL means "use the default" (on). Persist 0/1 for explicit values.
    binds.push(body.critSparkles === null ? null : body.critSparkles ? 1 : 0);
  }
  binds.push(session.userId);

  await env.DB.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).bind(...binds).run();

  return okResponse({
    style: "style" in body ? (body.style ?? null) : resolved.style,
    presenceColor: "presenceColor" in body ? (body.presenceColor ?? null) : resolved.presenceColor,
    critSparkles: "critSparkles" in body ? (body.critSparkles ?? true) : resolved.critSparkles,
  });
}
