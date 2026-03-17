import { okResponse, errorResponse, Errors } from "../lib";
import { verifyWebauthnAssertion } from "../webauthn";
import { signJwt } from "../jwt";
import { checkModeration } from "./login";
import type { Env } from "../index";

export async function handleWebauthnAuthFinish(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    userId: string;
    challengeId: string;
    response: Record<string, unknown>;
    email: string;
  }>();

  if (!body.userId || !body.challengeId || !body.response || !body.email) {
    return errorResponse(Errors.BAD_REQUEST);
  }

  const user = await env.DB.prepare(
    "SELECT id, email, name, created_at, moderation FROM users WHERE id = ? AND email = ?",
  )
    .bind(body.userId, body.email.toLowerCase())
    .first<{ id: string; email: string; name: string; created_at: string; moderation: number }>();
  if (!user) return errorResponse(Errors.UNAUTHORIZED);

  const moderationResponse = checkModeration(user.moderation);
  if (moderationResponse) return moderationResponse;

  const assertionError = await verifyWebauthnAssertion(env, body.userId, body.challengeId, body.response, "webauthn-auth-finish");
  if (assertionError) return assertionError;

  const token = await signJwt(
    { userId: user.id, email: user.email, expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000 },
    env.JWT_SECRET,
  );

  return okResponse({
    token,
    user: { id: user.id, email: user.email, name: user.name, createdAt: user.created_at },
  });
}
