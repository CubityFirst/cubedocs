import { Hono } from "hono";
import { usersRouter } from "./routes/users";
import { projectsRouter } from "./routes/projects";

export interface Env {
  DB: D1Database;
  AUTH_DB: D1Database;
  ASSETS: R2Bucket;
  SITE_ASSETS: Fetcher;
}

const app = new Hono<{ Bindings: Env }>();

app.route("/api/users", usersRouter);
app.route("/api/projects", projectsRouter);

app.all("*", (c) => c.env.SITE_ASSETS.fetch(c.req.raw));

export default app;
