import { okResponse, errorResponse, Errors } from "../lib";
import { requireMFA } from "../mfa";
import type { Env } from "../index";

export async function handleWebauthnCredentialsDelete(request: Request, env: Env): Promise<Response> {
  const body = await request.json<{
    userId: string;
    credentialId: string;
    totpCode?: string;
    challengeId?: string;
    webauthnResponse?: unknown;
  }>();
  if (!body.userId || !body.credentialId) return errorResponse(Errors.BAD_REQUEST);

  const mfaError = await requireMFA(env, body.userId, {
    totpCode: body.totpCode,
    challengeId: body.challengeId,
    webauthnResponse: body.webauthnResponse,
  });
  if (mfaError) return mfaError;

  const result = await env.DB.prepare(
    "DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?",
  ).bind(body.credentialId, body.userId).run();

  if (!result.meta.changes || result.meta.changes === 0) return errorResponse(Errors.NOT_FOUND);

  return okResponse({});
}
