import { okResponse, errorResponse, Errors } from "../lib";
import {
  consumeChallenge,
  verifyAuthenticationResponse,
  base64urlToUint8Array,
} from "../webauthn";
import { verifyTOTP } from "../totp";
import type { Env } from "../index";

export async function handleWebauthnCredentialsDelete(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    userId: string;
    credentialId: string;
    totpCode?: string;
    challengeId?: string;
    webauthnResponse?: Record<string, unknown>;
  }>();
  if (!body.userId || !body.credentialId) return errorResponse(Errors.BAD_REQUEST);

  const user = await env.DB.prepare(
    "SELECT totp_secret FROM users WHERE id = ?",
  ).bind(body.userId).first<{ totp_secret: string | null }>();
  if (!user) return errorResponse(Errors.UNAUTHORIZED);

  const hasTOTP = !!user.totp_secret;

  if (hasTOTP) {
    if (!body.totpCode) {
      return Response.json({ ok: false, error: "totp_required" }, { status: 200 });
    }
    const totpValid = await verifyTOTP(user.totp_secret!, body.totpCode);
    if (!totpValid) {
      return Response.json({ ok: false, error: "invalid_totp" }, { status: 401 });
    }
  } else {
    // WebAuthn-only: require a completed authentication assertion
    if (!body.challengeId || !body.webauthnResponse) {
      return Response.json({ ok: false, error: "webauthn_required" }, { status: 200 });
    }

    const challenge = await consumeChallenge(env, body.challengeId, body.userId, "authentication");
    if (!challenge) return errorResponse(Errors.BAD_REQUEST);

    const responseId = (body.webauthnResponse as { id: string }).id;
    const storedCred = await env.DB.prepare(
      "SELECT id, public_key, counter FROM webauthn_credentials WHERE id = ? AND user_id = ?",
    ).bind(responseId, body.userId).first<{ id: string; public_key: string; counter: number }>();
    if (!storedCred) return errorResponse(Errors.UNAUTHORIZED);

    let verification: Awaited<ReturnType<typeof verifyAuthenticationResponse>>;
    try {
      verification = await verifyAuthenticationResponse({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response: body.webauthnResponse as any,
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
      console.error("[webauthn-credentials-delete] verifyAuthenticationResponse threw:", err);
      return errorResponse(Errors.UNAUTHORIZED);
    }

    if (!verification.verified || !verification.authenticationInfo) {
      return errorResponse(Errors.UNAUTHORIZED);
    }

    // Update counter even when deleting to prevent replay on other endpoints
    await env.DB.prepare("UPDATE webauthn_credentials SET counter = ? WHERE id = ?")
      .bind(verification.authenticationInfo.newCounter, storedCred.id)
      .run();
  }

  const result = await env.DB.prepare(
    "DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?",
  ).bind(body.credentialId, body.userId).run();

  if (!result.meta.changes || result.meta.changes === 0) return errorResponse(Errors.NOT_FOUND);

  return okResponse({});
}
