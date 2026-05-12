import { verifyJwt } from "./jwt";
import { errorResponse, Errors, type Session } from "./lib";
import { resolvePersonalPlan } from "./plan";

interface SessionUserRow {
  id: string;
  email: string;
  moderation: number;
  force_password_change: number;
  is_admin: number;
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
  reading_font: string | null;
  editing_font: string | null;
  ui_font: string | null;
}

interface SessionStateRow {
  id: string;
  expires_at: number;
  revoked_at: number | null;
  last_used_at: number;
}

export type SessionLoadResult =
  | { kind: "ok"; session: Session }
  | { kind: "disabled" }
  | { kind: "suspended"; until: number }
  | { kind: "invalid" };

// How stale `last_used_at` is allowed to get before a refresh write.
// 10 min is fine-grained enough for the "Active sessions" UI without
// turning every authenticated request into a database write.
const LAST_USED_REFRESH_MS = 10 * 60 * 1000;

// Loads, validates, and re-derives a session in a single D1 round-trip.
// One batch fetches both the user row (for moderation / admin / forced-reset
// state) and the matching session row (for revocation / expiry). The JWT
// itself is treated as proof of authentication, never as a source of truth
// for any claim that can change.
//
// Takes `db` + `jwtSecret` as primitives rather than an `Env` so the API
// worker can reuse this against its `AUTH_DB` binding without depending on
// the auth worker's specific Env shape.
//
// `ctx` is optional: when provided (the per-request /verify path), a stale
// `last_used_at` triggers a fire-and-forget refresh via waitUntil. Routes
// that aren't on the hot path can omit it and skip the bookkeeping.
export async function loadCurrentSession(
  token: string,
  db: D1Database,
  jwtSecret: string,
  ctx?: ExecutionContext,
): Promise<SessionLoadResult> {
  const tokenSession = await verifyJwt(token, jwtSecret);
  if (!tokenSession || tokenSession.forcePasswordChange) return { kind: "invalid" };
  if (!tokenSession.sid) return { kind: "invalid" };

  const [userResult, sessionResult] = await db.batch([
    db.prepare(
      `SELECT id, email, moderation, force_password_change, is_admin,
              personal_plan, personal_plan_status, personal_plan_started_at,
              personal_plan_cancel_at, personal_plan_style, personal_presence_color,
              personal_crit_sparkles,
              granted_plan, granted_plan_expires_at, granted_plan_started_at,
              reading_font, editing_font, ui_font
       FROM users WHERE id = ?`,
    ).bind(tokenSession.userId),
    db.prepare(
      "SELECT id, expires_at, revoked_at, last_used_at FROM sessions WHERE id = ? AND user_id = ?",
    ).bind(tokenSession.sid, tokenSession.userId),
  ]);

  const user = (userResult.results as SessionUserRow[])[0];
  const sessionRow = (sessionResult.results as SessionStateRow[])[0];

  if (!user) return { kind: "invalid" };
  if (user.force_password_change) return { kind: "invalid" };

  if (!sessionRow) return { kind: "invalid" };
  if (sessionRow.revoked_at !== null) return { kind: "invalid" };
  const now = Date.now();
  if (sessionRow.expires_at <= now) return { kind: "invalid" };

  // Account moderation states take priority so the frontend can show a
  // specific message instead of a generic "session expired."
  if (user.moderation === -1) return { kind: "disabled" };
  if (user.moderation > 0) {
    const nowSeconds = Math.floor(now / 1000);
    if (nowSeconds < user.moderation) {
      return { kind: "suspended", until: user.moderation };
    }
  }

  // Lazy "last seen" bookkeeping. Bounded to one write per session per
  // ~10 min regardless of request rate; runs after the response is sent.
  if (ctx && now - sessionRow.last_used_at > LAST_USED_REFRESH_MS) {
    ctx.waitUntil(
      db.prepare("UPDATE sessions SET last_used_at = ? WHERE id = ?")
        .bind(now, sessionRow.id).run(),
    );
  }

  const resolved = resolvePersonalPlan({
    granted_plan: user.granted_plan,
    granted_plan_expires_at: user.granted_plan_expires_at,
    granted_plan_started_at: user.granted_plan_started_at,
    personal_plan: user.personal_plan,
    personal_plan_status: user.personal_plan_status,
    personal_plan_started_at: user.personal_plan_started_at,
    personal_plan_cancel_at: user.personal_plan_cancel_at,
    personal_plan_style: user.personal_plan_style,
    personal_presence_color: user.personal_presence_color,
    personal_crit_sparkles: user.personal_crit_sparkles,
  }, now);

  return {
    kind: "ok",
    session: {
      userId: user.id,
      email: user.email,
      expiresAt: tokenSession.expiresAt,
      isAdmin: Boolean(user.is_admin),
      sid: sessionRow.id,
      personalPlan: resolved.plan,
      personalPlanSince: resolved.since,
      personalPlanStatus: resolved.status,
      personalPlanCancelAt: resolved.cancelAt,
      personalPlanStyle: resolved.style,
      personalPresenceColor: resolved.presenceColor,
      personalCritSparkles: resolved.critSparkles,
      readingFont: user.reading_font,
      editingFont: user.editing_font,
      uiFont: user.ui_font,
    },
  };
}

export async function requireCurrentSessionToken(token: string, db: D1Database, jwtSecret: string): Promise<Session | Response> {
  const result = await loadCurrentSession(token, db, jwtSecret);
  if (result.kind === "ok") return result.session;
  return sessionResultToResponse(result);
}

export function sessionResultToResponse(
  result: Exclude<SessionLoadResult, { kind: "ok" }>,
): Response {
  if (result.kind === "disabled") {
    return Response.json({ ok: false, error: "account_disabled" }, { status: 403 });
  }
  if (result.kind === "suspended") {
    return Response.json({ ok: false, error: "account_suspended", until: result.until }, { status: 403 });
  }
  return errorResponse(Errors.UNAUTHORIZED);
}
