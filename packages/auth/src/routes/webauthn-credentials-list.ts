import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";

export async function handleWebauthnCredentialsList(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ userId: string }>();
  if (!body.userId) return errorResponse(Errors.BAD_REQUEST);

  const result = await env.DB.prepare(
    "SELECT id, name, created_at FROM webauthn_credentials WHERE user_id = ? ORDER BY created_at ASC",
  ).bind(body.userId).all<{ id: string; name: string; created_at: string }>();

  return okResponse({ credentials: result.results });
}
