import { requireAuthenticatedSession } from "../auth-session";
import { okResponse, errorResponse, Errors } from "../lib";
import { createRegistrationOptions } from "../webauthn";
import type { Env } from "../index";

export async function handleWebauthnRegisterStart(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  const user = await env.DB.prepare("SELECT name, email FROM users WHERE id = ?")
    .bind(session.userId).first<{ name: string; email: string }>();
  if (!user) return errorResponse(Errors.UNAUTHORIZED);

  const { options, challengeId } = await createRegistrationOptions(
    env,
    session.userId,
    user.name,
    user.email,
  );

  return okResponse({ options, challengeId });
}
