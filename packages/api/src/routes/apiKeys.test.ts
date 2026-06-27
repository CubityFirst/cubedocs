import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleApiKeys } from "./apiKeys";

vi.mock("../lib/access", () => ({ resolveAccess: vi.fn() }));
vi.mock("../lib/apiKeys", () => ({
  generateApiKeySecret: vi.fn(() => "annx_secret_value"),
  keyDisplayPrefix: vi.fn(() => "annx_abcd"),
  hashApiKey: vi.fn(async () => "hashed-secret"),
}));

import { resolveAccess } from "../lib/access";
import { generateApiKeySecret, hashApiKey } from "../lib/apiKeys";

const user = { userId: "user-1", email: "a@example.com" } as unknown as Parameters<typeof handleApiKeys>[2];

function makeEnv() {
  const firsts: unknown[] = [];
  const alls: unknown[] = [];
  const runs: unknown[] = [];
  const first = vi.fn(() => Promise.resolve(firsts.shift() ?? null));
  const all = vi.fn(() => Promise.resolve(alls.shift() ?? { results: [] }));
  const run = vi.fn(() => Promise.resolve(runs.shift() ?? { meta: { changes: 1 } }));
  const bindCalls: unknown[][] = [];
  const bind = vi.fn((...args: unknown[]) => { bindCalls.push(args); return { first, all, run }; });
  const prepare = vi.fn((_sql?: string) => ({ bind }));
  return {
    env: { DB: { prepare } } as unknown as Parameters<typeof handleApiKeys>[1],
    run,
    prepare,
    bind,
    bindCalls,
    queueFirst: (v: unknown) => firsts.push(v),
    queueAll: (v: unknown) => alls.push(v),
    queueRun: (v: unknown) => runs.push(v),
  };
}

function call(env: Parameters<typeof handleApiKeys>[1], method: string, path: string, body?: unknown, rawBody?: boolean) {
  const url = new URL(`http://localhost${path}`);
  return handleApiKeys(
    new Request(url.toString(), {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? (rawBody ? (body as string) : JSON.stringify(body)) : undefined,
    }),
    env, user, url,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveAccess).mockResolvedValue({ role: "editor" } as unknown as Awaited<ReturnType<typeof resolveAccess>>);
});

describe("handleApiKeys routing + membership", () => {
  it("404s on a non-matching path", async () => {
    const { env } = makeEnv();
    const res = await call(env, "GET", "/projects/p1/other");
    expect(res.status).toBe(404);
  });

  it("404s when the caller isn't a member", async () => {
    vi.mocked(resolveAccess).mockResolvedValue(null);
    const { env } = makeEnv();
    const res = await call(env, "GET", "/projects/p1/api-keys");
    expect(res.status).toBe(404);
  });

  it("404s on an unsupported verb", async () => {
    const { env } = makeEnv();
    const res = await call(env, "PUT", "/projects/p1/api-keys");
    expect(res.status).toBe(404);
  });
});

describe("handleApiKeys GET list", () => {
  it("returns the caller's own keys", async () => {
    const { env, prepare, bind, queueAll } = makeEnv();
    queueAll({ results: [{
      id: "k1", name: "CI", key_prefix: "annx_abcd", scope: "read",
      can_invite: 0, created_at: "2026", last_used_at: null, expires_at: null,
    }] });
    const res = await call(env, "GET", "/projects/p1/api-keys");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<{ id: string; canInvite: boolean }> };
    expect(json.data[0].id).toBe("k1");
    expect(json.data[0].canInvite).toBe(false);
    // The list must be scoped to BOTH the site and the caller; dropping
    // `user_id = ?` would let one member read another's keys.
    expect(prepare.mock.calls[0][0] as string).toContain("user_id = ?");
    expect(bind).toHaveBeenCalledWith("p1", "user-1");
  });
});

