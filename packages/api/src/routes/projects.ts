import { okResponse, errorResponse, Errors, ROLE_RANK, ProjectFeatures, type Session, type Project, type Role } from "../lib";
import { upsertFtsRow, deleteFtsForProject } from "../lib/fts";
import type { Env } from "../index";

const VANITY_SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

async function getCallerRole(db: D1Database, projectId: string, userId: string): Promise<Role | null> {
  const row = await db.prepare("SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND accepted = 1")
    .bind(projectId, userId).first<{ role: Role }>();
  return row?.role ?? null;
}

export async function handleProjects(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  const parts = url.pathname.replace(/^\/projects\/?/, "").split("/");
  const projectId = parts[0] || null;

  // GET /projects/:id/logo — any member, serves the site logo from R2
  if (projectId && parts[1] === "logo" && request.method === "GET") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.NOT_FOUND);
    const obj = await env.ASSETS.get(`site-logos/${projectId}`);
    if (!obj) return errorResponse(Errors.NOT_FOUND);
    return new Response(await obj.arrayBuffer(), {
      status: 200,
      headers: {
        "Content-Type": obj.httpMetadata?.contentType ?? "application/octet-stream",
        "Cache-Control": "private, max-age=300",
      },
    });
  }

  // POST /projects/:id/logo — admin or owner, upload site logo
  if (projectId && parts[1] === "logo" && request.method === "POST") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.NOT_FOUND);
    if (ROLE_RANK[role] < ROLE_RANK["admin"]) return errorResponse(Errors.FORBIDDEN);
    const contentType = request.headers.get("Content-Type") ?? "";
    if (!contentType.includes("multipart/form-data")) return errorResponse(Errors.BAD_REQUEST);
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return errorResponse(Errors.BAD_REQUEST);
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowed.includes(file.type)) {
      return Response.json({ ok: false, error: "Invalid file type. Allowed: JPEG, PNG, WebP, GIF." }, { status: 400 });
    }
    if (file.size > 2 * 1024 * 1024) {
      return Response.json({ ok: false, error: "File too large. Maximum size is 2MB." }, { status: 400 });
    }
    await env.ASSETS.put(`site-logos/${projectId}`, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type },
    });
    const now = new Date().toISOString();
    await env.DB.prepare("UPDATE projects SET logo_updated_at = ? WHERE id = ?").bind(now, projectId).run();
    const updated = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first<Project>();
    return okResponse(updated);
  }

  // DELETE /projects/:id/logo — admin or owner, remove site logo
  if (projectId && parts[1] === "logo" && request.method === "DELETE") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.NOT_FOUND);
    if (ROLE_RANK[role] < ROLE_RANK["admin"]) return errorResponse(Errors.FORBIDDEN);
    await env.ASSETS.delete(`site-logos/${projectId}`);
    await env.DB.prepare("UPDATE projects SET logo_updated_at = NULL WHERE id = ?").bind(projectId).run();
    const updated = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first<Project>();
    return okResponse(updated);
  }

  // GET /projects — list projects where user is a member (includes owned)
  if (!projectId && request.method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT p.*, pm.role, pm.is_favourite, (SELECT COUNT(*) FROM docs WHERE project_id = p.id) as doc_count, (SELECT COUNT(*) FROM project_members WHERE project_id = p.id AND accepted = 1) as member_count FROM projects p INNER JOIN project_members pm ON pm.project_id = p.id WHERE pm.user_id = ? AND pm.accepted = 1 ORDER BY pm.is_favourite DESC, p.created_at DESC",
    ).bind(user.userId).all<Project & { role: Role; is_favourite: number; doc_count: number; member_count: number }>();
    return okResponse(rows.results);
  }

  // POST /projects
  if (!projectId && request.method === "POST") {
    const body = await request.json<{ name: string; description?: string }>();
    if (!body.name) return errorResponse(Errors.BAD_REQUEST);

    // Look up owner's name from auth worker
    const authHeader = request.headers.get("Authorization");
    const lookupRes = await env.AUTH.fetch("https://auth/lookup-by-id", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(authHeader ? { Authorization: authHeader } : {}) },
      body: JSON.stringify({}),
    });
    let ownerName = user.email;
    if (lookupRes.ok) {
      const data = await lookupRes.json<{ ok: boolean; data?: { name: string } }>();
      if (data.ok && data.data) ownerName = data.data.name;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO projects (id, name, description, owner_id, created_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(id, body.name, body.description ?? null, user.userId, now).run();

    await env.DB.prepare(
      "INSERT INTO project_members (id, project_id, user_id, email, name, role, invited_by, created_at, accepted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)",
    ).bind(crypto.randomUUID(), id, user.userId, user.email, ownerName, "owner", user.userId, now).run();

    return okResponse({ id, name: body.name, ownerId: user.userId, createdAt: now }, 201);
  }

  // GET /projects/:id/contents?folderId=… — bundled folder + doc + file listing
  // for the FileManager view, plus project-wide folder counts. Replaces 4
  // separate calls (folders, docs, files, folder-counts) with a single
  // auth-checked round trip. Limited members see only docs they have shares
  // for, the ancestor folders to those docs, no files, and no counts.
  if (projectId && parts[1] === "contents" && request.method === "GET") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.NOT_FOUND);

    const folderId = url.searchParams.get("folderId");
    const folderFilter: string | null = folderId ? folderId : null;
    const isLimited = role === "limited";

    type FolderRow = { id: string; name: string; type: string; project_id: string; parent_id: string | null; created_at: string };
    type DocWithAuthor = {
      id: string; title: string; folder_id: string | null; author_id: string;
      created_at: string; updated_at: string; sidebar_position: number | null; tags: string | null;
      author_name: string; author_role: string | null; is_home: number;
    };
    type FileRow = {
      id: string; name: string; mime_type: string; size: number; project_id: string;
      folder_id: string | null; uploaded_by: string; created_at: string;
      uploader_name: string; uploader_role: string | null;
    };
    type CountRow = { folder_id: string; folders: number; docs: number };

    const foldersQuery = isLimited
      ? env.DB.prepare(
          `WITH accessible_folder_ids AS (
             SELECT DISTINCT d.folder_id
             FROM docs d
             JOIN doc_shares ds ON ds.doc_id = d.id AND ds.user_id = ?
             WHERE d.project_id = ? AND d.folder_id IS NOT NULL
           ),
           ancestors(id, parent_id) AS (
             SELECT f.id, f.parent_id FROM folders f WHERE f.id IN (SELECT folder_id FROM accessible_folder_ids)
             UNION ALL
             SELECT f.id, f.parent_id FROM folders f JOIN ancestors a ON f.id = a.parent_id
           )
           SELECT DISTINCT f.id, f.name, f.type, f.project_id, f.parent_id, f.created_at
           FROM folders f
           WHERE f.id IN (SELECT id FROM ancestors) AND f.project_id = ? AND f.type = 'docs'
             AND f.parent_id IS ?
           ORDER BY f.name ASC`,
        ).bind(user.userId, projectId, projectId, folderFilter)
      : (folderFilter
          ? env.DB.prepare("SELECT * FROM folders WHERE project_id = ? AND parent_id = ? AND type = 'docs' ORDER BY name ASC")
              .bind(projectId, folderFilter)
          : env.DB.prepare("SELECT * FROM folders WHERE project_id = ? AND parent_id IS NULL AND type = 'docs' ORDER BY name ASC")
              .bind(projectId));

    const docSelect = `
      SELECT d.id, d.title, d.folder_id, d.author_id, d.created_at, d.updated_at, d.sidebar_position, d.tags,
        COALESCE(pm.name, d.author_id) AS author_name,
        pm.role AS author_role,
        CASE WHEN p.home_doc_id = d.id THEN 1 ELSE 0 END AS is_home
      FROM docs d
      LEFT JOIN project_members pm ON pm.project_id = d.project_id AND pm.user_id = d.author_id
      LEFT JOIN projects p ON p.id = d.project_id
    `;
    const docOrder = "ORDER BY CASE WHEN d.sidebar_position IS NULL THEN 1 ELSE 0 END, d.sidebar_position ASC, d.title ASC";
    const sharesJoin = "JOIN doc_shares ds ON ds.doc_id = d.id AND ds.user_id = ?";

    const docsQuery = isLimited
      ? (folderFilter
          ? env.DB.prepare(`${docSelect} ${sharesJoin} WHERE d.project_id = ? AND d.folder_id = ? ${docOrder}`)
              .bind(user.userId, projectId, folderFilter)
          : env.DB.prepare(`${docSelect} ${sharesJoin} WHERE d.project_id = ? AND d.folder_id IS NULL ${docOrder}`)
              .bind(user.userId, projectId))
      : (folderFilter
          ? env.DB.prepare(`${docSelect} WHERE d.project_id = ? AND d.folder_id = ? ${docOrder}`)
              .bind(projectId, folderFilter)
          : env.DB.prepare(`${docSelect} WHERE d.project_id = ? AND d.folder_id IS NULL ${docOrder}`)
              .bind(projectId));

    const fileSelect = `
      SELECT f.id, f.name, f.mime_type, f.size, f.project_id, f.folder_id, f.uploaded_by, f.created_at,
        COALESCE(pm.name, f.uploaded_by) AS uploader_name,
        pm.role AS uploader_role
      FROM files f
      LEFT JOIN project_members pm ON pm.project_id = f.project_id AND pm.user_id = f.uploaded_by
    `;
    const filesQuery = isLimited
      ? null
      : (folderFilter
          ? env.DB.prepare(`${fileSelect} WHERE f.project_id = ? AND f.folder_id = ? ORDER BY f.name ASC`)
              .bind(projectId, folderFilter)
          : env.DB.prepare(`${fileSelect} WHERE f.project_id = ? AND f.folder_id IS NULL ORDER BY f.name ASC`)
              .bind(projectId));

    const countsQuery = isLimited
      ? null
      : env.DB.prepare(`
          WITH RECURSIVE subtree(ancestor_id, folder_id) AS (
            SELECT id, id FROM folders WHERE project_id = ? AND type = 'docs'
            UNION ALL
            SELECT s.ancestor_id, f.id
              FROM folders f JOIN subtree s ON f.parent_id = s.folder_id
             WHERE f.project_id = ? AND f.type = 'docs'
          )
          SELECT
            s.ancestor_id AS folder_id,
            COUNT(DISTINCT CASE WHEN s.folder_id != s.ancestor_id THEN s.folder_id END) AS folders,
            COUNT(i.id) AS docs
          FROM subtree s
          LEFT JOIN docs i ON i.folder_id = s.folder_id AND i.project_id = ?
          GROUP BY s.ancestor_id
        `).bind(projectId, projectId, projectId);

    // db.batch runs all statements in a single round-trip to D1 instead of N
    // separate RPCs. Limited members skip files + counts (they have no access
    // to either), so the statement list shrinks accordingly.
    const stmts = isLimited
      ? [foldersQuery, docsQuery]
      : [foldersQuery, docsQuery, filesQuery!, countsQuery!];
    const batchResults = await env.DB.batch(stmts);
    const foldersRes = batchResults[0] as D1Result<FolderRow>;
    const docsRes = batchResults[1] as D1Result<DocWithAuthor>;
    const filesRes = isLimited ? { results: [] as FileRow[] } : batchResults[2] as D1Result<FileRow>;
    const countsRes = isLimited ? { results: [] as CountRow[] } : batchResults[3] as D1Result<CountRow>;

    const folderCounts: Record<string, { docs: number; folders: number }> = {};
    for (const r of countsRes.results) folderCounts[r.folder_id] = { docs: r.docs, folders: r.folders };

    return okResponse({
      folders: foldersRes.results,
      docs: docsRes.results,
      files: filesRes.results,
      folderCounts,
    });
  }

  // GET /projects/:id — any member can view
  if (projectId && request.method === "GET") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.NOT_FOUND);
    const row = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first<Project>();
    if (!row) return errorResponse(Errors.NOT_FOUND);
    return okResponse({ ...row, role });
  }

  // PATCH /projects/:id/favourite — toggle favourite for current user
  if (projectId && parts[1] === "favourite" && request.method === "PATCH") {
    const row = await env.DB.prepare("SELECT is_favourite FROM project_members WHERE project_id = ? AND user_id = ? AND accepted = 1")
      .bind(projectId, user.userId).first<{ is_favourite: number }>();
    if (row === null) return errorResponse(Errors.NOT_FOUND);
    const next = row.is_favourite ? 0 : 1;
    await env.DB.prepare("UPDATE project_members SET is_favourite = ? WHERE project_id = ? AND user_id = ?")
      .bind(next, projectId, user.userId).run();
    return okResponse({ is_favourite: next });
  }

  // PATCH /projects/:id — admin or owner
  if (projectId && request.method === "PATCH") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role === null) return errorResponse(Errors.NOT_FOUND);
    if (ROLE_RANK[role] < ROLE_RANK["admin"]) return errorResponse(Errors.FORBIDDEN);

    const body = await request.json<{ name?: string; description?: string | null; publishedAt?: string | null; changelogMode?: string; vanitySlug?: string | null; aiEnabled?: boolean; aiSummarizationType?: string; homeDocEnabled?: boolean; graphEnabled?: boolean; publishedGraphEnabled?: boolean; graphTagColors?: { tag: string; color: string }[] | null }>();
    if (body.name !== undefined && !body.name.trim()) return errorResponse(Errors.BAD_REQUEST);
    if (body.changelogMode !== undefined && !["off", "on", "enforced"].includes(body.changelogMode)) return errorResponse(Errors.BAD_REQUEST);
    if (body.aiSummarizationType !== undefined && !["automatic", "manual"].includes(body.aiSummarizationType)) return errorResponse(Errors.BAD_REQUEST);
    if (body.vanitySlug !== undefined && body.vanitySlug !== null) {
      if (!VANITY_SLUG_REGEX.test(body.vanitySlug) || body.vanitySlug.length < 3 || body.vanitySlug.length > 50) return errorResponse(Errors.BAD_REQUEST);
      const proj = await env.DB.prepare("SELECT features FROM projects WHERE id = ?").bind(projectId).first<{ features: number }>();
      if (!proj || !(proj.features & ProjectFeatures.CUSTOM_LINK)) return errorResponse(Errors.FORBIDDEN);
    }
    if (body.aiEnabled !== undefined) {
      const proj = await env.DB.prepare("SELECT features FROM projects WHERE id = ?").bind(projectId).first<{ features: number }>();
      if (!proj || !(proj.features & ProjectFeatures.AI_FEATURES)) return errorResponse(Errors.FORBIDDEN);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    if (body.name !== undefined) { fields.push("name = ?"); values.push(body.name.trim()); }
    if (body.description !== undefined) { fields.push("description = ?"); values.push(body.description ?? null); }
    if (body.publishedAt !== undefined) { fields.push("published_at = ?"); values.push(body.publishedAt ?? null); }
    if (body.changelogMode !== undefined) { fields.push("changelog_mode = ?"); values.push(body.changelogMode); }
    if (body.vanitySlug !== undefined) { fields.push("vanity_slug = ?"); values.push(body.vanitySlug ?? null); }
    if (body.aiEnabled !== undefined) { fields.push("ai_enabled = ?"); values.push(body.aiEnabled ? 1 : 0); }
    if (body.aiSummarizationType !== undefined) { fields.push("ai_summarization_type = ?"); values.push(body.aiSummarizationType); }
    if (body.graphEnabled !== undefined) { fields.push("graph_enabled = ?"); values.push(body.graphEnabled ? 1 : 0); }
    let publishedGraphValue: 0 | 1 | undefined = body.publishedGraphEnabled === undefined ? undefined : (body.publishedGraphEnabled ? 1 : 0);
    if (body.graphEnabled === false) publishedGraphValue = 0;
    if (publishedGraphValue === 1 && body.graphEnabled !== true) {
      const proj = await env.DB.prepare("SELECT graph_enabled FROM projects WHERE id = ?").bind(projectId).first<{ graph_enabled: number }>();
      if (!proj || !proj.graph_enabled) return errorResponse(Errors.BAD_REQUEST);
    }
    if (publishedGraphValue !== undefined) { fields.push("published_graph_enabled = ?"); values.push(publishedGraphValue); }
    if (body.graphTagColors !== undefined) { fields.push("graph_tag_colors = ?"); values.push(body.graphTagColors ? JSON.stringify(body.graphTagColors) : null); }
    if (body.homeDocEnabled === true) {
      const proj = await env.DB.prepare("SELECT home_doc_id FROM projects WHERE id = ?").bind(projectId).first<{ home_doc_id: string | null }>();
      if (!proj?.home_doc_id) {
        const docId = crypto.randomUUID();
        const now = new Date().toISOString();
        await env.ASSETS.put(`${projectId}/${docId}`, "");
        await env.DB.prepare(
          "INSERT INTO docs (id, title, project_id, author_id, folder_id, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, NULL, ?, ?)",
        ).bind(docId, "Home", projectId, user.userId, now, now).run();
        await upsertFtsRow(env.DB, docId, projectId, "Home", "");
        fields.push("home_doc_id = ?");
        values.push(docId);
      }
    } else if (body.homeDocEnabled === false) {
      fields.push("home_doc_id = ?");
      values.push(null);
    }
    if (fields.length === 0) return errorResponse(Errors.BAD_REQUEST);

    values.push(projectId);
    try {
      await env.DB.prepare(`UPDATE projects SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    } catch (e: unknown) {
      if (e instanceof Error && e.message.includes("UNIQUE")) return errorResponse(Errors.CONFLICT);
      throw e;
    }

    const updated = await env.DB.prepare("SELECT * FROM projects WHERE id = ?").bind(projectId).first<Project>();
    return okResponse(updated);
  }

  // POST /projects/:id/reindex — owner only, rebuilds the FTS index for all docs in this project
  const subPath = url.pathname.replace(/^\/projects\/[^/]+/, "");
  if (projectId && subPath === "/reindex" && request.method === "POST") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role !== "owner") return errorResponse(Errors.FORBIDDEN);

    const rows = await env.DB.prepare("SELECT id, title FROM docs WHERE project_id = ?")
      .bind(projectId).all<{ id: string; title: string }>();

    const CHUNK = 50;
    let indexed = 0;
    for (let i = 0; i < rows.results.length; i += CHUNK) {
      const chunk = rows.results.slice(i, i + CHUNK);
      for (const doc of chunk) {
        const r2 = await env.ASSETS.get(`${projectId}/${doc.id}`);
        const content = r2 ? await r2.text() : "";
        await upsertFtsRow(env.DB, doc.id, projectId, doc.title, content);
      }
      indexed += chunk.length;
    }
    return okResponse({ indexed });
  }

  // DELETE /projects/:id — owner only
  if (projectId && request.method === "DELETE") {
    const role = await getCallerRole(env.DB, projectId, user.userId);
    if (role !== "owner") return errorResponse(Errors.NOT_FOUND);

    // Collect all docs and their revisions for R2 cleanup
    const docs = await env.DB.prepare("SELECT id FROM docs WHERE project_id = ?").bind(projectId).all<{ id: string }>();
    const docIds = docs.results.map(d => d.id);

    const revisions = docIds.length > 0
      ? await env.DB.prepare(
          `SELECT asset_id, id FROM asset_revisions WHERE asset_type = 'doc' AND asset_id IN (${docIds.map(() => "?").join(",")})`,
        ).bind(...docIds).all<{ asset_id: string; id: string }>()
      : { results: [] };

    // Collect all files for R2 cleanup
    const files = await env.DB.prepare("SELECT id FROM files WHERE project_id = ?").bind(projectId).all<{ id: string }>();

    // Delete R2 assets in parallel
    await Promise.all([
      ...docIds.map(docId => env.ASSETS.delete(`${projectId}/${docId}`)),
      ...revisions.results.map(r => env.ASSETS.delete(`${projectId}/${r.asset_id}/v/${r.id}`)),
      ...files.results.map(f => env.ASSETS.delete(`files/${f.id}`)),
      env.ASSETS.delete(`site-logos/${projectId}`),
    ]);

    // Delete orphaned asset_revisions (no cascade on this table)
    if (docIds.length > 0) {
      await env.DB.prepare(
        `DELETE FROM asset_revisions WHERE asset_type = 'doc' AND asset_id IN (${docIds.map(() => "?").join(",")})`,
      ).bind(...docIds).run();
    }

    await env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(projectId).run();
    await deleteFtsForProject(env.DB, projectId);
    return okResponse({ deleted: true });
  }

  return errorResponse(Errors.NOT_FOUND);
}
