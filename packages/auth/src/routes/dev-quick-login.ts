import { okResponse, errorResponse, Errors } from "../lib";
import { signJwt } from "../jwt";
import { createSession, SESSION_TTL_MS } from "../sessions";
import type { Env } from "../index";

type Variant = "standard-free" | "standard-ink" | "admin-free" | "admin-ink";

export async function handleDevQuickLogin(request: Request, env: Env): Promise<Response> {
  if (env.DEV_QUICK_LOGIN !== "true") {
    return errorResponse(Errors.NOT_FOUND);
  }

  const body = await request.json<{ variant: Variant }>();
  const isAdmin = body.variant === "admin-free" || body.variant === "admin-ink";
  const hasInk = body.variant === "standard-ink" || body.variant === "admin-ink";

  const id = crypto.randomUUID();
  const email = `dev-${id.slice(0, 8)}@localhost`;
  const name = `${isAdmin ? "Dev Admin" : "Dev User"}${hasInk ? " (Ink)" : ""}`;
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO users (id, email, name, password_hash, created_at, email_verified, is_admin) VALUES (?, ?, ?, '', ?, 1, ?)",
  ).bind(id, email, name, now, isAdmin ? 1 : 0).run();

  if (hasInk) {
    await env.DB.prepare(
      "INSERT INTO user_billing (user_id, granted_plan, granted_plan_reason, granted_plan_started_at) VALUES (?, 'ink', 'dev', ?)",
    ).bind(id, Date.now()).run();
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const sid = await createSession(env, id, request, expiresAt);
  const token = await signJwt(
    { userId: id, email, expiresAt, isAdmin, sid },
    env.JWT_SECRET,
  );

  return okResponse({ token });
}
