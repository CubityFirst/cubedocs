import { okResponse, errorResponse, Errors, ROLE_RANK, type Role } from "../lib";
import type { Env } from "../index";

const MAX_SIZE = 50 * 1024 * 1024; // 50MB

async function getCallerRole(db: D1Database, projectId: string, userId: string): Promise<Role | null> {
  const row = await db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?")
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
}

export async function handleFiles(
  request: Request,
  env: Env,
  user: { userId: string },
  url: URL,
): Promise<Response> {
  const parts = url.pathname.replace(/^\/files\/?/, "").split("/");
  const fileId = parts[0] || null;
  const subResource = parts[1] || null;

  // GET /files/:id/content — serve raw file (authenticated, project members only)
  if (fileId && subResource === "content" && request.method === "GET") {
    const meta = await env.DB.prepare("SELECT name, mime_type, project_id FROM files WHERE id = ?")
      .bind(fileId).first<{ name: string; mime_type: string; project_id: string }>();
    if (!meta) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, meta.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);

    const obj = await env.ASSETS.get(`files/${fileId}`);
    if (!obj) return errorResponse(Errors.NOT_FOUND);

    return new Response(await obj.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": meta.mime_type || "application/octet-stream",
        "Content-Disposition": `inline; filename="${meta.name}"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  // GET /files/:id — get single file metadata (any member)
  if (fileId && !subResource && request.method === "GET") {
    const record = await env.DB.prepare("SELECT * FROM files WHERE id = ?")
      .bind(fileId).first<FileRecord>();
    if (!record) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, record.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);

    return okResponse(record);
  }

  // GET /files?projectId=xxx[&folderId=yyy] — list files (any member)
  if (!fileId && request.method === "GET") {
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return errorResponse(Errors.BAD_REQUEST);

    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);

    const folderId = url.searchParams.get("folderId");
    const rows = folderId
      ? await env.DB.prepare("SELECT * FROM files WHERE project_id = ? AND folder_id = ? ORDER BY name ASC")
          .bind(projectId, folderId).all<FileRecord>()
      : url.searchParams.has("folderId")
        ? await env.DB.prepare("SELECT * FROM files WHERE project_id = ? AND folder_id IS NULL ORDER BY name ASC")
            .bind(projectId).all<FileRecord>()
        : await env.DB.prepare("SELECT * FROM files WHERE project_id = ? ORDER BY created_at DESC")
            .bind(projectId).all<FileRecord>();

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
