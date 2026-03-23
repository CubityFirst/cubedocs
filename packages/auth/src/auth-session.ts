import type { Env } from "./index";
import { verifyJwt } from "./jwt";
import { errorResponse, Errors, type Session } from "./lib";

export async function requireAuthenticatedSession(
  request: Request,
  env: Env,
): Promise<Session | Response> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse(Errors.UNAUTHORIZED);

  const session = await verifyJwt(authHeader.slice(7), env.JWT_SECRET);
  if (!session || session.forcePasswordChange) return errorResponse(Errors.UNAUTHORIZED);

  return session;
}
