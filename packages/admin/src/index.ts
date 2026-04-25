import { Hono } from "hono";
import { requireAdminSession, verifySession } from "./auth";
import { usersRouter } from "./routes/users";
import { projectsRouter } from "./routes/projects";

export interface Env {
  DB: D1Database;
  AUTH_DB: D1Database;
  ASSETS: R2Bucket;
  SITE_ASSETS: Fetcher;
  AUTH: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

async function enforceAdmin(c: { req: { raw: Request }; env: Env }, next: () => Promise<void>) {
  const session = await requireAdminSession(c.req.raw, c.env);
  if (session instanceof Response) return session;
  await next();
}

app.post("/api/auth/handoff/exchange", async (c) => {
  const body = await c.req.json();
  return c.env.AUTH.fetch("https://auth/admin/handoff/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
});

app.get("/api/verify", async (c) => {
  const session = await verifySession(c.req.raw, c.env);

  if (!session) return c.json({ ok: false, error: "Unauthorized" }, 401);
  if (!session.isAdmin) return c.json({ ok: false, error: "Forbidden" }, 403);

  return c.json({
    ok: true,
    data: {
      userId: session.userId,
      email: session.email,
      expiresAt: session.expiresAt,
      isAdmin: true,
    },
  });
});

app.use("/api/users", enforceAdmin);
app.use("/api/users/*", enforceAdmin);
app.use("/api/projects", enforceAdmin);
app.use("/api/projects/*", enforceAdmin);

app.route("/api/users", usersRouter);
app.route("/api/projects", projectsRouter);

app.all("*", (c) => c.env.SITE_ASSETS.fetch(c.req.raw));

export default app;
