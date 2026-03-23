import { verifyJwt } from "./jwt";
import { errorResponse, Errors, type Session } from "./lib";
import type { Env } from "./index";
import { checkModeration } from "./routes/login";

interface SessionUserRow {
  id: string;
  email: string;
  moderation: number;
  force_password_change: number;
  is_admin: number;
}

async function loadCurrentSession(token: string, env: Env): Promise<Session | null> {
  const tokenSession = await verifyJwt(token, env.JWT_SECRET);
  if (!tokenSession || tokenSession.forcePasswordChange) return null;

  const user = await env.DB.prepare(
    "SELECT id, email, moderation, force_password_change, is_admin FROM users WHERE id = ?",
  ).bind(tokenSession.userId).first<SessionUserRow>();

  if (!user) return null;
  if (user.force_password_change) return null;
  if (checkModeration(user.moderation)) return null;

  return {
    userId: user.id,
    email: user.email,
    expiresAt: tokenSession.expiresAt,
    isAdmin: Boolean(user.is_admin),
  };
}

export async function verifyCurrentSessionToken(token: string, env: Env): Promise<Session | null> {
  return loadCurrentSession(token, env);
}

export async function requireCurrentSessionToken(token: string, env: Env): Promise<Session | Response> {
  const session = await loadCurrentSession(token, env);
  if (!session) return errorResponse(Errors.UNAUTHORIZED);
  return session;
}
