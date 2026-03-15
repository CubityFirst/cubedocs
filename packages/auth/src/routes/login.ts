import { okResponse, errorResponse, Errors } from "../lib";
import { verifyPassword } from "../password";
import { signJwt } from "../jwt";
import type { Env } from "../index";

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ email: string; password: string; turnstileToken: string }>();

  if (!body.email || !body.password) return errorResponse(Errors.BAD_REQUEST);

  const row = await env.DB.prepare(
    "SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?",
  ).bind(body.email.toLowerCase()).first<{
    id: string; email: string; name: string; password_hash: string; created_at: string;
  }>();

  if (!row) return errorResponse(Errors.UNAUTHORIZED);

  const valid = await verifyPassword(body.password, row.password_hash);
  if (!valid) return errorResponse(Errors.UNAUTHORIZED);

  const token = await signJwt(
    { userId: row.id, email: row.email, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 },
    env.JWT_SECRET,
  );

  return okResponse({ token, user: { id: row.id, email: row.email, name: row.name, createdAt: row.created_at } });
}
