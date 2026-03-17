import { okResponse, errorResponse, Errors } from "../lib";
import { requireMFA } from "../mfa";
import type { Env } from "../index";

export async function handleTotpDisable(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    userId: string;
    totpCode?: string;
    challengeId?: string;
    webauthnResponse?: unknown;
  }>();
  if (!body.userId) return errorResponse(Errors.BAD_REQUEST);

  const user = await env.DB.prepare(
    "SELECT totp_secret FROM users WHERE id = ?",
  ).bind(body.userId).first<{ totp_secret: string | null }>();
  if (!user) return errorResponse(Errors.NOT_FOUND);
  if (!user.totp_secret) return errorResponse(Errors.BAD_REQUEST);

  const mfaError = await requireMFA(env, body.userId, {
    totpCode: body.totpCode,
    challengeId: body.challengeId,
    webauthnResponse: body.webauthnResponse,
  });
  if (mfaError) return mfaError;

  await env.DB.prepare("UPDATE users SET totp_secret = NULL WHERE id = ?")
    .bind(body.userId)
    .run();

  return okResponse({});
}
