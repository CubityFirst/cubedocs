import type { Env } from "./index";

export interface AdminSession {
  userId: string;
  email: string;
  expiresAt: number;
  isAdmin?: boolean;
  forcePasswordChange?: true;
}

async function verifySessionFromAuthorization(
  authorization: string | null,
  env: Env,
): Promise<AdminSession | null> {
  if (!authorization?.startsWith("Bearer ")) return null;

  const response = await env.AUTH.fetch("https://auth/verify", {
    headers: { Authorization: authorization },
  });

  if (!response.ok) return null;

  const { data } = await response.json<{ ok: true; data: AdminSession }>();
  return data;
}

export async function verifySession(request: Request, env: Env): Promise<AdminSession | null> {
  return verifySessionFromAuthorization(request.headers.get("Authorization"), env);
}

export async function requireAdminSession(request: Request, env: Env): Promise<AdminSession | Response> {
  const session = await verifySession(request, env);

  if (!session) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!session.isAdmin) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  return session;
}
