import { describe, it, expect } from "vitest";
import { handleVerify } from "./verify";
import { signJwt } from "../jwt";
import type { Session } from "../lib";
import type { Env } from "../index";

const JWT_SECRET = "test-secret";

function makeEnv(): Env {
  return { DB: {} as unknown as D1Database, JWT_SECRET, JWT_ISSUER: "test" };
}

function makeSession(): Session {
  return { userId: "u1", email: "a@example.com", expiresAt: Date.now() + 60_000 };
}

describe("handleVerify", () => {
  it("returns 401 if Authorization header is absent", async () => {
    const req = new Request("https://auth/verify");
    const res = await handleVerify(req, makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 401 if Authorization header does not start with 'Bearer '", async () => {
    const req = new Request("https://auth/verify", {
      headers: { Authorization: "Basic sometoken" },
    });
    const res = await handleVerify(req, makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 401 for a malformed/invalid token", async () => {
    const req = new Request("https://auth/verify", {
      headers: { Authorization: "Bearer not.a.valid.jwt" },
    });
    const res = await handleVerify(req, makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 401 for a token signed with the wrong secret", async () => {
    const token = await signJwt(makeSession(), "wrong-secret");
    const req = new Request("https://auth/verify", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await handleVerify(req, makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    const token = await signJwt({ ...makeSession(), expiresAt: Date.now() - 1000 }, JWT_SECRET);
    const req = new Request("https://auth/verify", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await handleVerify(req, makeEnv());
    expect(res.status).toBe(401);
  });

  it("returns 200 with the session for a valid token", async () => {
    const session = makeSession();
    const token = await signJwt(session, JWT_SECRET);
    const req = new Request("https://auth/verify", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const res = await handleVerify(req, makeEnv());
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect((body.data as Record<string, unknown>).userId).toBe(session.userId);
    expect((body.data as Record<string, unknown>).email).toBe(session.email);
  });
});
