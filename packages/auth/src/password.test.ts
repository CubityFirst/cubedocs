import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, needsRehash } from "./password";

describe("hashPassword", () => {
  it("returns the versioned pbkdf2 format", async () => {
    const result = await hashPassword("my-password");
    expect(result).toMatch(/^pbkdf2-1\$\d+\$[0-9a-f]+\$[0-9a-f]+$/);
  });

  it("encodes the iteration count in the hash", async () => {
    const [, iter] = (await hashPassword("password")).split("$");
    expect(Number.parseInt(iter, 10)).toBeGreaterThanOrEqual(600_000);
  });

  it("produces a unique salt on each call", async () => {
    const h1 = await hashPassword("same-password");
    const h2 = await hashPassword("same-password");
    expect(h1).not.toBe(h2);
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

  it("verifies legacy <salt>:<hash> format with old iteration count", async () => {
    // Built by deriving PBKDF2-HMAC-SHA256 at 100k iterations against a
    // fixed salt; previously the only stored format. Must remain
    // verifiable so existing accounts keep working until next login.
    const enc = new TextEncoder();
    const salt = new Uint8Array(16).fill(0xab);
    const base = await crypto.subtle.importKey(
      "raw", enc.encode("legacy-pass"), "PBKDF2", false, ["deriveBits", "deriveKey"],
    );
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt.buffer.slice(0), iterations: 100_000, hash: "SHA-256" },
      base,
      { name: "HMAC", hash: "SHA-256", length: 256 },
      true,
      ["sign"],
    );
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", key));
    const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, "0")).join("");
    const stored = `${toHex(salt)}:${toHex(raw)}`;
    expect(await verifyPassword("legacy-pass", stored)).toBe(true);
    expect(await verifyPassword("wrong", stored)).toBe(false);
  });
});

describe("needsRehash", () => {
  it("returns true for legacy <salt>:<hash> format", async () => {
    expect(needsRehash("aabb:ccdd")).toBe(true);
  });

  it("returns false for a hash at the current iteration count", async () => {
    const hash = await hashPassword("any");
    expect(needsRehash(hash)).toBe(false);
  });

  it("returns true for a hash at a lower iteration count", () => {
    expect(needsRehash("pbkdf2-1$100000$aabb$ccdd")).toBe(true);
  });

  it("returns true for a malformed versioned hash", () => {
    expect(needsRehash("pbkdf2-1$notanumber$aa$bb")).toBe(true);
  });
});
