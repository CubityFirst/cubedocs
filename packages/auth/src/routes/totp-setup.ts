import { requireAuthenticatedSession } from "../auth-session";
import { okResponse, errorResponse, Errors } from "../lib";
import { generateSecret, buildOtpauthUri } from "../totp";
import type { Env } from "../index";

export async function handleTotpSetup(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  const user = await env.DB.prepare("SELECT email FROM users WHERE id = ?")
    .bind(session.userId)
    .first<{ email: string }>();
  if (!user) return errorResponse(Errors.NOT_FOUND);

  const secret = generateSecret();
  const uri = buildOtpauthUri(secret, user.email);

  return okResponse({ secret, uri });
}
