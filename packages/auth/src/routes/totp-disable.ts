import { okResponse, errorResponse, Errors } from "../lib";
import { verifyTOTP } from "../totp";
import type { Env } from "../index";

export async function handleTotpDisable(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ userId: string; code: string }>();
  if (!body.userId || !body.code) return errorResponse(Errors.BAD_REQUEST);

  const user = await env.DB.prepare("SELECT totp_secret FROM users WHERE id = ?")
    .bind(body.userId)
    .first<{ totp_secret: string | null }>();
  if (!user) return errorResponse(Errors.NOT_FOUND);
  if (!user.totp_secret) return errorResponse(Errors.BAD_REQUEST);

  const valid = await verifyTOTP(user.totp_secret, body.code);
  if (!valid) return errorResponse(Errors.UNAUTHORIZED);

  await env.DB.prepare("UPDATE users SET totp_secret = NULL WHERE id = ?")
    .bind(body.userId)
    .run();

  return okResponse({});
}
