import { Hono } from "hono";
import type { Env } from "../index";

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

export { projectsRouter };
