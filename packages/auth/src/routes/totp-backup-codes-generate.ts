import { okResponse, errorResponse, Errors } from "../lib";
import { requireMFA, hashCode } from "../mfa";
import type { Env } from "../index";

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += CHARSET[bytes[i] % CHARSET.length];
    if (i === 4) result += "-";
  }
  return result;
}

export async function handleTotpBackupCodesGenerate(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    userId: string;
    totpCode?: string;
    challengeId?: string;
    webauthnResponse?: unknown;
    backupCode?: string;
  }>();

  if (!body.userId) return errorResponse(Errors.BAD_REQUEST);

  const user = await env.DB.prepare(
    "SELECT totp_secret FROM users WHERE id = ?",
  ).bind(body.userId).first<{ totp_secret: string | null }>();

  if (!user) return errorResponse(Errors.UNAUTHORIZED);
  if (!user.totp_secret) return Response.json({ ok: false, error: "totp_not_enabled" }, { status: 400 });

  const mfaError = await requireMFA(env, body.userId, {
    totpCode: body.totpCode,
    challengeId: body.challengeId,
    webauthnResponse: body.webauthnResponse,
    backupCode: body.backupCode,
  });
  if (mfaError) return mfaError;

  // Delete all existing backup codes
  await env.DB.prepare("DELETE FROM backup_codes WHERE user_id = ?").bind(body.userId).run();

  // Generate 8 new codes
  const codes: string[] = [];
  const inserts: Promise<unknown>[] = [];

  for (let i = 0; i < 8; i++) {
    const code = generateCode();
    codes.push(code);
    const id = crypto.randomUUID();
    const hash = await hashCode(code);
    inserts.push(
      env.DB.prepare(
        "INSERT INTO backup_codes (id, user_id, code_hash) VALUES (?, ?, ?)",
      ).bind(id, body.userId, hash).run(),
    );
  }

  await Promise.all(inserts);

  return okResponse({ codes });
}
