import { describe, it, expect, vi } from "vitest";
import { handleRegister } from "./register";
import type { Env } from "../index";

function makeRequest(body: object): Request {
  return new Request("https://auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeStmt(firstValue: unknown = null) {
  const stmt = {
    bind: vi.fn(),
    first: vi.fn().mockResolvedValue(firstValue),
    run: vi.fn().mockResolvedValue({ success: true }),
  };
  stmt.bind.mockReturnValue(stmt);
  return stmt;
}

function makeEnv(existingUser = false): Env {
  const selectStmt = makeStmt(existingUser ? { id: "existing" } : null);
  const insertStmt = makeStmt();
  const db = {
    prepare: vi.fn()
      .mockReturnValueOnce(selectStmt)
      .mockReturnValueOnce(insertStmt),
  };
  return { DB: db as unknown as D1Database, JWT_SECRET: "test-secret", JWT_ISSUER: "test" };
}

describe("handleRegister", () => {
  it("returns 400 if email is missing", async () => {
    const res = await handleRegister(makeRequest({ password: "pass", name: "Alice" }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 if password is missing", async () => {
    const res = await handleRegister(makeRequest({ email: "a@b.com", name: "Alice" }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 400 if name is missing", async () => {
    const res = await handleRegister(makeRequest({ email: "a@b.com", password: "pass" }), makeEnv());
    expect(res.status).toBe(400);
  });

  it("returns 409 if the email already exists", async () => {
    const res = await handleRegister(
      makeRequest({ email: "taken@example.com", password: "pass", name: "Alice" }),
      makeEnv(true),
    );
    expect(res.status).toBe(409);
  });

  it("returns 201 with token and user on success", async () => {
    const res = await handleRegister(
      makeRequest({ email: "new@example.com", password: "password123", name: "Bob" }),
      makeEnv(),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    const data = body.data as Record<string, unknown>;
    expect(typeof data.token).toBe("string");
    expect((data.user as Record<string, unknown>).email).toBe("new@example.com");
    expect((data.user as Record<string, unknown>).name).toBe("Bob");
  });

  it("lowercases the email", async () => {
    const res = await handleRegister(
      makeRequest({ email: "USER@EXAMPLE.COM", password: "pass", name: "Alice" }),
      makeEnv(),
    );
    const body = await res.json() as Record<string, unknown>;
    expect(((body.data as Record<string, unknown>).user as Record<string, unknown>).email).toBe("user@example.com");
  });

  it("response includes a createdAt timestamp", async () => {
    const res = await handleRegister(
      makeRequest({ email: "u@example.com", password: "pass", name: "U" }),
      makeEnv(),
    );
    const body = await res.json() as Record<string, unknown>;
    const user = (body.data as Record<string, unknown>).user as Record<string, unknown>;
    expect(typeof user.createdAt).toBe("string");
  });
});
