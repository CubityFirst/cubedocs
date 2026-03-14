import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "./password";

describe("hashPassword", () => {
  it("returns a colon-separated hex string (salt:hash)", async () => {
    const hash = await hashPassword("mypassword");
    expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
  });

  it("produces a different hash each call due to random salt", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    expect(h1).not.toBe(h2);
  });

  it("returns a 32-byte (64 hex char) salt", async () => {
    const [saltHex] = (await hashPassword("password")).split(":");
    expect(saltHex).toHaveLength(32); // 16 bytes = 32 hex chars
  });
});

describe("verifyPassword", () => {
  it("returns true for a correct password", async () => {
    const stored = await hashPassword("correct-horse");
    expect(await verifyPassword("correct-horse", stored)).toBe(true);
  });

  it("returns false for an incorrect password", async () => {
    const stored = await hashPassword("correct-horse");
    expect(await verifyPassword("wrong-password", stored)).toBe(false);
  });

  it("returns false for an empty password when stored hash is non-empty", async () => {
    const stored = await hashPassword("non-empty");
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("is case-sensitive", async () => {
    const stored = await hashPassword("Password");
    expect(await verifyPassword("password", stored)).toBe(false);
    expect(await verifyPassword("Password", stored)).toBe(true);
  });
});
