import { Hono } from "hono";
import type { AppEnv } from "../index";

const PAGE_SIZE = 25;

export interface AuditCursor {
  // admin_audit_log.created_at of the last row on the page just shown.
  ts: string;
  // admin_audit_log.id of that same row (tiebreak within one second).
  id: string;
}

// Opaque base64url cursor. It only encodes a (created_at, id) position;
// tampering just changes where an already-authorized admin pages from.
export function encodeCursor(cursor: AuditCursor): string {
  return btoa(JSON.stringify(cursor))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeCursor(raw: string): AuditCursor | null {
  try {
    const json = atob(raw.replace(/-/g, "+").replace(/_/g, "/"));
    const obj: unknown = JSON.parse(json);
    if (
      obj &&
      typeof obj === "object" &&
      typeof (obj as AuditCursor).ts === "string" &&
      typeof (obj as AuditCursor).id === "string"
    ) {
      return { ts: (obj as AuditCursor).ts, id: (obj as AuditCursor).id };
    }
    return null;
  } catch {
    return null;
  }
}

interface AuditRow {
  id: string;
  actor_user_id: string;
  actor_email: string;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: string | null;
  created_at: string;
}

const auditRouter = new Hono<AppEnv>();

// GET /api/audit?cursor=<opaque>
//
// Newest-first, keyset-paginated by (created_at DESC, id DESC). Returns
// up to PAGE_SIZE rows plus a `nextCursor` (null when there are no older
// rows). Keyset rather than OFFSET so paging deep into history stays
// O(page) instead of O(offset) — the table only grows.
auditRouter.get("/", async (c) => {
  const rawCursor = c.req.query("cursor");
  let cursor: AuditCursor | null = null;
  if (rawCursor) {
    cursor = decodeCursor(rawCursor);
    if (!cursor) return c.json({ ok: false, error: "Invalid cursor" }, 400);
  }

  const cols =
    "id, actor_user_id, actor_email, action, target_type, target_id, detail, created_at";
  // One extra row tells us whether an older page exists without a count.
  const stmt = cursor
    ? c.env.AUTH_DB.prepare(
        `SELECT ${cols} FROM admin_audit_log
         WHERE created_at < ? OR (created_at = ? AND id < ?)
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      ).bind(cursor.ts, cursor.ts, cursor.id, PAGE_SIZE + 1)
    : c.env.AUTH_DB.prepare(
        `SELECT ${cols} FROM admin_audit_log
         ORDER BY created_at DESC, id DESC
         LIMIT ?`,
      ).bind(PAGE_SIZE + 1);

  const rows = (await stmt.all<AuditRow>()).results;
  const hasMore = rows.length > PAGE_SIZE;
  const entries = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  const last = entries[entries.length - 1];
  const nextCursor =
    hasMore && last ? encodeCursor({ ts: last.created_at, id: last.id }) : null;

  return c.json({ ok: true, data: { entries, nextCursor } });
});

export { auditRouter };
