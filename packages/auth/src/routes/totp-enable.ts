import { okResponse, errorResponse, Errors } from "../lib";
import { verifyTOTP } from "../totp";
import { requireMFA } from "../mfa";
import type { Env } from "../index";

export async function handleTotpEnable(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    userId: string;
    secret: string;
    code: string;
    totpCode?: string;
    challengeId?: string;
    webauthnResponse?: unknown;
  }>();
  if (!body.userId || !body.secret || !body.code) return errorResponse(Errors.BAD_REQUEST);

  const existing = await env.DB.prepare(
    "SELECT totp_secret FROM users WHERE id = ?",
  ).bind(body.userId).first<{ totp_secret: string | null }>();
  if (!existing) return errorResponse(Errors.NOT_FOUND);

  if (existing.totp_secret) {
    return Response.json({ ok: false, error: "totp_already_enabled" }, { status: 400 });
  }

  const mfaError = await requireMFA(env, body.userId, {
    totpCode: body.totpCode,
    challengeId: body.challengeId,
    webauthnResponse: body.webauthnResponse,
  });
  if (mfaError) return mfaError;

  const valid = await verifyTOTP(body.secret, body.code);
  if (!valid) return errorResponse(Errors.UNAUTHORIZED);

  await env.DB.prepare("UPDATE users SET totp_secret = ? WHERE id = ?")
    .bind(body.secret, body.userId)
    .run();

  return okResponse({});
}
