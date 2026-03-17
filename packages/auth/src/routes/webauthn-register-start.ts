import { okResponse, errorResponse, Errors } from "../lib";
import { createRegistrationOptions } from "../webauthn";
import type { Env } from "../index";

export async function handleWebauthnRegisterStart(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ userId: string }>();
  if (!body.userId) return errorResponse(Errors.BAD_REQUEST);

  const user = await env.DB.prepare("SELECT name, email FROM users WHERE id = ?")
    .bind(body.userId).first<{ name: string; email: string }>();
  if (!user) return errorResponse(Errors.UNAUTHORIZED);

  const { options, challengeId } = await createRegistrationOptions(
    env,
    body.userId,
    user.name,
    user.email,
  );

  return okResponse({ options, challengeId });
}
