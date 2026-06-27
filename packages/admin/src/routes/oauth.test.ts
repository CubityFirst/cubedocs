import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

vi.mock("../audit", () => ({ writeAdminAudit: vi.fn() }));

import { oauthRouter } from "./oauth";
import { writeAdminAudit } from "../audit";

const session = { userId: "admin-1", email: "admin@example.com" };

// Mount the router under a parent app that seeds c.get("session"), exactly like
// enforceAdmin does in the real worker.
function makeApp(authFetch: ReturnType<typeof vi.fn>) {
  const app = new Hono<{ Variables: Record<string, unknown> }>();
  app.use("*", async (c, next) => {
    c.set("session", session);
    await next();
  });
  app.route("/", oauthRouter);
  const env = { AUTH: { fetch: authFetch } } as never;
  return (path: string, init?: RequestInit) => app.request(path, init, env);
}

function authResponse(json: unknown, status = 200) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } }),
  );
}

beforeEach(() => vi.clearAllMocks());

describe("admin oauthRouter", () => {
  it("forwards GET / to the auth worker without auditing", async () => {
    const authFetch = authResponse({ ok: true, data: { clients: [] } });
    const request = makeApp(authFetch);
    const res = await request("/", { headers: { Authorization: "Bearer t" } });
    expect(res.status).toBe(200);
    expect(authFetch).toHaveBeenCalledWith(
      "https://auth/admin/oauth/clients",
      expect.objectContaining({ method: "GET", headers: { Authorization: "Bearer t" } }),
    );
    expect(writeAdminAudit).not.toHaveBeenCalled();
  });

  it("audits a successful create with allowlisted detail and the new client_id", async () => {
    const authFetch = authResponse({
      ok: true,
      data: { client_id: "c-new", client_name: "My App", is_public: false, trusted: true, client_secret: "SECRET-SHOWN-ONCE" },
    });
    const request = makeApp(authFetch);
    const res = await request("/", {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "My App" }),
    });
    expect(res.status).toBe(200);
    expect(writeAdminAudit).toHaveBeenCalledWith(
      expect.anything(),
      session,
      "oauth_client.create",
      "oauth_client",
      "c-new",
      { client_name: "My App", is_public: false, trusted: true },
    );
    // the one-time secret must never reach the audit log
    const detail = vi.mocked(writeAdminAudit).mock.calls[0][5] as Record<string, unknown>;
    expect(detail).not.toHaveProperty("client_secret");
  });

  it("does NOT audit when the auth worker reports ok:false", async () => {
    const authFetch = authResponse({ ok: false, error: "bad" }, 400);
    const request = makeApp(authFetch);
    const res = await request("/", {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ client_name: "X" }),
    });
    expect(res.status).toBe(400);
    expect(writeAdminAudit).not.toHaveBeenCalled();
  });

  it("audits set-disabled with the disabled flag and the request's client_id", async () => {
    const authFetch = authResponse({ ok: true, data: {} });
    const request = makeApp(authFetch);
    await request("/set-disabled", {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: "c-1", disabled: true }),
    });
    expect(writeAdminAudit).toHaveBeenCalledWith(
      expect.anything(), session, "oauth_client.set_disabled", "oauth_client", "c-1", { disabled: true },
    );
  });

  it("audits a delete with the request's client_id and no detail", async () => {
    const authFetch = authResponse({ ok: true, data: {} });
    const request = makeApp(authFetch);
    await request("/delete", {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: "c-1" }),
    });
    expect(writeAdminAudit).toHaveBeenCalledWith(
      expect.anything(), session, "oauth_client.delete", "oauth_client", "c-1", undefined,
    );
  });

  it("forwards rotate-secret but keeps the rotated secret out of the audit", async () => {
    const authFetch = authResponse({ ok: true, data: { client_id: "c-1", client_secret: "NEW-SECRET" } });
    const request = makeApp(authFetch);
    const res = await request("/rotate-secret", {
      method: "POST",
      headers: { Authorization: "Bearer t", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: "c-1" }),
    });
    // response still carries the secret back to the operator
    const body = (await res.json()) as { data: { client_secret: string } };
    expect(body.data.client_secret).toBe("NEW-SECRET");
    // but the audit row has no detail payload
    expect(writeAdminAudit).toHaveBeenCalledWith(
      expect.anything(), session, "oauth_client.rotate_secret", "oauth_client", "c-1", undefined,
    );
  });
});
