import { describe, it, expect } from "vitest";
import { signJwt, verifyJwt } from "./jwt";
import type { Session } from "./lib";

const SECRET = "test-secret-key";

function makeSession(overrides?: Partial<Session>): Session {
  return {
    userId: "user-123",
    email: "test@example.com",
    expiresAt: Date.now() + 60_000,
    ...overrides,
  };
}

describe("signJwt", () => {
  it("returns a string with three dot-separated parts", async () => {
    const token = await signJwt(makeSession(), SECRET);
    expect(token.split(".")).toHaveLength(3);
  });

  it("encodes the correct header (alg: HS256, typ: JWT)", async () => {
    const token = await signJwt(makeSession(), SECRET);
    const header = JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    expect(header).toEqual({ alg: "HS256", typ: "JWT" });
  });

  it("encodes the payload in the second segment", async () => {
    const session = makeSession();
    const token = await signJwt(session, SECRET);
    const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    expect(payload.userId).toBe(session.userId);
    expect(payload.email).toBe(session.email);
    expect(payload.expiresAt).toBe(session.expiresAt);
  });

  it("produces different tokens for different secrets", async () => {
    const session = makeSession();
    const t1 = await signJwt(session, "secret-a");
    const t2 = await signJwt(session, "secret-b");
    expect(t1.split(".")[2]).not.toBe(t2.split(".")[2]);
  });
});

describe("verifyJwt", () => {
  it("returns the session for a valid token", async () => {
    const session = makeSession();
    const token = await signJwt(session, SECRET);
    const result = await verifyJwt(token, SECRET);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe(session.userId);
    expect(result?.email).toBe(session.email);
    expect(result?.expiresAt).toBe(session.expiresAt);
  });

  it("returns null for a tampered signature", async () => {
    const token = await signJwt(makeSession(), SECRET);
    const [header, payload] = token.split(".");
    const tampered = `${header}.${payload}.invalidsignature`;
    expect(await verifyJwt(tampered, SECRET)).toBeNull();
  });

  it("returns null for a token signed with a different secret", async () => {
    const token = await signJwt(makeSession(), "other-secret");
    expect(await verifyJwt(token, SECRET)).toBeNull();
  });

  it("returns null for a malformed token (two parts)", async () => {
    expect(await verifyJwt("foo.bar", SECRET)).toBeNull();
  });

  it("returns null for a malformed token (one part)", async () => {
    expect(await verifyJwt("onlyone", SECRET)).toBeNull();
  });

  it("returns null for an empty string", async () => {
    expect(await verifyJwt("", SECRET)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const session = makeSession({ expiresAt: Date.now() - 1000 });
    const token = await signJwt(session, SECRET);
    expect(await verifyJwt(token, SECRET)).toBeNull();
  });

  it("round-trips correctly (sign then verify)", async () => {
    const session = makeSession();
    const token = await signJwt(session, SECRET);
    const result = await verifyJwt(token, SECRET);
    expect(result).toEqual(session);
  });
});
