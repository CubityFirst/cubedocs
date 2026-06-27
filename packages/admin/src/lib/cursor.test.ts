import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor, keysetClause } from "./cursor";

describe("keyset cursor codec", () => {
  it("round-trips a (ts, id) position", () => {
    const cursor = { ts: "2026-05-17T12:34:56.000Z", id: "a1b2-c3d4" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("produces a url-safe token (no +, /, or =)", () => {
    const token = encodeCursor({ ts: "2026-05-17T00:00:00.000Z", id: "????>>>>" });
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

describe("keysetClause", () => {
  it("is empty for a null cursor (first page)", () => {
    expect(keysetClause(null, "u.created_at", "u.id")).toEqual({ sql: "", binds: [] });
  });

  it("emits the predicate + binds with the given column names", () => {
    const cursor = { ts: "2026-05-17T12:34:56.000Z", id: "row-9" };
    const { sql, binds } = keysetClause(cursor, "p.created_at", "p.id");
    expect(sql).toBe("(p.created_at < ? OR (p.created_at = ? AND p.id < ?))");
    expect(binds).toEqual([cursor.ts, cursor.ts, cursor.id]);
  });
});
