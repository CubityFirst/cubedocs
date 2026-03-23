import {
  okResponse,
  errorResponse,
  Errors,
  ROLE_RANK,
  type Role,
  type Session,
  type SystemCategory,
  type SystemEnvironment,
  type SystemRecord,
  type SystemStatus,
} from "../lib";
import type { Env } from "../index";

const SYSTEM_CATEGORIES = new Set<SystemCategory>([
  "app",
  "service",
  "server",
  "vendor",
  "environment",
  "domain",
  "database",
  "internal_tool",
]);

const SYSTEM_STATUSES = new Set<SystemStatus>([
  "active",
  "planned",
  "maintenance",
  "deprecated",
]);

const SYSTEM_ENVIRONMENTS = new Set<SystemEnvironment>([
  "production",
  "staging",
  "development",
  "test",
  "other",
]);

type SystemListRow = SystemRecord & {
  linked_doc_count?: number;
  linked_password_count?: number;
  attached_file_count?: number;
};

async function getCallerRole(db: D1Database, projectId: string, userId: string): Promise<Role | null> {
  const row = await db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?")
    .bind(projectId, userId).first<{ role: Role }>();
  return row?.role ?? null;
}

async function ensureFolder(
  db: D1Database,
  projectId: string,
  folderId: string | null | undefined,
): Promise<boolean> {
  if (folderId === undefined || folderId === null) return true;
  const row = await db.prepare("SELECT id FROM folders WHERE id = ? AND project_id = ? AND type = 'systems'")
    .bind(folderId, projectId).first<{ id: string }>();
  return !!row;
}

async function ensureProjectScopedIds(
  db: D1Database,
  table: "docs" | "passwords",
  projectId: string,
  ids: string[],
): Promise<boolean> {
  if (ids.length === 0) return true;
  const placeholders = ids.map(() => "?").join(", ");
  const row = await db.prepare(
    `SELECT COUNT(*) AS count FROM ${table} WHERE project_id = ? AND id IN (${placeholders})`,
  ).bind(projectId, ...ids).first<{ count: number }>();
  return (row?.count ?? 0) === ids.length;
}

async function ensureSystemFiles(
  db: D1Database,
  projectId: string,
  fileIds: string[],
): Promise<boolean> {
  if (fileIds.length === 0) return true;
  const placeholders = fileIds.map(() => "?").join(", ");
  const row = await db.prepare(
    `SELECT COUNT(*) AS count FROM files WHERE project_id = ? AND type = 'systems' AND id IN (${placeholders})`,
  ).bind(projectId, ...fileIds).first<{ count: number }>();
  return (row?.count ?? 0) === fileIds.length;
}

function normalizeNullableString(value: string | null | undefined): string | null | undefined {
  if (value === undefined) return undefined;
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function normalizeEnvironment(value: string | null | undefined): SystemEnvironment | null | undefined {
  if (value === undefined) return undefined;
  const normalized = value === null ? null : value.trim();
  if (!normalized) return null;
  return normalized as SystemEnvironment;
}

function normalizeCategory(value: string | null | undefined): { category: SystemCategory; categoryLabel: string | null } | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  const canonical = normalized.toLowerCase().replace(/[\s-]+/g, "_");
  if (SYSTEM_CATEGORIES.has(canonical as SystemCategory)) {
    return { category: canonical as SystemCategory, categoryLabel: null };
  }
  return { category: "service", categoryLabel: normalized };
}

