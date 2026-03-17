import { okResponse, errorResponse, Errors } from "../lib";
import {
  consumeChallenge,
  verifyAuthenticationResponse,
  base64urlToUint8Array,
} from "../webauthn";
import { verifyTurnstile } from "../turnstile";
import { signJwt } from "../jwt";
import { checkModeration } from "./login";
import type { Env } from "../index";

export async function handleWebauthnAuthFinish(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    userId: string;
    challengeId: string;
    response: Record<string, unknown>;
    email: string;
    turnstileToken: string;
  }>();

  if (!body.userId || !body.challengeId || !body.response || !body.email || !body.turnstileToken) {
    return errorResponse(Errors.BAD_REQUEST);
  }

  const turnstileValid = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET);
  if (!turnstileValid) return errorResponse(Errors.BAD_REQUEST);

  const challenge = await consumeChallenge(env, body.challengeId, body.userId, "authentication");
  if (!challenge) return errorResponse(Errors.BAD_REQUEST);

  const user = await env.DB.prepare(
    "SELECT id, email, name, created_at, moderation FROM users WHERE id = ? AND email = ?",
  )
    .bind(body.userId, body.email.toLowerCase())
    .first<{ id: string; email: string; name: string; created_at: string; moderation: number }>();
  if (!user) return errorResponse(Errors.UNAUTHORIZED);

  const moderationResponse = checkModeration(user.moderation);
  if (moderationResponse) return moderationResponse;

  const credentialId = (body.response as { id: string }).id;
  const storedCred = await env.DB.prepare(
    "SELECT id, public_key, counter FROM webauthn_credentials WHERE id = ? AND user_id = ?",
  )
    .bind(credentialId, body.userId)
    .first<{ id: string; public_key: string; counter: number }>();
  if (!storedCred) return errorResponse(Errors.UNAUTHORIZED);

  let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
  try {
    verification = await verifyAuthenticationResponse({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: body.response as any,
      expectedChallenge: challenge,
      expectedOrigin: env.WEBAUTHN_ORIGIN,
      expectedRPID: env.WEBAUTHN_RP_ID,
      authenticator: {
        credentialID: base64urlToUint8Array(storedCred.id),
        credentialPublicKey: base64urlToUint8Array(storedCred.public_key),
        counter: storedCred.counter,
      },
    });
  } catch (err) {
    console.error("[webauthn-auth-finish] verifyAuthenticationResponse threw:", err);
    return errorResponse(Errors.UNAUTHORIZED);
  }

  if (!verification.verified || !verification.authenticationInfo) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  await env.DB.prepare("UPDATE webauthn_credentials SET counter = ? WHERE id = ?")
    .bind(verification.authenticationInfo.newCounter, storedCred.id)
    .run();

  const token = await signJwt(
    { userId: user.id, email: user.email, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 },
    env.JWT_SECRET,
  );

  return okResponse({
    token,
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.created_at },
  });
}
