import { verifyWebauthnAssertion } from "./webauthn";
import { verifyTOTP } from "./totp";
import type { Env } from "./index";

export type MFAVerification = {
  totpCode?: string;
  challengeId?: string;
  webauthnResponse?: unknown;
  backupCode?: string;
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
 * Backup codes are accepted in place of a TOTP code.
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
    if (verification.totpCode) {
      const valid = await verifyTOTP(user.totp_secret!, verification.totpCode);
      if (!valid) {
        return Response.json({ ok: false, error: "invalid_totp" }, { status: 401 });
      }
      return null;
    }
    if (verification.backupCode) {
      const backupResult = await validateAndConsumeBackupCode(env, userId, verification.backupCode);
      if (!backupResult) {
        return Response.json({ ok: false, error: "invalid_backup_code" }, { status: 401 });
      }
      return null;
    }
    return Response.json({ ok: false, error: "mfa_required" }, { status: 200 });
  }

  // Has WebAuthn only, no assertion provided
  return Response.json({ ok: false, error: "mfa_required" }, { status: 200 });
}

export async function validateAndConsumeBackupCode(env: Env, userId: string, code: string): Promise<boolean> {
  const hash = await hashCode(code.toUpperCase());
  const rows = await env.DB.prepare(
    "SELECT id, code_hash FROM backup_codes WHERE user_id = ? AND used_at IS NULL",
  ).bind(userId).all<{ id: string; code_hash: string }>();

  for (const row of rows.results) {
    if (row.code_hash === hash) {
      await env.DB.prepare(
        "UPDATE backup_codes SET used_at = datetime('now') WHERE id = ?",
      ).bind(row.id).run();
      return true;
    }
  }
  return false;
}

export async function hashCode(code: string): Promise<string> {
  const buf = new TextEncoder().encode(code);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}
