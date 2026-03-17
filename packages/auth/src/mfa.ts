import { verifyWebauthnAssertion } from "./webauthn";
import { verifyTOTP } from "./totp";
import type { Env } from "./index";

export type MFAVerification = {
  totpCode?: string;
  challengeId?: string;
  webauthnResponse?: unknown;
};

/**
 * Enforces MFA for a given user.
 *
 * - If the user has no MFA configured, returns null (allow through).
 * - If the user has MFA and a valid verification is provided, returns null.
 * - Otherwise returns an error Response.
 *
 * Priority: WebAuthn assertion (if provided) is accepted regardless of
 * whether TOTP is also enabled. Falls back to TOTP if no assertion given.
 */
export async function requireMFA(
  env: Env,
  userId: string,
  verification: MFAVerification,
): Promise<Response | null> {
  const user = await env.DB.prepare(
    "SELECT totp_secret FROM users WHERE id = ?",
  ).bind(userId).first<{ totp_secret: string | null }>();
  if (!user) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });

  const hasTOTP = !!user.totp_secret;
  const existingKey = await env.DB.prepare(
    "SELECT id FROM webauthn_credentials WHERE user_id = ? LIMIT 1",
  ).bind(userId).first<{ id: string }>();
  const hasWebauthn = !!existingKey;

  if (!hasTOTP && !hasWebauthn) return null;

  if (verification.challengeId && verification.webauthnResponse) {
    return verifyWebauthnAssertion(
      env,
      userId,
      verification.challengeId,
      verification.webauthnResponse as Record<string, unknown>,
      "mfa",
    );
  }

  if (hasTOTP) {
    if (!verification.totpCode) {
      return Response.json({ ok: false, error: "mfa_required" }, { status: 200 });
    }
    const valid = await verifyTOTP(user.totp_secret!, verification.totpCode);
    if (!valid) {
      return Response.json({ ok: false, error: "invalid_totp" }, { status: 401 });
    }
    return null;
  }

  // Has WebAuthn only, no assertion provided
  return Response.json({ ok: false, error: "mfa_required" }, { status: 200 });
}