export async function handleSystems(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  const parts = url.pathname.replace(/^\/systems\/?/, "").split("/");
  const systemId = parts[0] || null;
  const params = url.searchParams;

  if (!systemId && request.method === "GET") {
    const projectId = params.get("projectId");
    if (!projectId) return errorResponse(Errors.BAD_REQUEST);

    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);

    const q = params.get("q");
    const folderId = params.get("folderId");
    const base = `
      SELECT
        s.*,
        (SELECT COUNT(*) FROM system_doc_links sdl WHERE sdl.system_id = s.id) AS linked_doc_count,
        (SELECT COUNT(*) FROM system_password_links spl WHERE spl.system_id = s.id) AS linked_password_count,
        (SELECT COUNT(*) FROM files f WHERE f.system_id = s.id AND f.type = 'systems') AS attached_file_count
      FROM systems s
    `;

    let rows;
    if (q) {
      const rootFolderId = params.get("rootFolderId");
      const search = `%${q}%`;
      if (rootFolderId) {
        rows = await env.DB.prepare(`
          WITH RECURSIVE subtree(id) AS (
            SELECT id FROM folders WHERE id = ?
            UNION ALL
            SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
          )
          ${base}
          WHERE s.project_id = ? AND s.folder_id IN (SELECT id FROM subtree)
            AND (
              LOWER(s.name) LIKE LOWER(?)
              OR LOWER(COALESCE(s.owner, '')) LIKE LOWER(?)
              OR LOWER(COALESCE(s.primary_url, '')) LIKE LOWER(?)
              OR LOWER(s.category) LIKE LOWER(?)
              OR LOWER(s.status) LIKE LOWER(?)
              OR LOWER(COALESCE(s.environment, '')) LIKE LOWER(?)
            )
          ORDER BY s.name ASC
        `).bind(rootFolderId, projectId, search, search, search, search, search, search).all<SystemListRow>();
      } else {
        rows = await env.DB.prepare(`
          ${base}
          WHERE s.project_id = ?
            AND (
              LOWER(s.name) LIKE LOWER(?)
              OR LOWER(COALESCE(s.owner, '')) LIKE LOWER(?)
              OR LOWER(COALESCE(s.primary_url, '')) LIKE LOWER(?)
              OR LOWER(s.category) LIKE LOWER(?)
              OR LOWER(s.status) LIKE LOWER(?)
              OR LOWER(COALESCE(s.environment, '')) LIKE LOWER(?)
            )
          ORDER BY s.name ASC
        `).bind(projectId, search, search, search, search, search, search).all<SystemListRow>();
      }
      return okResponse(rows.results);
    }

    if (folderId) {
      rows = await env.DB.prepare(`${base} WHERE s.project_id = ? AND s.folder_id = ? ORDER BY s.name ASC`)
        .bind(projectId, folderId).all<SystemListRow>();
    } else if (params.has("folderId")) {
      rows = await env.DB.prepare(`${base} WHERE s.project_id = ? AND s.folder_id IS NULL ORDER BY s.name ASC`)
        .bind(projectId).all<SystemListRow>();
    } else {
      rows = await env.DB.prepare(`${base} WHERE s.project_id = ? ORDER BY s.updated_at DESC`)
        .bind(projectId).all<SystemListRow>();
    }
    return okResponse(rows.results);
  }

  if (!systemId && request.method === "POST") {
    const body = await request.json<{
      name: string;
      category: string;
      status: SystemStatus;
      environment?: SystemEnvironment | null;
      owner?: string | null;
      primaryUrl?: string | null;
      notes?: string | null;
      renewalDate?: string | null;
      projectId: string;
      folderId?: string | null;
      linkedDocIds?: string[];
      linkedPasswordIds?: string[];
      linkedFileIds?: string[];
    }>();
    const normalizedCategory = normalizeCategory(body.category);
    if (!body.name?.trim() || !body.projectId || !normalizedCategory || !SYSTEM_STATUSES.has(body.status)) {
      return errorResponse(Errors.BAD_REQUEST);
    }

    const normalizedEnvironment = normalizeEnvironment(body.environment);
    if (normalizedEnvironment !== null && normalizedEnvironment !== undefined && !SYSTEM_ENVIRONMENTS.has(normalizedEnvironment)) {
      return errorResponse(Errors.BAD_REQUEST);
    }

    const role = await getCallerRole(env.DB, body.projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    if (!(await ensureFolder(env.DB, body.projectId, body.folderId))) return errorResponse(Errors.BAD_REQUEST);

    const linkedDocIds = [...new Set(body.linkedDocIds ?? [])];
    const linkedPasswordIds = [...new Set(body.linkedPasswordIds ?? [])];
    const linkedFileIds = [...new Set(body.linkedFileIds ?? [])];
    if (!(await ensureProjectScopedIds(env.DB, "docs", body.projectId, linkedDocIds))) return errorResponse(Errors.BAD_REQUEST);
    if (!(await ensureProjectScopedIds(env.DB, "passwords", body.projectId, linkedPasswordIds))) return errorResponse(Errors.BAD_REQUEST);
    if (!(await ensureSystemFiles(env.DB, body.projectId, linkedFileIds))) return errorResponse(Errors.BAD_REQUEST);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const record: SystemRecord = {
      id,
      name: body.name.trim(),
      category: normalizedCategory.category,
      category_label: normalizedCategory.categoryLabel,
      status: body.status,
      environment: normalizedEnvironment ?? null,
      owner: normalizeNullableString(body.owner) ?? null,
      primary_url: normalizeNullableString(body.primaryUrl) ?? null,
      notes: normalizeNullableString(body.notes) ?? null,
      renewal_date: normalizeNullableString(body.renewalDate) ?? null,
      project_id: body.projectId,
      folder_id: body.folderId ?? null,
      created_by: user.userId,
      created_at: now,
      updated_at: now,
    };

    await env.DB.prepare(
      "INSERT INTO systems (id, name, category, category_label, status, environment, owner, primary_url, notes, renewal_date, project_id, folder_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      record.id,
      record.name,
      record.category,
      record.category_label,
      record.status,
      record.environment,
      record.owner,
      record.primary_url,
      record.notes,
      record.renewal_date,
      record.project_id,
      record.folder_id,
      record.created_by,
      record.created_at,
      record.updated_at,
    ).run();

    if (linkedDocIds.length > 0) {
      await env.DB.batch(
        linkedDocIds.map(docId =>
          env.DB.prepare("INSERT INTO system_doc_links (system_id, doc_id) VALUES (?, ?)")
            .bind(id, docId),
        ),
      );
    }
    if (linkedPasswordIds.length > 0) {
      await env.DB.batch(
        linkedPasswordIds.map(passwordId =>
          env.DB.prepare("INSERT INTO system_password_links (system_id, password_id) VALUES (?, ?)")
            .bind(id, passwordId),
        ),
      );
    }
    await env.DB.prepare("UPDATE files SET system_id = NULL WHERE system_id = ?").bind(id).run();
    if (linkedFileIds.length > 0) {
      await env.DB.batch(
        linkedFileIds.map(fileId =>
          env.DB.prepare("UPDATE files SET system_id = ? WHERE id = ?")
            .bind(id, fileId),
        ),
      );
    }

    return okResponse({
      ...record,
      linked_doc_ids: linkedDocIds,
      linked_password_ids: linkedPasswordIds,
      linked_file_ids: linkedFileIds,
    }, 201);
  }

  if (systemId && request.method === "GET") {
    const record = await env.DB.prepare("SELECT * FROM systems WHERE id = ?")
      .bind(systemId).first<SystemRecord>();
    if (!record) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, record.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);

    const [docLinks, passwordLinks, fileLinks] = await Promise.all([
      env.DB.prepare("SELECT doc_id FROM system_doc_links WHERE system_id = ? ORDER BY doc_id ASC")
        .bind(systemId).all<{ doc_id: string }>(),
      env.DB.prepare("SELECT password_id FROM system_password_links WHERE system_id = ? ORDER BY password_id ASC")
        .bind(systemId).all<{ password_id: string }>(),
      env.DB.prepare("SELECT id FROM files WHERE system_id = ? AND type = 'systems' ORDER BY name ASC")
        .bind(systemId).all<{ id: string }>(),
    ]);

    return okResponse({
      ...record,
      linked_doc_ids: docLinks.results.map(row => row.doc_id),
      linked_password_ids: passwordLinks.results.map(row => row.password_id),
      linked_file_ids: fileLinks.results.map(row => row.id),
    });
  }

  if (systemId && request.method === "PUT") {
    const existing = await env.DB.prepare("SELECT * FROM systems WHERE id = ?")
      .bind(systemId).first<SystemRecord>();
    if (!existing) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, existing.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const body = await request.json<Partial<{
      name: string;
      category: string;
      status: SystemStatus;
      environment: SystemEnvironment | null;
      owner: string | null;
      primaryUrl: string | null;
      notes: string | null;
      renewalDate: string | null;
      folderId: string | null;
      linkedDocIds: string[];
      linkedPasswordIds: string[];
      linkedFileIds: string[];
    }>>();

    if (body.name !== undefined && !body.name.trim()) return errorResponse(Errors.BAD_REQUEST);
    const normalizedCategory = body.category !== undefined ? normalizeCategory(body.category) : undefined;
    if (body.category !== undefined && !normalizedCategory) return errorResponse(Errors.BAD_REQUEST);
    if (body.status !== undefined && !SYSTEM_STATUSES.has(body.status)) return errorResponse(Errors.BAD_REQUEST);

    const normalizedEnvironment = normalizeEnvironment(body.environment);
    if (normalizedEnvironment !== undefined && normalizedEnvironment !== null && !SYSTEM_ENVIRONMENTS.has(normalizedEnvironment)) {
      return errorResponse(Errors.BAD_REQUEST);
    }
    if (!(await ensureFolder(env.DB, existing.project_id, body.folderId))) return errorResponse(Errors.BAD_REQUEST);

    const linkedDocIds = body.linkedDocIds ? [...new Set(body.linkedDocIds)] : undefined;
    const linkedPasswordIds = body.linkedPasswordIds ? [...new Set(body.linkedPasswordIds)] : undefined;
    const linkedFileIds = body.linkedFileIds ? [...new Set(body.linkedFileIds)] : undefined;
    if (linkedDocIds && !(await ensureProjectScopedIds(env.DB, "docs", existing.project_id, linkedDocIds))) return errorResponse(Errors.BAD_REQUEST);
    if (linkedPasswordIds && !(await ensureProjectScopedIds(env.DB, "passwords", existing.project_id, linkedPasswordIds))) return errorResponse(Errors.BAD_REQUEST);
    if (linkedFileIds && !(await ensureSystemFiles(env.DB, existing.project_id, linkedFileIds))) return errorResponse(Errors.BAD_REQUEST);

    const sets: string[] = ["updated_at = ?"];
    const values: unknown[] = [new Date().toISOString()];
    if (body.name !== undefined) { sets.push("name = ?"); values.push(body.name.trim()); }
    if (normalizedCategory) {
      sets.push("category = ?");
      values.push(normalizedCategory.category);
      sets.push("category_label = ?");
      values.push(normalizedCategory.categoryLabel);
    }
    if (body.status !== undefined) { sets.push("status = ?"); values.push(body.status); }
    if (normalizedEnvironment !== undefined) { sets.push("environment = ?"); values.push(normalizedEnvironment); }
    if (body.owner !== undefined) { sets.push("owner = ?"); values.push(normalizeNullableString(body.owner) ?? null); }
    if (body.primaryUrl !== undefined) { sets.push("primary_url = ?"); values.push(normalizeNullableString(body.primaryUrl) ?? null); }
    if (body.notes !== undefined) { sets.push("notes = ?"); values.push(normalizeNullableString(body.notes) ?? null); }
    if (body.renewalDate !== undefined) { sets.push("renewal_date = ?"); values.push(normalizeNullableString(body.renewalDate) ?? null); }
    if (body.folderId !== undefined) { sets.push("folder_id = ?"); values.push(body.folderId ?? null); }
    values.push(systemId);

    await env.DB.prepare(`UPDATE systems SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();

    if (linkedDocIds) {
      await env.DB.prepare("DELETE FROM system_doc_links WHERE system_id = ?").bind(systemId).run();
      if (linkedDocIds.length > 0) {
        await env.DB.batch(
          linkedDocIds.map(docId =>
            env.DB.prepare("INSERT INTO system_doc_links (system_id, doc_id) VALUES (?, ?)")
              .bind(systemId, docId),
          ),
        );
      }
    }
    if (linkedPasswordIds) {
      await env.DB.prepare("DELETE FROM system_password_links WHERE system_id = ?").bind(systemId).run();
      if (linkedPasswordIds.length > 0) {
        await env.DB.batch(
          linkedPasswordIds.map(passwordId =>
            env.DB.prepare("INSERT INTO system_password_links (system_id, password_id) VALUES (?, ?)")
              .bind(systemId, passwordId),
          ),
        );
      }
    }
    if (linkedFileIds) {
      await env.DB.prepare("UPDATE files SET system_id = NULL WHERE project_id = ? AND type = 'systems' AND system_id = ?")
        .bind(existing.project_id, systemId).run();
      if (linkedFileIds.length > 0) {
        await env.DB.batch(
          linkedFileIds.map(fileId =>
            env.DB.prepare("UPDATE files SET system_id = ? WHERE id = ?")
              .bind(systemId, fileId),
          ),
        );
      }
    }

    const updated = await env.DB.prepare("SELECT * FROM systems WHERE id = ?")
      .bind(systemId).first<SystemRecord>();
    return okResponse(updated);
  }

  if (systemId && request.method === "DELETE") {
    const existing = await env.DB.prepare("SELECT project_id FROM systems WHERE id = ?")
      .bind(systemId).first<{ project_id: string }>();
    if (!existing) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, existing.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    await env.DB.prepare("UPDATE files SET system_id = NULL WHERE project_id = ? AND type = 'systems' AND system_id = ?")
      .bind(existing.project_id, systemId).run();
    await env.DB.prepare("DELETE FROM systems WHERE id = ?").bind(systemId).run();
    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
