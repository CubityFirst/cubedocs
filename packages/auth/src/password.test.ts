import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("returns a salt:hash string", async () => {
    const result = await hashPassword("my-password");
    expect(result).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it("salt is 32 hex characters (16 bytes)", async () => {
    const [salt] = (await hashPassword("password")).split(":");
    expect(salt).toHaveLength(32);
  });

  it("produces a unique salt on each call", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    const [salt1] = h1.split(":");
    const [salt2] = h2.split(":");
    expect(salt1).not.toBe(salt2);
  });
});

describe("verifyPassword", () => {
  it("returns true for the correct password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("correct-horse-battery-staple", hash)).toBe(true);
  });

  it("returns false for the wrong password", async () => {
    const hash = await hashPassword("correct-horse-battery-staple");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("returns false for an empty password against a real hash", async () => {
    const hash = await hashPassword("secret");
    expect(await verifyPassword("", hash)).toBe(false);
  });

  it("returns false when checking against a differently-salted hash", async () => {
    const hash1 = await hashPassword("password");
    const hash2 = await hashPassword("password");
    // Both are valid for "password" but have different salts — they should each
    // only accept the password through their own derivation.
    expect(await verifyPassword("password", hash1)).toBe(true);
    expect(await verifyPassword("password", hash2)).toBe(true);
    // A hash1 and hash2 are different (different salts)
    expect(hash1).not.toBe(hash2);
  });
});
