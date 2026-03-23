import { requireAuthenticatedSession } from "../auth-session";
import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";

export async function handleWebauthnCredentialsList(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  const result = await env.DB.prepare(
    "SELECT id, name, created_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at ASC",
  ).bind(session.userId).all<{ id: string; name: string; created_at: string }>();

  return okResponse({ credentials: result.results });
}
