import { requireAuthenticatedSession } from "../auth-session";
import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";

export async function handleUpdateName(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ name: string }>();
  if (!body.name?.trim()) return errorResponse(Errors.BAD_REQUEST);

  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  if (typeof body.name !== "string" || body.name.trim().length === 0 || body.name.length > 100) {
    return errorResponse(Errors.BAD_REQUEST);
  }

  const result = await env.DB.prepare(
    "UPDATE users SET name = ? WHERE id = ?",
  ).bind(body.name.trim(), session.userId).run();

  if (!result.meta.changes) return errorResponse(Errors.NOT_FOUND);

  return okResponse({ name: body.name.trim() });
}
