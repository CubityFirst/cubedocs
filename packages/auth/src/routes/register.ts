import zxcvbn from "zxcvbn";
import { okResponse, errorResponse, Errors, normalizeEmail } from "../lib";
import { hashPassword } from "../password";
import { verifyTurnstile } from "../turnstile";
import { createVerificationToken } from "../verification";
import { sendVerificationEmail } from "../email";
import { signJwt } from "../jwt";
import { createSession, SESSION_TTL_MS } from "../sessions";
import type { Env } from "../index";

export async function handleRegister(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ email: string; password: string; name: string; turnstileToken: string }>();

  if (!body.email || !body.password || !body.name) {
    return errorResponse(Errors.BAD_REQUEST);
  }

  if (typeof body.name !== "string" || body.name.trim().length === 0 || body.name.length > 100) {
    return errorResponse(Errors.BAD_REQUEST);
  }

  if (typeof body.email !== "string") return errorResponse(Errors.BAD_REQUEST);
  const email = normalizeEmail(body.email);
  // A whitespace-only address passes the truthy check above but trims to empty.
  if (!email) return errorResponse(Errors.BAD_REQUEST);

  if (zxcvbn(body.password).score < 3) {
    return errorResponse(Errors.BAD_REQUEST);
  }

  const turnstileValid = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET);
  if (!turnstileValid) return errorResponse(Errors.BAD_REQUEST);

  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?")
    .bind(email)
    .first();

  if (existing) return errorResponse(Errors.CONFLICT);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(body.password);
  const now = new Date().toISOString();
  const requireVerification = env.REQUIRE_EMAIL_VERIFICATION === "true";

  await env.DB.prepare(
    "INSERT INTO users (id, email, name, password_hash, created_at, email_verified) VALUES (?, ?, ?, ?, ?, ?)",
  ).bind(id, email, body.name, passwordHash, now, requireVerification ? 0 : 1).run();

  if (requireVerification) {
    const verificationToken = await createVerificationToken(env, id);
    const verifyUrl = `${env.APP_ORIGIN}/verify-email?token=${verificationToken}`;
    await sendVerificationEmail(env, email, verifyUrl);
    return okResponse({ verificationSent: true, email }, 201);
  }

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const sid = await createSession(env, id, request, expiresAt);
  const token = await signJwt(
    { userId: id, email, expiresAt, isAdmin: false, sid },
    env.JWT_SECRET,
  );

  return okResponse(
    {
      verificationSent: false,
      email,
      token,
      user: { id, email, name: body.name, createdAt: now },
    },
    201,
  );
}
