// Opaque base64url keyset cursor encoding a (created_at, id) position.
//
// Shared by the paginated admin list endpoints (audit, users, projects):
// each sorts newest-first by (created_at DESC, id DESC) and pages by seeking
// to the last row already shown, which keeps deep paging O(page) instead of
// O(offset). The cursor only encodes a position, so tampering merely changes
// where an already-authorized admin pages from - it is intentionally not signed.

export interface KeysetCursor {
  // created_at of the last row on the page just shown.
  ts: string;
  // id of that same row (tiebreak within an equal created_at).
  id: string;
}

export function encodeCursor(cursor: KeysetCursor): string {
  return btoa(JSON.stringify(cursor))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeCursor(raw: string): KeysetCursor | null {
  try {
    const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const obj: unknown = JSON.parse(json);
    if (
      obj &&
      typeof obj === "object" &&
      typeof (obj as KeysetCursor).ts === "string" &&
      typeof (obj as KeysetCursor).id === "string"
    ) {
      return { ts: (obj as KeysetCursor).ts, id: (obj as KeysetCursor).id };
    }
    return null;
  } catch {
    return null;
  }
}

// The keyset predicate + binds selecting rows strictly "older" than the
// cursor under ORDER BY (<tsCol> DESC, <idCol> DESC). Column names are
// caller-supplied SQL identifiers (e.g. "u.created_at" / "u.id") and must
// NEVER be user input. Returns an empty clause for a null cursor (first page).
export function keysetClause(
  cursor: KeysetCursor | null,
  tsCol: string,
  idCol: string,
): { sql: string; binds: string[] } {
  if (!cursor) return { sql: "", binds: [] };
  return {
    sql: `(${tsCol} < ? OR (${tsCol} = ? AND ${idCol} < ?))`,
    binds: [cursor.ts, cursor.ts, cursor.id],
  };
}
