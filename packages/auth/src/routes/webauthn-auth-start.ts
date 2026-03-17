import { okResponse, errorResponse, Errors } from "../lib";
import { createAuthenticationOptions } from "../webauthn";
import type { Env } from "../index";

export async function handleWebauthnAuthStart(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ userId: string }>();
  if (!body.userId) return errorResponse(Errors.BAD_REQUEST);

  const user = await env.DB.prepare("SELECT id FROM users WHERE id = ?")
    .bind(body.userId).first<{ id: string }>();
  if (!user) return errorResponse(Errors.UNAUTHORIZED);

  const { options, challengeId } = await createAuthenticationOptions(env, body.userId);

  return okResponse({ options, challengeId });
}
