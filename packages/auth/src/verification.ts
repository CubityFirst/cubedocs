import type { Env } from "./index";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function createVerificationToken(env: Env, userId: string): Promise<string> {
  const now = Date.now();

  // Lazy GC: remove expired and already-consumed tokens for this user
  await env.DB.prepare(
    "DELETE FROM email_verification_tokens WHERE user_id = ? AND (expires_at <= ? OR consumed_at IS NOT NULL)",
  ).bind(userId, now).run();

  const token = crypto.randomUUID();
  const expiresAt = now + VERIFICATION_TTL_MS;

  await env.DB.prepare(
    "INSERT INTO email_verification_tokens (id, user_id, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, NULL)",
  ).bind(token, userId, now, expiresAt).run();

  return token;
}

// Returns the user_id on success, null if token is invalid/expired/already-consumed.
export async function consumeVerificationToken(env: Env, token: string): Promise<string | null> {
  const now = Date.now();

  const result = await env.DB.prepare(
    "UPDATE email_verification_tokens SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL AND expires_at > ? RETURNING user_id",
  ).bind(now, token, now).first<{ user_id: string }>();

  return result?.user_id ?? null;
}
