import { describe, it, expect, vi } from "vitest";
import worker from "./index";

function makeStmt() {
  const stmt = {
    bind: vi.fn(),
    first: vi.fn().mockResolvedValue(null),
    run: vi.fn().mockResolvedValue({ success: true }),
  };
  stmt.bind.mockReturnValue(stmt);
  return stmt;
}

function makeEnv() {
  return {
    DB: { prepare: vi.fn().mockReturnValue(makeStmt()) } as unknown as D1Database,
    JWT_SECRET: "test-secret",
    JWT_ISSUER: "test",
  };
}

describe("auth worker fetch handler", () => {
  it("handles OPTIONS preflight with 204 and CORS headers", async () => {
    const req = new Request("https://auth/register", { method: "OPTIONS" });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("POST");
  });

  it("returns 404 for unknown routes", async () => {
    const req = new Request("https://auth/unknown-route");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(404);
  });

  it("adds CORS headers to all responses", async () => {
    const req = new Request("https://auth/unknown-route");
    const res = await worker.fetch(req, makeEnv());
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("routes POST /register — missing body returns 400", async () => {
    const req = new Request("https://auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it("routes POST /login — missing body returns 400", async () => {
    const req = new Request("https://auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(400);
  });

  it("routes GET /verify — no token returns 401", async () => {
    const req = new Request("https://auth/verify");
    const res = await worker.fetch(req, makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 500 if a handler throws", async () => {
    const env = {
      DB: {
        prepare: vi.fn().mockImplementation(() => {
          const s = { bind: vi.fn(), first: vi.fn().mockRejectedValue(new Error("DB error")), run: vi.fn() };
          s.bind.mockReturnValue(s);
          return s;
        }),
      } as unknown as D1Database,
      JWT_SECRET: "test-secret",
      JWT_ISSUER: "test",
    };
    const req = new Request("https://auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "a@b.com", password: "pass", name: "Alice" }),
    });
    const res = await worker.fetch(req, env);
    expect(res.status).toBe(500);
  });
});
