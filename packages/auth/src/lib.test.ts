import { describe, it, expect } from "vitest";
import { normalizeEmail } from "./lib";

describe("normalizeEmail", () => {
  it("strips leading and trailing whitespace", () => {
    expect(normalizeEmail("  user@example.com  ")).toBe("user@example.com");
  });

  it("strips tabs and newlines as well as spaces", () => {
    expect(normalizeEmail("\tuser@example.com\n")).toBe("user@example.com");
  });

  it("lowercases the address", () => {
    expect(normalizeEmail("User@Example.COM")).toBe("user@example.com");
  });

  it("trims and lowercases together so register and login resolve identically", () => {
    expect(normalizeEmail("  User@Example.com ")).toBe(normalizeEmail("user@example.com"));
  });

  it("returns empty string for a whitespace-only input (caller rejects it)", () => {
    expect(normalizeEmail("   ")).toBe("");
  });

  it("leaves interior characters untouched (only edges are trimmed)", () => {
    expect(normalizeEmail("a.b+tag@sub.example.com")).toBe("a.b+tag@sub.example.com");
  });
});