describe("handleApiKeys POST mint", () => {
  it("400s on an unparseable body", async () => {
    const { env } = makeEnv();
    const res = await call(env, "POST", "/projects/p1/api-keys", "not json", true);
    expect(res.status).toBe(400);
  });

  it("400s without a name", async () => {
    const { env } = makeEnv();
    const res = await call(env, "POST", "/projects/p1/api-keys", { scope: "read" });
    expect(res.status).toBe(400);
  });

  it("400s on an over-long name", async () => {
    const { env } = makeEnv();
    const res = await call(env, "POST", "/projects/p1/api-keys", { name: "x".repeat(101), scope: "read" });
    expect(res.status).toBe(400);
  });

  it("400s on an invalid scope", async () => {
    const { env } = makeEnv();
    const res = await call(env, "POST", "/projects/p1/api-keys", { name: "k", scope: "admin" });
    expect(res.status).toBe(400);
  });

  it("403s when a non-admin requests a canInvite key", async () => {
    const { env } = makeEnv();
    const res = await call(env, "POST", "/projects/p1/api-keys", { name: "k", scope: "read", canInvite: true });
    expect(res.status).toBe(403);
  });

  it("400s on a non-string expiresAt", async () => {
    const { env } = makeEnv();
    const res = await call(env, "POST", "/projects/p1/api-keys", { name: "k", scope: "read", expiresAt: 123 });
    expect(res.status).toBe(400);
  });

  it("400s on an expiresAt in the past", async () => {
    const { env } = makeEnv();
    const res = await call(env, "POST", "/projects/p1/api-keys", { name: "k", scope: "read", expiresAt: "2000-01-01T00:00:00.000Z" });
    expect(res.status).toBe(400);
  });

  it("409s when the per-user key cap is reached", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ n: 20 });
    const res = await call(env, "POST", "/projects/p1/api-keys", { name: "k", scope: "read" });
    expect(res.status).toBe(409);
  });

  it("mints a key and returns the secret once", async () => {
    const { env, queueFirst, run, bind } = makeEnv();
    queueFirst({ n: 0 });
    const res = await call(env, "POST", "/projects/p1/api-keys", { name: "CI key", scope: "readwrite" });
    expect(res.status).toBe(201);
    expect(generateApiKeySecret).toHaveBeenCalled();
    expect(hashApiKey).toHaveBeenCalledWith("annx_secret_value");
    expect(run).toHaveBeenCalled();
    // INSERT column order is (id, user_id, project_id, name, key_hash, key_prefix,
    // scope, can_invite, created_at, expires_at). Pin user_id (pos 2) and
    // project_id (pos 3) so a wrong-owner mint can't slip through.
    expect(bind).toHaveBeenCalledWith(
      expect.any(String), "user-1", "p1", "CI key", "hashed-secret",
      "annx_abcd", "readwrite", 0, expect.any(String), null,
    );
    const json = (await res.json()) as { data: { secret: string; scope: string; canInvite: boolean } };
    expect(json.data.secret).toBe("annx_secret_value");
    expect(json.data.scope).toBe("readwrite");
    expect(json.data.canInvite).toBe(false);
  });

  it("lets an admin mint a canInvite key", async () => {
    vi.mocked(resolveAccess).mockResolvedValue({ role: "admin" } as unknown as Awaited<ReturnType<typeof resolveAccess>>);
    const { env, queueFirst } = makeEnv();
    queueFirst({ n: 0 });
    const res = await call(env, "POST", "/projects/p1/api-keys", { name: "ops", scope: "read", canInvite: true });
    expect(res.status).toBe(201);
    const json = (await res.json()) as { data: { canInvite: boolean } };
    expect(json.data.canInvite).toBe(true);
  });
});

describe("handleApiKeys DELETE revoke", () => {
  it("revokes one of the caller's keys", async () => {
    const { env, run, prepare, bind } = makeEnv();
    const res = await call(env, "DELETE", "/projects/p1/api-keys/k1");
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalled();
    const json = (await res.json()) as { data: { revoked: boolean } };
    expect(json.data.revoked).toBe(true);
    // UPDATE must be scoped to id + project + caller; dropping `user_id = ?`
    // would let a member revoke another member's key. (Timestamp is an ISO
    // string here, then keyId, projectId, userId.)
    expect(prepare.mock.calls[0][0] as string).toContain("user_id = ?");
    expect(bind).toHaveBeenCalledWith(expect.any(String), "k1", "p1", "user-1");
  });

  it("404s when no key was revoked (not the caller's / already gone)", async () => {
    const { env, queueRun } = makeEnv();
    queueRun({ meta: { changes: 0 } });
    const res = await call(env, "DELETE", "/projects/p1/api-keys/k1");
    expect(res.status).toBe(404);
  });
});
