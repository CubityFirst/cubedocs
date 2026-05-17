import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "./audit";

describe("audit cursor", () => {
  it("round-trips a (ts, id) position", () => {
    const cursor = { ts: "2026-05-17 12:34:56", id: "a1b2-c3d4" };
    const decoded = decodeCursor(encodeCursor(cursor));
    expect(decoded).toEqual(cursor);
  });

  it("produces a url-safe token (no +, /, or =)", () => {
    const token = encodeCursor({ ts: "2026-05-17 00:00:00", id: "????>>>>" });
    expect(token).not.toMatch(/[+/=]/);
  });

  it("returns null for a malformed cursor", () => {
    expect(decodeCursor("not-base64-$$$")).toBeNull();
  });

  it("returns null when the shape is wrong", () => {
    const bad = btoa(JSON.stringify({ ts: 123 })).replace(/=+$/, "");
    expect(decodeCursor(bad)).toBeNull();
  });
});
