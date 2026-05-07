import { describe, it, expect } from "vitest";
import { signJwt, verifyJwt } from "./jwt";
import type { Session } from "./lib";

const SECRET = "test-jwt-secret";
const PAYLOAD: Session = {
  userId: "user-abc",
  email: "test@example.com",
  expiresAt: Date.now() + 60_000,
};

describe("signJwt / verifyJwt", () => {
  it("round-trips: verify returns the original payload", async () => {
    const token = await signJwt(PAYLOAD, SECRET);
    const session = await verifyJwt(token, SECRET);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe(PAYLOAD.userId);
    expect(session!.email).toBe(PAYLOAD.email);
    expect(session!.expiresAt).toBe(PAYLOAD.expiresAt);
  });

  it("produces a three-part dot-separated string", async () => {
    const token = await signJwt(PAYLOAD, SECRET);
    expect(token.split(".")).toHaveLength(3);
  });

  it("returns null when verified with the wrong secret", async () => {
    const token = await signJwt(PAYLOAD, SECRET);
    expect(await verifyJwt(token, "wrong-secret")).toBeNull();
  });

  it("returns null for a token with only two parts", async () => {
    expect(await verifyJwt("header.payload", SECRET)).toBeNull();
  });

  it("returns null for an empty string", async () => {
    expect(await verifyJwt("", SECRET)).toBeNull();
  });

  it("returns null for a token with a tampered payload", async () => {
    const token = await signJwt(PAYLOAD, SECRET);
    const [h, , s] = token.split(".");
    const tampered = btoa(JSON.stringify({ ...PAYLOAD, isAdmin: true }))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
    expect(await verifyJwt(`${h}.${tampered}.${s}`, SECRET)).toBeNull();
  });

  it("returns null for an expired token", async () => {
    const expired: Session = { ...PAYLOAD, expiresAt: Date.now() - 1000 };
    const token = await signJwt(expired, SECRET);
    expect(await verifyJwt(token, SECRET)).toBeNull();
  });

  it("preserves optional isAdmin field", async () => {
    const admin: Session = { ...PAYLOAD, isAdmin: true };
    const token = await signJwt(admin, SECRET);
    const session = await verifyJwt(token, SECRET);
    expect(session!.isAdmin).toBe(true);
  });

  it("preserves optional forcePasswordChange field", async () => {
    const forced: Session = { ...PAYLOAD, forcePasswordChange: true };
    const token = await signJwt(forced, SECRET);
    const session = await verifyJwt(token, SECRET);
    expect(session!.forcePasswordChange).toBe(true);
  });

  it("different secrets produce different tokens for the same payload", async () => {
    const t1 = await signJwt(PAYLOAD, "secret-a");
    const t2 = await signJwt(PAYLOAD, "secret-b");
    expect(t1).not.toBe(t2);
  });
});
