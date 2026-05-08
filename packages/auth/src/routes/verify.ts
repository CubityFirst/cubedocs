import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";
import { loadCurrentSession, sessionResultToResponse } from "../session";

export async function handleVerify(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse(Errors.UNAUTHORIZED);

  const result = await loadCurrentSession(authHeader.slice(7), env.DB, env.JWT_SECRET, ctx);
  if (result.kind === "ok") return okResponse(result.session);
  return sessionResultToResponse(result);
}
