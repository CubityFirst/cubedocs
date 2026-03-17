import { okResponse, errorResponse, Errors } from "../lib";
import type { Env } from "../index";

export async function handleTotpStatus(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{ userId: string }>();
  if (!body.userId) return errorResponse(Errors.BAD_REQUEST);

  const user = await env.DB.prepare("SELECT totp_secret FROM users WHERE id = ?")
    .bind(body.userId)
    .first<{ totp_secret: string | null }>();
  if (!user) return errorResponse(Errors.NOT_FOUND);

  return okResponse({ enabled: user.totp_secret !== null });
}
