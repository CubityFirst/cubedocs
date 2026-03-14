import { okResponse, errorResponse, Errors } from "../lib";
import { verifyJwt } from "../jwt";
import type { Env } from "../index";

export async function handleVerify(request: Request, env: Env): Promise<Response> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return errorResponse(Errors.UNAUTHORIZED);

  const token = authHeader.slice(7);
  const session = await verifyJwt(token, env.JWT_SECRET);
  if (!session) return errorResponse(Errors.UNAUTHORIZED);

  return okResponse(session);
}
