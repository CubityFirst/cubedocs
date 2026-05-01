import { requireAuthenticatedSession } from "../auth-session";
import { okResponse } from "../lib";
import { requireMFA } from "../mfa";
import type { Env } from "../index";

export async function handleDeleteAccount(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  const body = await request.json<{
    totpCode?: string;
    challengeId?: string;
    webauthnResponse?: unknown;
    backupCode?: string;
  }>();

  const mfaError = await requireMFA(env, session.userId, {
    totpCode: body.totpCode,
    challengeId: body.challengeId,
    webauthnResponse: body.webauthnResponse,
    backupCode: body.backupCode,
  });
  if (mfaError) return mfaError;

  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(session.userId).run();

  return okResponse({});
}
