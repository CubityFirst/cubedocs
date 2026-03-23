import { describe, it, expect, vi } from "vitest";
import worker from "./index";
import type { Session } from "./lib";

function makeStmt(firstValue: unknown = null, allValue: unknown[] = []) {
  const stmt: Record<string, unknown> = {
    bind: (..._args: unknown[]) => stmt,
    first: () => Promise.resolve(firstValue),
    all: () => Promise.resolve({ results: allValue }),
    run: () => Promise.resolve({ success: true }),
  };
  return stmt;
}

function makeDB() {
  return { prepare: (_sql: string) => makeStmt() };
}

function makeEnv(authSession?: Session | null) {
  const authFetch = vi.fn().mockResolvedValue(
    new Response(
      JSON.stringify(authSession ? { ok: true, data: authSession } : { ok: false }),
      { status: authSession ? 200 : 401, headers: { "Content-Type": "application/json" } },
    ),
  );
  return {
    DB: makeDB() as unknown as D1Database,
    ASSETS: {} as unknown as R2Bucket,
    AUTH: { fetch: authFetch } as unknown as Fetcher,
    JWT_SECRET: "test-secret",
    VAULT_SECRET: "test-vault-secret",
  };
}

const authedUser: Session = { userId: "u1", email: "a@example.com", expiresAt: Date.now() + 60_000 };

describe("api worker fetch handler", () => {
  it("handles OPTIONS preflight with 204 and CORS headers", async () => {
    const req = new Request("https://api/projects", { method: "OPTIONS" });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 404 for unknown routes", async () => {
    const req = new Request("https://api/unknown");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(404);
  });

  it("adds CORS headers to all responses", async () => {
    const req = new Request("https://api/unknown");
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("returns 401 for /projects without a token", async () => {
    const req = new Request("https://api/projects");
    const res = await worker.fetch(req, makeEnv(null));
    expect(res.status).toBe(401);
  });

  it("returns 401 for /docs without a token", async () => {
    const req = new Request("https://api/docs?projectId=p1");
    const res = await worker.fetch(req, makeEnv(null));
    expect(res.status).toBe(401);
  });

  it("routes GET /projects for an authenticated user", async () => {
    const req = new Request("https://api/projects", {
      headers: { Authorization: "Bearer validtoken" },
    });
    const res = await worker.fetch(req, makeEnv(authedUser));
    expect(res.status).toBe(200);
  });

  it("routes GET /docs?projectId=xxx for an authenticated user", async () => {
    const req = new Request("https://api/docs?projectId=p1", {
      headers: { Authorization: "Bearer validtoken" },
    });
    const res = await worker.fetch(req, makeEnv(authedUser));
    expect(res.status).toBe(200);
  });

  it("proxies POST /register to the auth worker", async () => {
    const authFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const env = {
      DB: makeDB() as unknown as D1Database,
      ASSETS: {} as unknown as R2Bucket,
      AUTH: { fetch: authFetch } as unknown as Fetcher,
      JWT_SECRET: "test-secret",
      VAULT_SECRET: "test-vault-secret",
    };
    const req = new Request("https://api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await worker.fetch(req, env);
    expect(authFetch).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining("/register") }),
    );
  });

  it("proxies POST /login to the auth worker", async () => {
    const authFetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const env = {
      DB: makeDB() as unknown as D1Database,
      ASSETS: {} as unknown as R2Bucket,
      AUTH: { fetch: authFetch } as unknown as Fetcher,
      JWT_SECRET: "test-secret",
      VAULT_SECRET: "test-vault-secret",
    };
    const req = new Request("https://api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    await worker.fetch(req, env);
    expect(authFetch).toHaveBeenCalled();
  });

  it("returns 500 if a handler throws", async () => {
    const throwingDB = {
      prepare: (_sql: string) => ({
        bind: (..._args: unknown[]) => ({ all: () => Promise.reject(new Error("DB error")) }),
      }),
    };
    const env = {
      DB: throwingDB as unknown as D1Database,
      ASSETS: {} as unknown as R2Bucket,
      AUTH: {
        fetch: vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ ok: true, data: authedUser }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
        ),
      } as unknown as Fetcher,
      JWT_SECRET: "test-secret",
      VAULT_SECRET: "test-vault-secret",
    };
    const req = new Request("https://api/projects", {
      headers: { Authorization: "Bearer validtoken" },
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(500);
  });
});
