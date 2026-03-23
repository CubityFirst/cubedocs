import { okResponse, errorResponse, Errors } from "../lib";
import { verifyPassword } from "../password";
import { signJwt } from "../jwt";
import { verifyTurnstile } from "../turnstile";
import { verifyTOTP } from "../totp";
import { validateAndConsumeBackupCode } from "../mfa";
import type { Env } from "../index";

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    email: string;
    password: string;
    turnstileToken: string;
    totpCode?: string;
    backupCode?: string;
  }>();

  if (!body.email || !body.password) return errorResponse(Errors.BAD_REQUEST);

  const turnstileValid = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET);
  if (!turnstileValid) return errorResponse(Errors.BAD_REQUEST);

  const row = await env.DB.prepare(
    "SELECT id, email, name, password_hash, created_at, moderation, totp_secret, force_password_change FROM users WHERE email = ?",
  ).bind(body.email.toLowerCase()).first<{
    id: string; email: string; name: string; password_hash: string; created_at: string; moderation: number; totp_secret: string | null; force_password_change: number;
  }>();

  if (!row) return errorResponse(Errors.UNAUTHORIZED);

  const valid = await verifyPassword(body.password, row.password_hash);
  if (!valid) return errorResponse(Errors.UNAUTHORIZED);

  const moderationResponse = checkModeration(row.moderation);
  if (moderationResponse) return moderationResponse;

  const webauthnResult = await env.DB.prepare(
    "SELECT COUNT(*) as count FROM webauthn_credentials WHERE user_id = ?",
  ).bind(row.id).first<{ count: number }>();
  const hasWebauthn = (webauthnResult?.count ?? 0) > 0;
  const hasTOTP = !!row.totp_secret;

  if (hasWebauthn && hasTOTP) {
    // Both methods available: if totpCode or backupCode supplied the user chose TOTP, otherwise prompt for choice
    if (!body.totpCode && !body.backupCode) {
      return Response.json(
        { ok: false, error: "two_factor_required", methods: ["totp", "webauthn"], userId: row.id },
        { status: 200 },
      );
    }
    const totpError = await verifyTotpOrBackup(env, row.id, row.totp_secret!, body.totpCode, body.backupCode);
    if (totpError) return totpError;
  } else if (hasWebauthn) {
    return Response.json({ ok: false, error: "webauthn_required", userId: row.id }, { status: 200 });
  } else if (hasTOTP) {
    if (!body.totpCode && !body.backupCode) {
      return Response.json({ ok: false, error: "totp_required" }, { status: 200 });
    }
    const totpError = await verifyTotpOrBackup(env, row.id, row.totp_secret!, body.totpCode, body.backupCode);
    if (totpError) return totpError;
  }

  if (row.force_password_change) {
    const changeToken = await signJwt(
      { userId: row.id, email: row.email, expiresAt: Date.now() + 15 * 60 * 1000, forcePasswordChange: true },
      env.JWT_SECRET,
    );
    return Response.json({ ok: false, error: "password_change_required", changeToken }, { status: 200 });
  }

  const token = await signJwt(
    { userId: row.id, email: row.email, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 },
    env.JWT_SECRET,
  );

  return okResponse({ token, user: { id: row.id, email: row.email, name: row.name, createdAt: row.created_at } });
}

async function verifyTotpOrBackup(
  env: Env,
  userId: string,
  totpSecret: string,
  totpCode?: string,
  backupCode?: string,
): Promise<Response | null> {
  if (totpCode) {
    const valid = await verifyTOTP(totpSecret, totpCode);
    if (!valid) return Response.json({ ok: false, error: "invalid_totp" }, { status: 401 });
    return null;
  }
  if (backupCode) {
    const valid = await validateAndConsumeBackupCode(env, userId, backupCode);
    if (!valid) return Response.json({ ok: false, error: "invalid_backup_code" }, { status: 401 });
    return null;
  }
  return null;
}

// Returns a 403 response if the account is restricted, or null if active.
// moderation: 0 = active, -1 = disabled, >0 = suspended until unix timestamp (seconds)
export function checkModeration(moderation: number): Response | null {
  if (moderation === 0) return null;
  if (moderation === -1) return Response.json({ ok: false, error: "account_disabled" }, { status: 403 });
  if (moderation > 0) {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds < moderation) {
      return Response.json({ ok: false, error: "account_suspended", until: moderation }, { status: 403 });
    }
  }
  return null; // suspension has expired
}
