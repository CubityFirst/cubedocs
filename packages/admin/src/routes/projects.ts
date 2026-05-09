import { Hono } from "hono";
import type { Env } from "../index";

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  return end === -1 ? content : content.slice(end + 4);
}

function stripMarkdown(content: string): string {
  let text = stripFrontmatter(content);
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`[^`\n]+`/g, " ");
  text = text.replace(/!\[.*?\]\(.*?\)/g, " ");
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");
  text = text.replace(/#{1,6}\s+/g, "");
  text = text.replace(/(\*\*|__)(.+?)\1/g, "$2");
  text = text.replace(/(\*|_)(.+?)\1/g, "$2");
  text = text.replace(/^>\s*/gm, "");
  text = text.replace(/^[-*+]\s+/gm, "");
  text = text.replace(/^\d+\.\s+/gm, "");
  text = text.replace(/\|/g, " ");
  text = text.replace(/[~_*[\]]/g, "");
  return text.replace(/\s+/g, " ").trim();
}

const projectsRouter = new Hono<{ Bindings: Env }>();

// GET /api/projects?q=
projectsRouter.get("/", async (c) => {
  const q = c.req.query("q") ?? "";
  const rows = q
    ? await c.env.DB.prepare(
        "SELECT id, name, owner_id, features, created_at FROM projects WHERE name LIKE ? ORDER BY created_at DESC",
      )
        .bind(`%${q}%`)
        .all<{ id: string; name: string; owner_id: string; features: number; created_at: string }>()
    : await c.env.DB.prepare(
        "SELECT id, name, owner_id, features, created_at FROM projects ORDER BY created_at DESC",
      ).all<{ id: string; name: string; owner_id: string; features: number; created_at: string }>();
  return c.json({ ok: true, data: rows.results });
});

// PATCH /api/projects/:id/features — { features: number }
projectsRouter.patch("/:id/features", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ features: number }>();
  if (typeof body.features !== "number" || !Number.isInteger(body.features) || body.features < 0) {
    return c.json({ ok: false, error: "Invalid features value" }, 400);
  }
  await c.env.DB.prepare("UPDATE projects SET features = ? WHERE id = ?")
    .bind(body.features, id)
    .run();
  return c.json({ ok: true });
});

// POST /api/projects/:id/reindex — rebuild FTS index for all docs in a project
projectsRouter.post("/:id/reindex", async (c) => {
  const projectId = c.req.param("id");

  const exists = await c.env.DB.prepare("SELECT id FROM projects WHERE id = ?")
    .bind(projectId).first<{ id: string }>();
  if (!exists) return c.json({ ok: false, error: "Not found" }, 404);

  const docs = await c.env.DB.prepare("SELECT id, title FROM docs WHERE project_id = ?")
    .bind(projectId).all<{ id: string; title: string }>();

  let indexed = 0;
  for (const doc of docs.results) {
    const obj = await c.env.ASSETS.get(`${projectId}/${doc.id}`);
    const content = obj ? await obj.text() : "";
    const body = stripMarkdown(content);
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM docs_fts WHERE doc_id = ?").bind(doc.id),
      c.env.DB.prepare("INSERT INTO docs_fts(doc_id, project_id, title, body) VALUES (?, ?, ?, ?)")
        .bind(doc.id, projectId, doc.title, body),
    ]);
    indexed++;
  }

  return c.json({ ok: true, data: { indexed } });
});

// DELETE /api/projects/:id
projectsRouter.delete("/:id", async (c) => {
  const projectId = c.req.param("id");

  // Collect all docs and their revisions for R2 cleanup
  const docs = await c.env.DB.prepare("SELECT id FROM docs WHERE project_id = ?").bind(projectId).all<{ id: string }>();
  const docIds = docs.results.map(d => d.id);

  const revisions = docIds.length > 0
    ? await c.env.DB.prepare(
        `SELECT asset_id, id FROM asset_revisions WHERE asset_type = 'doc' AND asset_id IN (${docIds.map(() => "?").join(",")})`,
      ).bind(...docIds).all<{ asset_id: string; id: string }>()
    : { results: [] };

  // Collect all files for R2 cleanup
  const files = await c.env.DB.prepare("SELECT id FROM files WHERE project_id = ?").bind(projectId).all<{ id: string }>();

  // Delete R2 assets in parallel
  await Promise.all([
    ...docIds.map(docId => c.env.ASSETS.delete(`${projectId}/${docId}`)),
    ...revisions.results.map(r => c.env.ASSETS.delete(`${projectId}/${r.asset_id}/v/${r.id}`)),
    ...files.results.map(f => c.env.ASSETS.delete(`files/${f.id}`)),
  ]);

  // Delete orphaned asset_revisions (no cascade on this table)
  if (docIds.length > 0) {
    await c.env.DB.prepare(
      `DELETE FROM asset_revisions WHERE asset_type = 'doc' AND asset_id IN (${docIds.map(() => "?").join(",")})`,
    ).bind(...docIds).run();
  }

  await c.env.DB.prepare("DELETE FROM projects WHERE id = ?").bind(projectId).run();
  return c.json({ ok: true });
});

export { projectsRouter };
