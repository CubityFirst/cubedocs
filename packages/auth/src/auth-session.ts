import type { Env } from "./index";
import { errorResponse, Errors, type Session } from "./lib";
import { requireCurrentSessionToken } from "./session";

export async function requireAuthenticatedSession(
  request: Request,
  env: Env,
): Promise<Session | Response> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse(Errors.UNAUTHORIZED);

  return requireCurrentSessionToken(authHeader.slice(7), env.DB, env.JWT_SECRET);
}
