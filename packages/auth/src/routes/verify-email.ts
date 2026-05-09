import { okResponse, errorResponse, Errors } from "../lib";
import { consumeVerificationToken } from "../verification";
import { signJwt } from "../jwt";
import { createSession, SESSION_TTL_MS } from "../sessions";
import type { Env } from "../index";

export async function handleVerifyEmail(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ token?: string }>();
  if (!body.token) return errorResponse(Errors.BAD_REQUEST);

  const userId = await consumeVerificationToken(env, body.token);
  if (!userId) {
    return Response.json({ ok: false, error: "invalid_or_expired_token" }, { status: 400 });
  }

  await env.DB.prepare(
    "UPDATE users SET email_verified = 1, email_verified_at = ? WHERE id = ?",
  ).bind(new Date().toISOString(), userId).run();

  const row = await env.DB.prepare(
    "SELECT id, email, name, created_at FROM users WHERE id = ?",
  ).bind(userId).first<{ id: string; email: string; name: string; created_at: string }>();

  if (!row) return errorResponse(Errors.NOT_FOUND);

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const sid = await createSession(env, row.id, request, expiresAt);
  const token = await signJwt(
    { userId: row.id, email: row.email, expiresAt, isAdmin: false, sid },
    env.JWT_SECRET,
  );

  return okResponse({
    verified: true,
    token,
    user: { id: row.id, email: row.email, name: row.name, createdAt: row.created_at },
  });
}
