import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";

export async function handleUpdateName(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ userId: string; name: string }>();
  if (!body.userId || !body.name?.trim()) return errorResponse(Errors.BAD_REQUEST);

  const result = await env.DB.prepare(
    "UPDATE users SET name = ? WHERE id = ?",
  ).bind(body.name.trim(), body.userId).run();

  if (!result.meta.changes) return errorResponse(Errors.NOT_FOUND);

  return okResponse({ name: body.name.trim() });
}
