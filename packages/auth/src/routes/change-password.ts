import zxcvbn from "zxcvbn";
import { okResponse, errorResponse, Errors } from "../lib";
import { verifyPassword, hashPassword } from "../password";
import { requireMFA } from "../mfa";
import type { Env } from "../index";

export async function handleChangePassword(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    userId: string;
    currentPassword: string;
    newPassword: string;
    totpCode?: string;
    challengeId?: string;
    webauthnResponse?: unknown;
  }>();

  if (!body.userId || !body.currentPassword || !body.newPassword) {
    return errorResponse(Errors.BAD_REQUEST);
  }

  if (zxcvbn(body.newPassword).score < 3) {
    return Response.json({ ok: false, error: "password_too_weak" }, { status: 400 });
  }

  const user = await env.DB.prepare(
    "SELECT password_hash FROM users WHERE id = ?",
  ).bind(body.userId).first<{ password_hash: string }>();
  if (!user) return errorResponse(Errors.NOT_FOUND);

  const valid = await verifyPassword(body.currentPassword, user.password_hash);
  if (!valid) return errorResponse(Errors.UNAUTHORIZED);

  const mfaError = await requireMFA(env, body.userId, {
    totpCode: body.totpCode,
    challengeId: body.challengeId,
    webauthnResponse: body.webauthnResponse,
  });
  if (mfaError) return mfaError;

  const newHash = await hashPassword(body.newPassword);
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(newHash, body.userId)
    .run();

  return okResponse({});
}
