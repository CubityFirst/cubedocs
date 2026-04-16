import { okResponse, errorResponse, Errors } from "../lib";
import { consumeVerificationToken } from "../verification";
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

  return okResponse({ verified: true });
}
