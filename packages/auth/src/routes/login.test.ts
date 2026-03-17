import { describe, it, expect, vi } from "vitest";
import { handleLogin } from "./login";
import { hashPassword } from "../password";
import type { Env } from "../index";

function makeRequest(body: object): Request {
  return new Request("https://auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function makeEnv(user?: {
  id: string;
  email: string;
  name: string;
  password: string;
} | null): Promise<Env> {
  let row = null;
  if (user) {
    row = {
      id: user.id,
      email: user.email,
      name: user.name,
      password_hash: await hashPassword(user.password),
      created_at: new Date().toISOString(),
    };
  }
  const stmt = {
    bind: vi.fn(),
    first: vi.fn().mockResolvedValue(row),
  };
  stmt.bind.mockReturnValue(stmt);
  return {
    DB: { prepare: vi.fn().mockReturnValue(stmt) } as unknown as D1Database,
    JWT_SECRET: "test-secret",
    JWT_ISSUER: "test",
    TURNSTILE_SECRET: "test-turnstile",
    WEBAUTHN_RP_ID: "localhost",
    WEBAUTHN_RP_NAME: "Test",
    WEBAUTHN_ORIGIN: "http://localhost",
  };
}

describe("handleLogin", () => {
  it("returns 400 if email is missing", async () => {
    const env = await makeEnv(null);
    const res = await handleLogin(makeRequest({ password: "pass" }), env);
    expect(res.status).toBe(400);
  });

  it("returns 400 if password is missing", async () => {
    const env = await makeEnv(null);
    const res = await handleLogin(makeRequest({ email: "a@b.com" }), env);
    expect(res.status).toBe(400);
  });

  it("returns 401 if user is not found", async () => {
    const env = await makeEnv(null);
    const res = await handleLogin(makeRequest({ email: "nobody@example.com", password: "pass" }), env);
    expect(res.status).toBe(401);
  });

  it("returns 401 if the password is wrong", async () => {
    const env = await makeEnv({ id: "u1", email: "a@example.com", name: "Alice", password: "correct" });
    const res = await handleLogin(makeRequest({ email: "a@example.com", password: "wrong" }), env);
    expect(res.status).toBe(401);
  });

  it("returns 200 with token and user on success", async () => {
    const env = await makeEnv({ id: "u1", email: "a@example.com", name: "Alice", password: "correct" });
    const res = await handleLogin(makeRequest({ email: "a@example.com", password: "correct" }), env);
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    const data = body.data as Record<string, unknown>;
    expect(typeof data.token).toBe("string");
    expect((data.user as Record<string, unknown>).id).toBe("u1");
    expect((data.user as Record<string, unknown>).email).toBe("a@example.com");
  });
});
