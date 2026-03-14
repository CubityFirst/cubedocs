import { okResponse, errorResponse, Errors } from "@cubedocs/shared";
import { hashPassword } from "../password";
import { signJwt } from "../jwt";
import type { Env } from "../index";

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ email: string; password: string; name: string }>();

  if (!body.email || !body.password || !body.name) {
    return errorResponse(Errors.BAD_REQUEST);
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(body.email.toLowerCase())
    .first();

  if (existing) return errorResponse(Errors.CONFLICT);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  ).bind(id, body.email.toLowerCase(), body.name, passwordHash, now).run();

  const token = await signJwt(
    { userId: id, email: body.email.toLowerCase(), expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 },
    env.JWT_SECRET,
  );

  return okResponse({ token, user: { id, email: body.email.toLowerCase(), name: body.name, createdAt: now } }, 201);
}
