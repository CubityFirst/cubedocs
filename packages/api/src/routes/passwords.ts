import { okResponse, errorResponse, Errors, ROLE_RANK, type Session, type Role } from "../lib";
import type { Env } from "../index";

interface PasswordRow {
  id: string;
  title: string;
  username: string | null;
  password_enc: string;
  totp_enc: string | null;
  url: string | null;
  notes_enc: string | null;
  last_change_date: string;
  project_id: string;
  folder_id: string | null;
  author_id: string;
  created_at: string;
  updated_at: string;
}

async function getCallerRole(db: D1Database, projectId: string, userId: string): Promise<Role | null> {
  const project = await db.prepare("SELECT owner_id FROM projects WHERE id = ?")
    .bind(projectId).first<{ owner_id: string }>();
  if (!project) return null;
  if (project.owner_id === userId) return "owner";
  const row = await db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ?")
    .bind(projectId, userId).first<{ role: Role }>();
  return row?.role ?? null;
}

async function deriveKey(secret: string, projectId: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HKDF" }, false, ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: enc.encode(projectId), info: enc.encode("cubedocs-vault-v1") },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function encryptField(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${btoa(String.fromCharCode(...iv))}:${btoa(String.fromCharCode(...new Uint8Array(ct)))}`;
}

async function decryptField(key: CryptoKey, encrypted: string): Promise<string> {
  const [ivB64, ctB64] = encrypted.split(":");
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
  const ct = Uint8Array.from(atob(ctB64), c => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}

export async function handlePasswords(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  const parts = url.pathname.replace(/^\/passwords\/?/, "").split("/");
  const passwordId = parts[0] || null;
  const params = url.searchParams;

  // GET /passwords?projectId=X[&folderId=Y|&q=query]
  if (!passwordId && request.method === "GET") {
    const projectId = params.get("projectId");
    if (!projectId) return errorResponse(Errors.BAD_REQUEST);

    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);

    const q = params.get("q");
    const folderId = params.get("folderId");
    const base = `SELECT id, title, username, url, folder_id, last_change_date, updated_at, (totp_enc IS NOT NULL) AS has_totp FROM passwords`;

    let rows;
    if (q) {
      const rootFolderId = params.get("rootFolderId");
      if (rootFolderId) {
        rows = await env.DB.prepare(`
          WITH RECURSIVE subtree(id) AS (
            SELECT id FROM folders WHERE id = ?
            UNION ALL
            SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
          )
          ${base} WHERE project_id = ? AND folder_id IN (SELECT id FROM subtree)
            AND (LOWER(title) LIKE LOWER(?) OR LOWER(COALESCE(username, '')) LIKE LOWER(?) OR LOWER(COALESCE(url, '')) LIKE LOWER(?))
          ORDER BY title ASC
        `).bind(rootFolderId, projectId, `%${q}%`, `%${q}%`, `%${q}%`).all();
      } else {
        rows = await env.DB.prepare(`${base} WHERE project_id = ? AND (LOWER(title) LIKE LOWER(?) OR LOWER(COALESCE(username, '')) LIKE LOWER(?) OR LOWER(COALESCE(url, '')) LIKE LOWER(?)) ORDER BY title ASC`)
          .bind(projectId, `%${q}%`, `%${q}%`, `%${q}%`).all();
      }
    } else if (folderId) {
      rows = await env.DB.prepare(`${base} WHERE project_id = ? AND folder_id = ? ORDER BY title ASC`)
        .bind(projectId, folderId).all();
    } else if (params.has("folderId")) {
      rows = await env.DB.prepare(`${base} WHERE project_id = ? AND folder_id IS NULL ORDER BY title ASC`)
        .bind(projectId).all();
    } else {
      rows = await env.DB.prepare(`${base} WHERE project_id = ? ORDER BY updated_at DESC`)
        .bind(projectId).all();
    }
    return okResponse(rows.results);
  }

  // POST /passwords — editor or above
  if (!passwordId && request.method === "POST") {
    const body = await request.json<{
      title: string;
      username?: string;
      password: string;
      totp?: string;
      url?: string;
      notes?: string;
      projectId: string;
      folderId?: string | null;
    }>();
    if (!body.title || !body.password || !body.projectId) return errorResponse(Errors.BAD_REQUEST);

    const role = await getCallerRole(env.DB, body.projectId, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const key = await deriveKey(env.JWT_SECRET, body.projectId);
    const passwordEnc = await encryptField(key, body.password);
    const totpEnc = body.totp ? await encryptField(key, body.totp) : null;
    const notesEnc = body.notes ? await encryptField(key, body.notes) : null;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO passwords (id, title, username, password_enc, totp_enc, url, notes_enc, last_change_date, project_id, folder_id, author_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, body.title, body.username ?? null, passwordEnc, totpEnc, body.url ?? null, notesEnc, now, body.projectId, body.folderId ?? null, user.userId, now, now).run();

    return okResponse({ id, title: body.title, username: body.username ?? null, url: body.url ?? null, folder_id: body.folderId ?? null, last_change_date: now, updated_at: now }, 201);
  }

  // GET /passwords/:id — any member, returns decrypted fields
  if (passwordId && request.method === "GET") {
    const row = await env.DB.prepare("SELECT * FROM passwords WHERE id = ?").bind(passwordId).first<PasswordRow>();
    if (!row) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, row.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);

    const key = await deriveKey(env.JWT_SECRET, row.project_id);
    const password = await decryptField(key, row.password_enc);
    const totp = row.totp_enc ? await decryptField(key, row.totp_enc) : null;
    const notes = row.notes_enc ? await decryptField(key, row.notes_enc) : null;
    const { password_enc, totp_enc, notes_enc, ...rest } = row;
    return okResponse({ ...rest, password, totp, notes });
  }

  // PUT /passwords/:id — editor or above
  if (passwordId && request.method === "PUT") {
    const meta = await env.DB.prepare("SELECT project_id FROM passwords WHERE id = ?")
      .bind(passwordId).first<{ project_id: string }>();
    if (!meta) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, meta.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    const body = await request.json<Partial<{
      title: string;
      username: string | null;
      password: string;
      totp: string | null;
      url: string | null;
      notes: string | null;
      folderId: string | null;
    }>>();

    const now = new Date().toISOString();
    const key = await deriveKey(env.JWT_SECRET, meta.project_id);
    const set: string[] = ["updated_at = ?"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const vals: any[] = [now];

    if (body.title !== undefined) { set.push("title = ?"); vals.push(body.title); }
    if (body.username !== undefined) { set.push("username = ?"); vals.push(body.username); }
    if (body.url !== undefined) { set.push("url = ?"); vals.push(body.url); }
    if (body.folderId !== undefined) { set.push("folder_id = ?"); vals.push(body.folderId); }
    if (body.password !== undefined) {
      set.push("password_enc = ?"); vals.push(await encryptField(key, body.password));
      set.push("last_change_date = ?"); vals.push(now);
    }
    if (body.totp !== undefined) {
      set.push("totp_enc = ?"); vals.push(body.totp ? await encryptField(key, body.totp) : null);
    }
    if (body.notes !== undefined) {
      set.push("notes_enc = ?"); vals.push(body.notes ? await encryptField(key, body.notes) : null);
    }

    vals.push(passwordId);
    await env.DB.prepare(`UPDATE passwords SET ${set.join(", ")} WHERE id = ?`).bind(...vals).run();

    const updated = await env.DB.prepare("SELECT * FROM passwords WHERE id = ?").bind(passwordId).first<PasswordRow>();
    if (!updated) return errorResponse(Errors.NOT_FOUND);
    const password = await decryptField(key, updated.password_enc);
    const totp = updated.totp_enc ? await decryptField(key, updated.totp_enc) : null;
    const notes = updated.notes_enc ? await decryptField(key, updated.notes_enc) : null;
    const { password_enc, totp_enc, notes_enc, ...rest } = updated;
    return okResponse({ ...rest, password, totp, notes });
  }

  // DELETE /passwords/:id — editor or above
  if (passwordId && request.method === "DELETE") {
    const meta = await env.DB.prepare("SELECT project_id FROM passwords WHERE id = ?")
      .bind(passwordId).first<{ project_id: string }>();
    if (!meta) return errorResponse(Errors.NOT_FOUND);

    const role = await getCallerRole(env.DB, meta.project_id, user.userId);
    if (role === null) return errorResponse(Errors.FORBIDDEN);
    if (ROLE_RANK[role] < ROLE_RANK["editor"]) return errorResponse(Errors.FORBIDDEN);

    await env.DB.prepare("DELETE FROM passwords WHERE id = ?").bind(passwordId).run();
    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
