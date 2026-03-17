import zxcvbn from "zxcvbn";
import { okResponse, errorResponse, Errors } from "../lib";
import { verifyPassword, hashPassword } from "../password";
import { verifyTOTP } from "../totp";
import type { Env } from "../index";

export async function handleChangePassword(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    userId: string;
    currentPassword: string;
    newPassword: string;
    totpCode?: string;
  }>();

  if (!body.userId || !body.currentPassword || !body.newPassword) {
    return errorResponse(Errors.BAD_REQUEST);
  }

  if (zxcvbn(body.newPassword).score < 3) {
    return Response.json({ ok: false, error: "password_too_weak" }, { status: 400 });
  }

  const user = await env.DB.prepare(
    "SELECT password_hash, totp_secret FROM users WHERE id = ?",
  ).bind(body.userId).first<{ password_hash: string; totp_secret: string | null }>();

  if (!user) return errorResponse(Errors.NOT_FOUND);

  const valid = await verifyPassword(body.currentPassword, user.password_hash);
  if (!valid) return errorResponse(Errors.UNAUTHORIZED);

  if (user.totp_secret) {
    if (!body.totpCode) {
      return Response.json({ ok: false, error: "totp_required" }, { status: 200 });
    }
    const totpValid = await verifyTOTP(user.totp_secret, body.totpCode);
    if (!totpValid) {
      return Response.json({ ok: false, error: "invalid_totp" }, { status: 401 });
    }
  }

  const newHash = await hashPassword(body.newPassword);
  await env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .bind(newHash, body.userId)
    .run();

  return okResponse({});
}
