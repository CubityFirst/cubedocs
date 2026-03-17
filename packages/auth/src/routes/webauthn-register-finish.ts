import { okResponse, errorResponse, Errors } from "../lib";
import {
  consumeChallenge,
  verifyRegistrationResponse,
  uint8ArrayToBase64url,
} from "../webauthn";
import { requireMFA } from "../mfa";
import type { Env } from "../index";

export async function handleWebauthnRegisterFinish(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    userId: string;
    challengeId: string;
    response: Record<string, unknown>;
    name?: string;
    totpCode?: string;
    challengeId2fa?: string;
    webauthnResponse?: unknown;
  }>();
  if (!body.userId || !body.challengeId || !body.response) return errorResponse(Errors.BAD_REQUEST);

  const mfaError = await requireMFA(env, body.userId, {
    totpCode: body.totpCode,
    challengeId: body.challengeId2fa,
    webauthnResponse: body.webauthnResponse,
  });
  if (mfaError) return mfaError;

  const challenge = await consumeChallenge(env, body.challengeId, body.userId, "registration");
  if (!challenge) return errorResponse(Errors.BAD_REQUEST);

  let verification: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
  try {
    verification = await verifyRegistrationResponse({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: body.response as any,
      expectedChallenge: challenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
    });
  } catch (err) {
    console.error("[webauthn-register-finish] verifyRegistrationResponse threw:", err);
    return errorResponse(Errors.BAD_REQUEST);
  }

  if (!verification.verified || !verification.registrationInfo) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;
  const credentialId = uint8ArrayToBase64url(credentialID);
  const publicKey = uint8ArrayToBase64url(credentialPublicKey);

  await env.DB.prepare(
    "INSERT INTO webauthn_credentials (id, user_id, name, public_key, counter, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(credentialId, body.userId, body.name ?? "Security Key", publicKey, counter, new Date().toISOString())
    .run();

  return okResponse({ credentialId });
}
