import { Hono } from "hono";
import { upsertFtsRow } from "../../../api/src/lib/fts";
import { writeAdminAudit } from "../audit";
import type { AppEnv } from "../index";

const projectsRouter = new Hono<AppEnv>();

// Reindex safety ceiling. Each doc costs ~1 R2 read + 1 D1 batch; a
// Worker invocation has a bounded subrequest budget, so very large
// projects must reindex via the owner-facing API path instead of here.
const REINDEX_MAX_DOCS = 2000;
// Bounded fan-out so a big project doesn't reindex one-doc-at-a-time.
const REINDEX_CHUNK = 10;

// GET /api/projects?q=
projectsRouter.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  const rows = q
    ? await c.env.DB.prepare(
        "SELECT id, name, owner_id, features, created_at FROM projects WHERE name LIKE ? ORDER BY created_at DESC LIMIT 100",
      )
        .bind(`%${q}%`)
        .all<{ id: string; name: string; owner_id: string; features: number; created_at: string }>()
    : await c.env.DB.prepare(
        "SELECT id, name, owner_id, features, created_at FROM projects ORDER BY created_at DESC LIMIT 100",
      ).all<{ id: string; name: string; owner_id: string; features: number; created_at: string }>();
  return c.json({ ok: true, data: rows.results });
});

// PATCH /api/projects/:id/features — { features: number }
projectsRouter.patch("/:id/features", async (c) => {
  const session = c.get("session");
  const id = c.req.param("id");
  const body = await c.req.json<{ features: number }>();
  if (typeof body.features !== "number" || !Number.isInteger(body.features) || body.features < 0) {
    return c.json({ ok: false, error: "Invalid features value" }, 400);
  }
  await c.env.DB.prepare("UPDATE projects SET features = ? WHERE id = ?")
    .bind(body.features, id)
    .run();
  await writeAdminAudit(c.env, session, "project.features.update", "project", id, { features: body.features });
  return c.json({ ok: true });
});

// POST /api/projects/:id/reindex — rebuild FTS index for all docs in a project
projectsRouter.post("/:id/reindex", async (c) => {
  const session = c.get("session");
  const projectId = c.req.param("id");

  const exists = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ?")
    .bind(projectId).first<{ id: string }>();
  if (!exists) return c.json({ ok: false, error: "Not found" }, 404);

  const docs = await c.env.DB.prepare("SELECT id, title FROM docs WHERE project_id = ?")
    .bind(projectId).all<{ id: string; title: string }>();

  if (docs.results.length > REINDEX_MAX_DOCS) {
    return c.json({
      ok: false,
      error: `Project has ${docs.results.length} docs; admin reindex is capped at ${REINDEX_MAX_DOCS}. Reindex from the project owner's tools instead.`,
    }, 409);
  }

  let indexed = 0;
  for (let i = 0; i < docs.results.length; i += REINDEX_CHUNK) {
    const chunk = docs.results.slice(i, i + REINDEX_CHUNK);
    await Promise.all(
      chunk.map(async (doc) => {
        const obj = await c.env.ASSETS.get(`${projectId}/${doc.id}`);
        const content = obj ? await obj.text() : "";
        await upsertFtsRow(c.env.DB, doc.id, projectId, doc.title, content);
      }),
    );
    indexed += chunk.length;
  }

  await writeAdminAudit(c.env, session, "project.reindex", "project", projectId, { indexed });
  return c.json({ ok: true, data: { indexed } });
});

// DELETE /api/projects/:id
//
// Mirrors the API worker's project-delete cleanup (packages/api/src/
// routes/projects.ts) so an admin-driven delete doesn't leave orphans
// the owner-driven path would have removed: doc R2 objects + revision
// blobs + files + the project's site logos, plus asset_revisions (no
// cascade), doc_shares (no cascade), and the FTS rows. The SQL deletes
// run as one D1 batch so we can't half-delete a project.
projectsRouter.delete("/:id", async (c) => {
  const session = c.get("session");
  const projectId = c.req.param("id");

  const docs = await c.env.DB.prepare("SELECT id FROM docs WHERE project_id = ?").bind(projectId).all<{ id: string }>();
  const docIds = docs.results.map(d => d.id);

  const revisions = docIds.length > 0
    ? await c.env.DB.prepare(
        `SELECT asset_id, id FROM asset_revisions WHERE asset_type = 'doc' AND asset_id IN (${docIds.map(() => "?").join(",")})`,
      ).bind(...docIds).all<{ asset_id: string; id: string }>()
    : { results: [] as { asset_id: string; id: string }[] };

  const files = await c.env.DB.prepare("SELECT id FROM files WHERE project_id = ?").bind(projectId).all<{ id: string }>();

  // R2 is not transactional; do the object deletes first, then the
  // single SQL batch.
  await Promise.all([
    ...docIds.map(docId => c.env.ASSETS.delete(`${projectId}/${docId}`)),
    ...revisions.results.map(r => c.env.ASSETS.delete(`${projectId}/${r.asset_id}/v/${r.id}`)),
    ...files.results.map(f => c.env.ASSETS.delete(`files/${f.id}`)),
    c.env.ASSETS.delete(`site-logos/${projectId}-square`),
    c.env.ASSETS.delete(`site-logos/${projectId}-wide`),
  ]);

  const stmts = [];
  if (docIds.length > 0) {
    const ph = docIds.map(() => "?").join(",");
    // asset_revisions and doc_shares have no ON DELETE CASCADE from docs.
    stmts.push(
      c.env.DB.prepare(`DELETE FROM asset_revisions WHERE asset_type = 'doc' AND asset_id IN (${ph})`).bind(...docIds),
    );
    stmts.push(
      c.env.DB.prepare(`DELETE FROM doc_shares WHERE doc_id IN (${ph})`).bind(...docIds),
    );
  }
  stmts.push(c.env.DB.prepare("DELETE FROM docs_fts WHERE project_id = ?").bind(projectId));
  stmts.push(c.env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(projectId));
  await c.env.DB.batch(stmts);

  await writeAdminAudit(c.env, session, "project.delete", "project", projectId, {
    docs: docIds.length,
    files: files.results.length,
  });
  return c.json({ ok: true });
});

export { projectsRouter };
