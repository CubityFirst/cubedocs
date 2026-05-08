import type { Session } from "./lib";
import type { Env } from "./index";
import { loadCurrentSession, sessionResultToResponse } from "../../auth/src/session";

// Verifies the JWT and re-derives the session against the auth DB inline.
// Reads `users` + `sessions` directly via the AUTH_DB binding (one D1 batch),
// rather than round-tripping through the auth worker's /verify route, which
// would double the billable Worker invocations on every API request.
//
// Returns:
//   Session  — authenticated; account is in good standing.
//   Response — token was valid but the account is disabled / suspended.
//              Pass this response straight back to the client.
//   null     — no/malformed Authorization header, or the token itself was
//              invalid/expired. Caller maps this to a generic 401.
export async function authenticate(request: Request, env: Env): Promise<Session | Response | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const result = await loadCurrentSession(authHeader.slice(7), env.AUTH_DB, env.JWT_SECRET);
  if (result.kind === "ok") {
    return {
      userId: result.session.userId,
      email: result.session.email,
      expiresAt: result.session.expiresAt,
    };
  }
  if (result.kind === "invalid") return null;
  return sessionResultToResponse(result);
}
