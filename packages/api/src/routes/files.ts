import { okResponse, errorResponse, Errors, ROLE_RANK, type Role } from "../lib";
import type { Env } from "../index";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

async function getCallerRole(db: D1Database, projectId: string, userId: string): Promise<Role | null> {
  const row = await db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND accepted = 1")
    .bind(projectId, userId).first<{ role: Role }>();
  return row?.role ?? null;
}

export interface FileRecord {
  id: string;
  name: string;
  mime_type: string;
  size: number;
  project_id: string;
  folder_id: string | null;
  uploaded_by: string;
  created_at: string;
  uploader_name?: string;
  uploader_role?: string;
}

export async function handleFiles(
  request: Request,
  env: Env,
  user: { userId: string } | null,
  url: URL,
): Promise<Response> {
  const parts = url.pathname.replace(/^\/files\/?/, "").split("/");
  const fileId = parts[0] || null;
  const subResource = parts[1] || null;

  // GET /files/:id/content — serve raw file
  // Access order: published project → authenticated member → deny
  if (fileId && subResource === "content" && request.method === "GET") {
    const contextProjectId = url.searchParams.get("projectId");
    const meta = await env.DB.prepare(
      "SELECT f.name, f.mime_type, f.project_id, p.published_at FROM files f JOIN projects p ON p.id = f.project_id WHERE f.id = ?" +
        (contextProjectId ? " AND f.project_id = ?" : ""),
    ).bind(...(contextProjectId ? [fileId, contextProjectId] : [fileId])).first<{ name: string; mime_type: string; project_id: string; published_at: string | null }>();
    if (!meta) return errorResponse(Errors.NOT_FOUND);

    const canUsePublishedAccess = !!meta.published_at;

    if (!canUsePublishedAccess) {
      if (!user) return errorResponse(Errors.UNAUTHORIZED);
      const role = await getCallerRole(env.DB, meta.project_id, user.userId);
      if (role === null) return errorResponse(Errors.FORBIDDEN);
      if (role === "limited") {
        const hasShare = await env.DB.prepare(
          "SELECT id FROM doc_shares WHERE project_id = ? AND user_id = ? LIMIT 1",
        ).bind(meta.project_id, user.userId).first();
        if (!hasShare) return errorResponse(Errors.FORBIDDEN);
      }
    }

    const obj = await env.ASSETS.get(`files/${fileId}`);
    if (!obj) return errorResponse(Errors.NOT_FOUND);

    return new Response(await obj.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": meta.mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${meta.name}"`,
        "Cache-Control": canUsePublishedAccess ? "public, max-age=3600" : "private, no-store",
      },
    });
  }

  // All other file operations require authentication
  if (!user) return errorResponse(Errors.UNAUTHORIZED);

  // GET /files/:id — get single file metadata (any member except limited)
  if (fileId && !subResource && request.method === "GET") {
    const record = await env.DB.prepare("SELECT * FROM files WHERE id = ?")
      .bind(fileId).first<FileRecord>();
    if (!record) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, record.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (role === "limited") return errorResponse(Errors.FORBIDDEN);

    return okResponse(record);
  }

  // GET /files?projectId=xxx[&folderId=yyy] — list files (any member except limited)
  if (!fileId && request.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return errorResponse(Errors.BAD_REQUEST);

    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (role === "limited") return errorResponse(Errors.FORBIDDEN);

    const folderId = url.searchParams.get("folderId");
    const baseSelect = `
      SELECT f.id, f.name, f.mime_type, f.size, f.project_id, f.folder_id, f.uploaded_by, f.created_at,
        COALESCE(pm.name, f.uploaded_by) AS uploader_name,
        pm.role AS uploader_role
      FROM files f
      LEFT JOIN project_members pm ON pm.project_id = f.project_id AND pm.user_id = f.uploaded_by
    `;
    let rows;
    if (folderId) {
      rows = await env.DB.prepare(`${baseSelect} WHERE f.project_id = ? AND f.folder_id = ? ORDER BY f.name ASC`)
        .bind(projectId, folderId).all<FileRecord>();
    } else if (url.searchParams.has("folderId")) {
      rows = await env.DB.prepare(`${baseSelect} WHERE f.project_id = ? AND f.folder_id IS NULL ORDER BY f.name ASC`)
        .bind(projectId).all<FileRecord>();
    } else {
      rows = await env.DB.prepare(`${baseSelect} WHERE f.project_id = ? ORDER BY f.created_at DESC`)
        .bind(projectId).all<FileRecord>();
    }

    return okResponse(rows.results);
  }

  // POST /files — upload a file (editor+)
  if (!fileId && request.method === "POST") {
    const contentType = request.headers.get("Content-Type") ?? "";
    if (!contentType.includes("multipart/form-data")) return errorResponse(Errors.BAD_REQUEST);

    const form = await request.formData();
    const file = form.get("file") as File | null;
    const projectId = form.get("projectId") as string | null;
    const folderId = form.get("folderId") as string | null;
    if (!file || !projectId) return errorResponse(Errors.BAD_REQUEST);

    if (file.size > MAX_SIZE) {
      return Response.json({ ok: false, error: "File too large. Maximum size is 50MB." }, { status: 400 });
    }

    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const mimeType = file.type || "application/octet-stream";

    await env.ASSETS.put(`files/${id}`, await file.arrayBuffer(), {
      httpMetadata: { contentType: mimeType },
    });

    await env.DB.prepare(
      "INSERT INTO files (id, name, mime_type, size, project_id, folder_id, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, file.name, mimeType, file.size, projectId, folderId ?? null, user.userId, now).run();

    const record: FileRecord = { id, name: file.name, mime_type: mimeType, size: file.size, project_id: projectId, folder_id: folderId ?? null, uploaded_by: user.userId, created_at: now };
    return okResponse(record, 201);
  }

  // PUT /files/:id — move to a different folder (editor+)
  if (fileId && !subResource && request.method === "PUT") {
    const meta = await env.DB.prepare("SELECT project_id FROM files WHERE id = ?")
      .bind(fileId).first<{ project_id: string }>();
    if (!meta) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, meta.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const body = await request.json<{ folderId?: string | null; name?: string }>();
    if (body.name !== undefined) {
      await env.DB.prepare("UPDATE files SET name = ? WHERE id = ?")
        .bind(body.name, fileId).run();
    }
    if (body.folderId !== undefined) {
      await env.DB.prepare("UPDATE files SET folder_id = ? WHERE id = ?")
        .bind(body.folderId ?? null, fileId).run();
    }
    return okResponse({ updated: true });
  }

  // DELETE /files/:id — editor+
  if (fileId && !subResource && request.method === "DELETE") {
    const meta = await env.DB.prepare("SELECT project_id FROM files WHERE id = ?")
      .bind(fileId).first<{ project_id: string }>();
    if (!meta) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, meta.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    await env.ASSETS.delete(`files/${fileId}`);
    await env.DB.prepare("DELETE FROM files WHERE id = ?").bind(fileId).run();
    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
