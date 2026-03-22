import { Hono } from "hono";
import type { Env } from "../index";

const usersRouter = new Hono<{ Bindings: Env }>();

// GET /api/users/search?q=
usersRouter.get("/search", async (c) => {
  const q = c.req.query("q") ?? "";
  const rows = await c.env.AUTH_DB.prepare(
    "SELECT id, email, name, created_at, moderation FROM users WHERE email LIKE ? OR id = ? LIMIT 25",
  )
    .bind(`%${q}%`, q)
    .all<{ id: string; email: string; name: string; created_at: string; moderation: number }>();
  return c.json({ ok: true, data: rows.results });
});

// PATCH /api/users/:id — { moderation: 0 | -1 }
usersRouter.patch("/:id", async (c) => {
  const id = c.req.param("id");
  const body = await c.req.json<{ moderation: number }>();
  if (body.moderation !== 0 && body.moderation !== -1) {
    return c.json({ ok: false, error: "Invalid moderation value" }, 400);
  }
  await c.env.AUTH_DB.prepare("UPDATE users SET moderation = ? WHERE id = ?")
    .bind(body.moderation, id)
    .run();
  return c.json({ ok: true });
});

export { usersRouter };
