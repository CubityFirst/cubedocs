import { requireAuthenticatedSession } from "../auth-session";
import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";

export async function handleTotpStatus(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  const user = await env.DB.prepare("SELECT totp_secret FROM users WHERE id = ?")
    .bind(session.userId)
    .first<{ totp_secret: string | null }>();
  if (!user) return errorResponse(Errors.NOT_FOUND);

  return okResponse({ enabled: user.totp_secret !== null });
}
