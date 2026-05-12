import { requireAuthenticatedSession } from "../auth-session";
import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";

export async function handleUpdateTimezone(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  const body = await request.json<{ timezone: string | null }>();

  if (body.timezone !== null) {
    if (typeof body.timezone !== "string") return errorResponse(Errors.BAD_REQUEST);
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: body.timezone });
    } catch {
      return errorResponse(Errors.BAD_REQUEST);
    }
  }

  await env.DB.prepare(
    `INSERT INTO user_preferences (user_id, timezone) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET timezone = excluded.timezone`,
  ).bind(session.userId, body.timezone).run();

  return okResponse({ timezone: body.timezone });
}
