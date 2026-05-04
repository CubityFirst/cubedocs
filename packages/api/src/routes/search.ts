import { okResponse, errorResponse, Errors, type Session, type Role } from "../lib";
import { sanitizeFtsQuery } from "../lib/fts";
import type { Env } from "../index";

interface SearchResult {
  doc_id: string;
  title: string;
  excerpt: string;
}

interface TagSearchRow {
  doc_id: string;
  title: string;
  tags: string;
}

interface TagSearchResult {
  doc_id: string;
  title: string;
  tags: string[];
}

async function getCallerRole(db: D1Database, projectId: string, userId: string): Promise<Role | null> {
  const row = await db.prepare(
    "SELECT role FROM project_members WHERE project_id = ? AND user_id = ? AND accepted = 1",
  ).bind(projectId, userId).first<{ role: Role }>();
  return row?.role ?? null;
}

export async function handleSearch(
  request: Request,
  env: Env,
  user: Session,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(Errors.NOT_FOUND);

  const projectId = url.searchParams.get("projectId");
  const q = url.searchParams.get("q")?.trim();
  const tag = url.searchParams.get("tag")?.trim();
  if (!projectId || (!q && !tag)) return errorResponse(Errors.BAD_REQUEST);

  const role = await getCallerRole(env.DB, projectId, user.userId);
  if (!role) return errorResponse(Errors.FORBIDDEN);

  if (tag !== undefined && tag !== null) {
    let rows;
    if (role === "limited") {
      rows = await env.DB.prepare(`
        SELECT d.id AS doc_id, d.title, d.tags
        FROM docs d
        JOIN doc_shares ds ON ds.doc_id = d.id AND ds.user_id = ?
        WHERE d.project_id = ?
          AND d.tags IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM json_each(d.tags) AS t WHERE LOWER(t.value) LIKE '%' || LOWER(?) || '%'
          )
        ORDER BY d.title COLLATE NOCASE
        LIMIT 20
      `).bind(user.userId, projectId, tag).all<TagSearchRow>();
    } else {
      rows = await env.DB.prepare(`
        SELECT d.id AS doc_id, d.title, d.tags
        FROM docs d
        WHERE d.project_id = ?
          AND d.tags IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM json_each(d.tags) AS t WHERE LOWER(t.value) LIKE '%' || LOWER(?) || '%'
          )
        ORDER BY d.title COLLATE NOCASE
        LIMIT 20
      `).bind(projectId, tag).all<TagSearchRow>();
    }
    const data: TagSearchResult[] = rows.results.map(r => ({
      doc_id: r.doc_id,
      title: r.title,
      tags: JSON.parse(r.tags) as string[],
    }));
    return okResponse(data);
  }

  const ftsQuery = sanitizeFtsQuery(q!);

  let results;
  if (role === "limited") {
    results = await env.DB.prepare(`
      SELECT f.doc_id, f.title,
        snippet(docs_fts, 1, '<mark>', '</mark>', '...', 24) AS excerpt,
        bm25(docs_fts) AS rank
      FROM docs_fts f
      JOIN doc_shares ds ON ds.doc_id = f.doc_id AND ds.user_id = ?
      WHERE docs_fts MATCH ?
        AND f.project_id = ?
      ORDER BY rank
      LIMIT 20
    `).bind(user.userId, ftsQuery, projectId).all<SearchResult>();
  } else {
    results = await env.DB.prepare(`
      SELECT f.doc_id, f.title,
        snippet(docs_fts, 1, '<mark>', '</mark>', '...', 24) AS excerpt,
        bm25(docs_fts) AS rank
      FROM docs_fts f
      WHERE docs_fts MATCH ?
        AND f.project_id = ?
      ORDER BY rank
      LIMIT 20
    `).bind(ftsQuery, projectId).all<SearchResult>();
  }

  return okResponse(results.results);
}

export async function handlePublicSearch(
  request: Request,
  env: Env,
  url: URL,
): Promise<Response> {
  if (request.method !== "GET") return errorResponse(Errors.NOT_FOUND);

  const projectIdOrSlug = url.searchParams.get("projectId");
  const q = url.searchParams.get("q")?.trim();
  const tag = url.searchParams.get("tag")?.trim();
  if (!projectIdOrSlug || (!q && !tag)) return errorResponse(Errors.BAD_REQUEST);

  const project = await env.DB.prepare(
    "SELECT id FROM projects WHERE (id = ? OR vanity_slug = ?) AND published_at IS NOT NULL",
  ).bind(projectIdOrSlug, projectIdOrSlug).first<{ id: string }>();
  if (!project) return errorResponse(Errors.NOT_FOUND);

  if (tag !== undefined && tag !== null) {
    const rows = await env.DB.prepare(`
      SELECT d.id AS doc_id, d.title, d.tags
      FROM docs d
      WHERE d.project_id = ?
        AND d.tags IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM json_each(d.tags) AS t WHERE LOWER(t.value) LIKE '%' || LOWER(?) || '%'
        )
      ORDER BY d.title COLLATE NOCASE
      LIMIT 20
    `).bind(project.id, tag).all<TagSearchRow>();
    const data: TagSearchResult[] = rows.results.map(r => ({
      doc_id: r.doc_id,
      title: r.title,
      tags: JSON.parse(r.tags) as string[],
    }));
    return okResponse(data);
  }

  const ftsQuery = sanitizeFtsQuery(q!);

  const results = await env.DB.prepare(`
    SELECT f.doc_id, f.title,
      snippet(docs_fts, 1, '<mark>', '</mark>', '...', 24) AS excerpt,
      bm25(docs_fts) AS rank
    FROM docs_fts f
    WHERE docs_fts MATCH ?
      AND f.project_id = ?
    ORDER BY rank
    LIMIT 20
  `).bind(ftsQuery, project.id).all<SearchResult>();

  return okResponse(results.results);
}
