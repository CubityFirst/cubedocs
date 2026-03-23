import { requireAuthenticatedSession } from "../auth-session";
import { errorResponse, Errors, okResponse } from "../lib";
import type { Env } from "../index";

const ADMIN_HOSTNAME = "admin.cubityfir.st";
const HANDOFF_TTL_MS = 5 * 60 * 1000;

function isLocalAdminHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function normalizeAdminReturnTo(returnTo: string): string | null {
  try {
    const url = new URL(returnTo);
    const isLocal = isLocalAdminHostname(url.hostname);
    const isAllowedHostname =
      url.hostname === ADMIN_HOSTNAME ||
      url.hostname.endsWith(`.${ADMIN_HOSTNAME}`) ||
      isLocal;
    const isAllowedProtocol = isLocal
      ? url.protocol === "http:" || url.protocol === "https:"
      : url.protocol === "https:";

    if (!isAllowedHostname || !isAllowedProtocol) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

export async function handleAdminHandoffStart(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  if (!session.isAdmin) {
    return Response.json({ ok: false, error: "not_admin" }, { status: 403 });
  }

  const body = await request.json<{ returnTo?: string }>();
  if (!body.returnTo) return errorResponse(Errors.BAD_REQUEST);

  const normalizedReturnTo = normalizeAdminReturnTo(body.returnTo);
  if (!normalizedReturnTo) return errorResponse(Errors.BAD_REQUEST);

  const now = Date.now();
  const expiresAt = now + HANDOFF_TTL_MS;
  const code = crypto.randomUUID();

  await env.DB.prepare(
    "DELETE FROM admin_handoffs WHERE expires_at <= ? OR consumed_at IS NOT NULL",
  ).bind(now).run();

  await env.DB.prepare(
    "INSERT INTO admin_handoffs (id, user_id, return_to, created_at, expires_at, consumed_at) VALUES (?, ?, ?, ?, ?, NULL)",
  ).bind(code, session.userId, normalizedReturnTo, now, expiresAt).run();

  const redirectUrl = new URL(normalizedReturnTo);
  redirectUrl.searchParams.set("code", code);

  return okResponse({
    redirectTo: redirectUrl.toString(),
    expiresAt,
  });
}
