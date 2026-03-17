import { okResponse, errorResponse, Errors } from "../lib";
import { verifyTOTP } from "../totp";
import type { Env } from "../index";

export async function handleTotpEnable(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ userId: string; secret: string; code: string }>();
  if (!body.userId || !body.secret || !body.code) return errorResponse(Errors.BAD_REQUEST);

  const user = await env.DB.prepare("SELECT id FROM users WHERE id = ?")
    .bind(body.userId)
    .first<{ id: string }>();
  if (!user) return errorResponse(Errors.NOT_FOUND);

  const valid = await verifyTOTP(body.secret, body.code);
  if (!valid) return errorResponse(Errors.UNAUTHORIZED);

  await env.DB.prepare("UPDATE users SET totp_secret = ? WHERE id = ?")
    .bind(body.secret, body.userId)
    .run();

  return okResponse({});
}
