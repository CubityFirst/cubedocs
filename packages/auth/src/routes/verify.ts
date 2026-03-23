import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";
import { verifyCurrentSessionToken } from "../session";

export async function handleVerify(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse(Errors.UNAUTHORIZED);

  const session = await verifyCurrentSessionToken(authHeader.slice(7), env);
  if (!session) return errorResponse(Errors.UNAUTHORIZED);

  return okResponse(session);
}
