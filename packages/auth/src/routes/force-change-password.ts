import zxcvbn from "zxcvbn";
import { okResponse, errorResponse, Errors } from "../lib";
import { hashPassword } from "../password";
import { signJwt, verifyJwt } from "../jwt";
import type { Env } from "../index";

export async function handleForceChangePassword(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    changeToken: string;
    newPassword: string;
  }>();

  if (!body.changeToken || !body.newPassword) {
    return errorResponse(Errors.BAD_REQUEST);
  }

  const session = await verifyJwt(body.changeToken, env.JWT_SECRET);
  if (!session || !session.forcePasswordChange) {
    return errorResponse(Errors.UNAUTHORIZED);
  }

  if (zxcvbn(body.newPassword).score < 3) {
    return Response.json({ ok: false, error: "password_too_weak" }, { status: 400 });
  }

  const user = await env.DB.prepare(
    "SELECT id, email, name, created_at, is_admin FROM users WHERE id = ? AND force_password_change = 1",
  ).bind(session.userId).first<{ id: string; email: string; name: string; created_at: string; is_admin: number }>();
  if (!user) return errorResponse(Errors.NOT_FOUND);

  const newHash = await hashPassword(body.newPassword);
  await env.DB.prepare(
    "UPDATE users SET password_hash = ?, force_password_change = 0 WHERE id = ?",
  ).bind(newHash, user.id).run();

  const token = await signJwt(
    { userId: user.id, email: user.email, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, isAdmin: Boolean(user.is_admin) },
    env.JWT_SECRET,
  );

  return okResponse({ token, user: { id: user.id, email: user.email, name: user.name, createdAt: user.created_at } });
}
