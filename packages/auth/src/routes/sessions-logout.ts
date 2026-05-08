import { requireAuthenticatedSession } from "../auth-session";
import { okResponse } from "../lib";
import { revokeSession } from "../sessions";
import type { Env } from "../index";

export async function handleSessionsLogout(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  if (session.sid) await revokeSession(env, session.sid, session.userId);
  return okResponse({});
}
