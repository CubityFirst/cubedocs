import { okResponse, errorResponse, Errors } from "../lib";
import { verifyWebauthnAssertion } from "../webauthn";
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

  if (body.challengeId && body.webauthnResponse) {
    // WebAuthn path — accepted regardless of whether TOTP is also enabled
    const assertionError = await verifyWebauthnAssertion(env, body.userId, body.challengeId, body.webauthnResponse, "webauthn-credentials-delete");
    if (assertionError) return assertionError;
  } else if (hasTOTP) {
    if (!body.totpCode) {
      return Response.json({ ok: false, error: "totp_required" }, { status: 200 });
    }
    const totpValid = await verifyTOTP(user.totp_secret!, body.totpCode);
    if (!totpValid) {
      return Response.json({ ok: false, error: "invalid_totp" }, { status: 401 });
    }
  } else {
    // No TOTP and no WebAuthn assertion provided
    return Response.json({ ok: false, error: "webauthn_required" }, { status: 200 });
  }

  const result = await env.DB.prepare(
    "DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?",
  ).bind(body.credentialId, body.userId).run();

  if (!result.meta.changes || result.meta.changes === 0) return errorResponse(Errors.NOT_FOUND);

  return okResponse({});
}
