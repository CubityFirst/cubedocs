import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";

export async function handleLookup(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ email: string }>();
  if (!body.email) return errorResponse(Errors.BAD_REQUEST);

  const user = await env.DB.prepare(
    "SELECT id, email, name FROM users WHERE LOWER(email) = LOWER(?)",
  ).bind(body.email.trim()).first<{ id: string; email: string; name: string }>();

  if (!user) return errorResponse(Errors.NOT_FOUND);

  return okResponse({ userId: user.id, email: user.email, name: user.name });
}
