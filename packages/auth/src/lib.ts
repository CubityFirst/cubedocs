export interface Session {
  userId: string;
  email: string;
  expiresAt: number;
  isAdmin?: boolean;
  forcePasswordChange?: true;
  // Server-side session row id. Required for normal sessions; absent on
  // the short-lived "force password change" token.
  sid?: string;
  // Force-change-token nonce. Set only on `forcePasswordChange: true`
  // tokens; mirrored on `users.change_token_id`. Re-issuing the token
  // overwrites the row, invalidating any prior unused token.
  cti?: string;
  // Resolved per-user plan, computed by resolvePersonalPlan() when the
  // session is loaded. Optional so JWT-only consumers (no DB hit) and
  // the api worker's filtered session don't need to populate them.
  personalPlan?: "free" | "ink";
  personalPlanSince?: number | null;
  personalPlanStatus?: string | null;
  personalPlanCancelAt?: number | null;
  personalPlanStyle?: string | null;
  personalPresenceColor?: string | null;
}

export const Errors = {
  UNAUTHORIZED: { error: "Unauthorized", status: 401 },
  FORBIDDEN:    { error: "Forbidden", status: 403 },
  NOT_FOUND:    { error: "Not found", status: 404 },
  CONFLICT:     { error: "Already exists", status: 409 },
  BAD_REQUEST:  { error: "Bad request", status: 400 },
  INTERNAL:     { error: "Internal server error", status: 500 },
  RATE_LIMITED: { error: "rate_limited", status: 429 },
} as const;

export function errorResponse(err: typeof Errors[keyof typeof Errors]): Response {
  return Response.json({ ok: false, ...err }, { status: err.status });
}

export function okResponse<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}
