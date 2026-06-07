import { Hono } from "hono";
import type { Context } from "hono";
import type { AppEnv } from "../index";

// OIDC client management for the admin dashboard. The admin worker is a thin
// authenticated proxy here — the oauth_clients table lives in the auth DB,
// which the admin worker binds read-only by convention, so every read and
// write is forwarded to the auth worker (which owns auth-DB writes and the
// client-secret hashing). `enforceAdmin` has already validated the session;
// the auth worker re-checks it as defence in depth.

const oauthRouter = new Hono<AppEnv>();

// Forward to the auth worker, preserving the caller's Authorization header and
// (for writes) the JSON body. Returns the auth worker's response verbatim.
async function forward(
  c: Context<AppEnv>,
  authPath: string,
  method: "GET" | "POST",
): Promise<Response> {
  const auth = c.req.raw.headers.get("Authorization");
  const headers: Record<string, string> = auth ? { Authorization: auth } : {};
  let body: string | undefined;
  if (method === "POST") {
    body = await c.req.raw.text();
    headers["Content-Type"] = "application/json";
  }
  return c.env.AUTH.fetch(`https://auth${authPath}`, { method, headers, body });
}

oauthRouter.get("/", (c) => forward(c, "/admin/oauth/clients", "GET"));
oauthRouter.post("/", (c) => forward(c, "/admin/oauth/clients", "POST"));
oauthRouter.post("/set-disabled", (c) => forward(c, "/admin/oauth/clients/set-disabled", "POST"));
oauthRouter.post("/delete", (c) => forward(c, "/admin/oauth/clients/delete", "POST"));
oauthRouter.post("/rotate-secret", (c) => forward(c, "/admin/oauth/clients/rotate-secret", "POST"));

export { oauthRouter };
