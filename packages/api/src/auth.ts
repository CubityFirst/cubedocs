import type { Session } from "@cubedocs/shared";
import type { Env } from "./index";

// Delegates token verification to the auth worker via Service Binding.
export async function authenticate(request: Request, env: Env): Promise<Session | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const response = await env.AUTH.fetch("https://auth/verify", {
    headers: { Authorization: authHeader },
  });

  if (!response.ok) return null;

  const { data } = await response.json<{ ok: true; data: Session }>();
  return data;
}
