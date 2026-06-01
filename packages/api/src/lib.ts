export interface Session {
  userId: string;
  email: string;
  expiresAt: number;
  personalPlan?: "free" | "ink";
  personalPlanSince?: number | null;
  personalPlanStatus?: string | null;
  personalPlanCancelAt?: number | null;
  personalPlanStyle?: string | null;
  personalPresenceColor?: string | null;
  personalCritSparkles?: boolean;
  readingFont?: string | null;
  editingFont?: string | null;
  uiFont?: string | null;
  // Global site admin flag. Propagated from the auth session so admin-only
  // features (e.g. the theme picker) can be gated server- and client-side.
  isAdmin?: boolean;
  // Per-user site theme. themeMode ∈ {dark,light,custom}; NULL = dark default.
  themeMode?: string | null;
  themeCustomColor?: string | null;
}

export interface Folder {
  id: string;
  name: string;
  project_id: string;
  parent_id: string | null;
  created_at: string;
}

export interface Doc {
  id: string;
  title: string;
  content: string;
  projectId: string;
  authorId: string;
  publishedAt: string | null;
  show_heading: number;
  show_last_updated: number;
  sidebar_position: number | null;
  createdAt: string;
  updatedAt: string;
}

export const ProjectFeatures = {
  CUSTOM_LINK: 1,
  AI_FEATURES: 2,
  REALTIME:    4,
} as const;

export interface Project {
  id: string;
  name: string;
  ownerId: string;
  createdAt: string;
  vanity_slug: string | null;
  features: number;
  ai_enabled: number;
  graph_enabled: number;
  published_graph_enabled: number;
  graph_tag_colors: string | null;
  graph_reindex_available_at: string | null;
  home_doc_id: string | null;
  logo_square_updated_at: string | null;
  logo_wide_updated_at: string | null;
}

export type Role = "limited" | "viewer" | "editor" | "admin" | "owner";

export interface Member {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  name: string;
  role: Role;
  invitedBy: string;
  createdAt: string;
}

export const ROLE_RANK: Record<Role, number> = {
  limited: -1,
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
};

export const Errors = {
  UNAUTHORIZED: { error: "Unauthorized", status: 401 },
  FORBIDDEN:    { error: "Forbidden", status: 403 },
  NOT_FOUND:    { error: "Not found", status: 404 },
  CONFLICT:     { error: "Already exists", status: 409 },
  BAD_REQUEST:  { error: "Bad request", status: 400 },
  INTERNAL:     { error: "Internal server error", status: 500 },
  RATE_LIMITED: { error: "rate_limited", status: 429 },
} as const;

export function errorResponse(err: typeof Errors[keyof typeof Errors]): Response {
  return Response.json({ ok: false, ...err }, { status: err.status });
}

export function okResponse<T>(data: T, status = 200): Response {
  return Response.json({ ok: true, data }, { status });
}

// Validates that a target folder exists inside the given project (and, when
// `type` is supplied, is of that kind). Doc/file/folder create+move handlers
// call this before writing a folder_id/parent_id so a member of project A
// can't re-parent a resource under a folder id belonging to a project they
// have no access to (a cross-project integrity break). A null/empty target is
// the project root and is always valid.
export async function folderInProject(
  db: D1Database,
  folderId: string | null | undefined,
  projectId: string,
  type?: string,
): Promise<boolean> {
  if (!folderId) return true; // project root
  const row = await db
    .prepare(
      "SELECT 1 AS ok FROM folders WHERE id = ? AND project_id = ?" + (type ? " AND type = ?" : ""),
    )
    .bind(...(type ? [folderId, projectId, type] : [folderId, projectId]))
    .first<{ ok: number }>();
  return !!row;
}

// True if re-parenting `folderId` under `newParentId` would create a cycle —
// i.e. the new parent is the folder itself or one of its descendants. Walks the
// new parent's ancestor chain; a cycle exists iff `folderId` appears in it.
// Prevents an infinite loop in the recursive subtree CTEs (a DoS vector).
export async function wouldCreateFolderCycle(
  db: D1Database,
  folderId: string,
  newParentId: string,
): Promise<boolean> {
  const hit = await db
    .prepare(
      `WITH RECURSIVE up(id, parent_id) AS (
         SELECT id, parent_id FROM folders WHERE id = ?
         UNION ALL
         SELECT f.id, f.parent_id FROM folders f JOIN up ON f.id = up.parent_id
       )
       SELECT 1 AS ok FROM up WHERE id = ? LIMIT 1`,
    )
    .bind(newParentId, folderId)
    .first<{ ok: number }>();
  return !!hit;
}

// MIME types safe to render `inline` in the browser. Stored files are served
// from the same origin as the SPA (docs.cubityfir.st), so a file the user can
// navigate to runs in our security context. Anything NOT on this allowlist —
// notably text/html and image/svg+xml, both of which can carry script — is
// forced to download as application/octet-stream so it can never execute as a
// document in our origin (stored-XSS defence).
const INLINE_SAFE_MIME = new Set([
  "image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "image/bmp", "image/x-icon",
  "application/pdf",
  "audio/mpeg", "audio/ogg", "audio/wav", "audio/webm", "audio/mp4", "audio/aac", "audio/flac",
  "video/mp4", "video/webm", "video/ogg",
  "text/plain",
]);

// Headers for serving a stored blob safely. `inline` (with the declared
// Content-Type) only for the allowlist; otherwise download as octet-stream.
// `nosniff` blocks MIME-sniffing so e.g. an HTML payload uploaded as image/png
// can't be re-interpreted as a document. The filename is stripped of quotes,
// backslashes and control chars to prevent Content-Disposition header injection.
export function fileServeHeaders(mimeType: string | null, filename: string): Record<string, string> {
  const declared = (mimeType ?? "").trim();
  const base = declared.toLowerCase().split(";")[0].trim();
  const safe = INLINE_SAFE_MIME.has(base);
  const safeName = (filename || "file").replace(/["\\\r\n\t]/g, "_");
  return {
    "Content-Type": safe ? declared : "application/octet-stream",
    "Content-Disposition": `${safe ? "inline" : "attachment"}; filename="${safeName}"`,
    "X-Content-Type-Options": "nosniff",
  };
}
