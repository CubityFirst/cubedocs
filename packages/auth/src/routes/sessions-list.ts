import { requireAuthenticatedSession } from "../auth-session";
import { okResponse } from "../lib";
import { listActiveSessions } from "../sessions";
import type { Env } from "../index";

export async function handleSessionsList(request: Request, env: Env): Promise<Response> {
  const session = await requireAuthenticatedSession(request, env);
  if (session instanceof Response) return session;

  const sessions = await listActiveSessions(env, session.userId, session.sid);
  return okResponse({ sessions });
}
