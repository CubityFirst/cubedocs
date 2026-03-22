import { Hono } from "hono";
import { usersRouter } from "./routes/users";
import { projectsRouter } from "./routes/projects";

export interface Env {
  DB: D1Database;
  AUTH_DB: D1Database;
  ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

app.route("/api/users", usersRouter);
app.route("/api/projects", projectsRouter);

// Fall through to static assets (SPA)
app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
