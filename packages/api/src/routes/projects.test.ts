import { describe, it, expect } from "vitest";
import { handleProjects } from "./projects";
import type { Session } from "../lib";
import type { Env } from "../index";

const user: Session = { userId: "user-1", email: "a@example.com", expiresAt: Date.now() + 60_000 };

function makeStmt(firstValue: unknown = null, allValue: unknown[] = []) {
  const stmt: Record<string, unknown> = {
    bind: (..._args: unknown[]) => stmt,
    first: () => Promise.resolve(firstValue),
    all: () => Promise.resolve({ results: allValue }),
    run: () => Promise.resolve({ success: true }),
  };
  return stmt;
}

function makeDB(...stmts: ReturnType<typeof makeStmt>[]) {
  let i = 0;
  return { prepare: (_sql: string) => stmts[i++] ?? makeStmt() };
}

function makeEnv(db: ReturnType<typeof makeDB>): Env {
  return {
    DB: db as unknown as D1Database,
    ASSETS: {} as unknown as R2Bucket,
    AUTH: {} as unknown as Fetcher,
    JWT_SECRET: "secret",
    VAULT_SECRET: "test-vault-secret",
  };
}

function req(method: string, path: string, body?: object): Request {
  return new Request(`https://api${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("GET /projects", () => {
  it("returns the list of projects for the authenticated user", async () => {
    const projects = [{ id: "p1", name: "Docs", slug: "docs", ownerId: "user-1", createdAt: "2024-01-01", doc_count: 2 }];
    const db = makeDB(makeStmt(null, projects));
    const res = await handleProjects(req("GET", "/projects"), makeEnv(db), user, new URL("https://api/projects"));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.data).toEqual(projects);
  });

  it("returns an empty array when the user has no projects", async () => {
    const db = makeDB(makeStmt(null, []));
    const res = await handleProjects(req("GET", "/projects"), makeEnv(db), user, new URL("https://api/projects"));
    const body = await res.json() as Record<string, unknown>;
    expect(body.data).toEqual([]);
  });
});

describe("POST /projects", () => {
  it("returns 400 if name is missing", async () => {
    const db = makeDB();
    const res = await handleProjects(req("POST", "/projects", { slug: "my-docs" }), makeEnv(db), user, new URL("https://api/projects"));
    expect(res.status).toBe(400);
  });

  it("returns 400 if slug is missing", async () => {
    const db = makeDB();
    const res = await handleProjects(req("POST", "/projects", { name: "My Docs" }), makeEnv(db), user, new URL("https://api/projects"));
    expect(res.status).toBe(400);
  });

  it("returns 201 with the created project", async () => {
    const db = makeDB(makeStmt());
    const res = await handleProjects(
      req("POST", "/projects", { name: "My Docs", slug: "my-docs" }),
      makeEnv(db),
      user,
      new URL("https://api/projects"),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    const data = body.data as Record<string, unknown>;
    expect(data.name).toBe("My Docs");
    expect(data.slug).toBe("my-docs");
    expect(data.ownerId).toBe(user.userId);
  });
});

describe("GET /projects/:id", () => {
  it("returns 404 if the project is not found", async () => {
    const db = makeDB(makeStmt(null));
    const res = await handleProjects(req("GET", "/projects/p1"), makeEnv(db), user, new URL("https://api/projects/p1"));
    expect(res.status).toBe(404);
  });

  it("returns the project if found", async () => {
    const project = { id: "p1", name: "Test", slug: "test", ownerId: "user-1", createdAt: "2024-01-01" };
    const db = makeDB(makeStmt(project));
    const res = await handleProjects(req("GET", "/projects/p1"), makeEnv(db), user, new URL("https://api/projects/p1"));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.data).toEqual(project);
  });
});

describe("PATCH /projects/:id", () => {
  it("returns 404 if the project is not found", async () => {
    const db = makeDB(makeStmt(null));
    const res = await handleProjects(
      req("PATCH", "/projects/p1", { name: "New Name" }),
      makeEnv(db),
      user,
      new URL("https://api/projects/p1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns 400 if name is blank", async () => {
    const db = makeDB(makeStmt({ id: "p1" }));
    const res = await handleProjects(
      req("PATCH", "/projects/p1", { name: "   " }),
      makeEnv(db),
      user,
      new URL("https://api/projects/p1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 if no fields are provided", async () => {
    const db = makeDB(makeStmt({ id: "p1" }));
    const res = await handleProjects(
      req("PATCH", "/projects/p1", {}),
      makeEnv(db),
      user,
      new URL("https://api/projects/p1"),
    );
    expect(res.status).toBe(400);
  });

  it("returns the updated project on success", async () => {
    const updated = { id: "p1", name: "Updated", slug: "test", ownerId: "user-1", createdAt: "2024-01-01" };
    const db = makeDB(makeStmt({ id: "p1" }), makeStmt(), makeStmt(updated));
    const res = await handleProjects(
      req("PATCH", "/projects/p1", { name: "Updated" }),
      makeEnv(db),
      user,
      new URL("https://api/projects/p1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect((body.data as Record<string, unknown>).name).toBe("Updated");
  });
});

describe("DELETE /projects/:id", () => {
  it("returns 404 if the project is not found", async () => {
    const db = makeDB(makeStmt(null));
    const res = await handleProjects(req("DELETE", "/projects/p1"), makeEnv(db), user, new URL("https://api/projects/p1"));
    expect(res.status).toBe(404);
  });

  it("returns deleted: true on success", async () => {
    const db = makeDB(makeStmt({ id: "p1" }), makeStmt());
    const res = await handleProjects(req("DELETE", "/projects/p1"), makeEnv(db), user, new URL("https://api/projects/p1"));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect((body.data as Record<string, unknown>).deleted).toBe(true);
  });
});
