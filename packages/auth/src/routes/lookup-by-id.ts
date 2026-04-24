import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";

export async function handleLookupById(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ userId?: string }>();
  if (!body.userId) return errorResponse(Errors.BAD_REQUEST);

  const user = await env.DB.prepare(
    "SELECT id, email, name FROM users WHERE id = ?",
  ).bind(body.userId).first<{ id: string; email: string; name: string }>();

  if (!user) return errorResponse(Errors.NOT_FOUND);

  return okResponse({ userId: user.id, email: user.email, name: user.name });
}
