import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";

export async function handleLookupById(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ userId?: string }>();
  if (!body.userId) return errorResponse(Errors.BAD_REQUEST);

  const user = await env.DB.prepare(
    "SELECT id, email, name, email_verified, created_at FROM users WHERE id = ?",
  ).bind(body.userId).first<{ id: string; email: string; name: string; email_verified: number; created_at: string }>();

  if (!user) return errorResponse(Errors.NOT_FOUND);

  const emailVerificationEnabled = env.REQUIRE_EMAIL_VERIFICATION === "true";
  return okResponse({ userId: user.id, email: user.email, name: user.name, emailVerified: user.email_verified === 1, emailVerificationEnabled, createdAt: user.created_at });
}
