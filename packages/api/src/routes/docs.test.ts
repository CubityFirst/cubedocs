import { describe, it, expect } from "vitest";
import { handleDocs } from "./docs";
import type { Session } from "../lib";
import type { Env } from "../index";

const user: Session = { userId: "author-1", email: "a@example.com", expiresAt: Date.now() + 60_000 };

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
  };
}

function req(method: string, path: string, search = "", body?: object): Request {
  return new Request(`https://api${path}${search}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("GET /docs?projectId=xxx", () => {
  it("returns 400 if projectId is missing", async () => {
    const db = makeDB();
    const res = await handleDocs(req("GET", "/docs"), makeEnv(db), user, new URL("https://api/docs"));
    expect(res.status).toBe(400);
  });

  it("returns the list of docs for the project", async () => {
    const docs = [{ id: "d1", title: "Intro", slug: "intro", content: "Hello", projectId: "p1", authorId: "author-1", publishedAt: null, createdAt: "2024-01-01", updatedAt: "2024-01-01" }];
    const db = makeDB(makeStmt(null, docs));
    const res = await handleDocs(req("GET", "/docs", "?projectId=p1"), makeEnv(db), user, new URL("https://api/docs?projectId=p1"));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.data).toEqual(docs);
  });
});

describe("POST /docs", () => {
  it("returns 400 if title is missing", async () => {
    const db = makeDB();
    const res = await handleDocs(req("POST", "/docs", "", { slug: "intro", projectId: "p1" }), makeEnv(db), user, new URL("https://api/docs"));
    expect(res.status).toBe(400);
  });

  it("returns 400 if slug is missing", async () => {
    const db = makeDB();
    const res = await handleDocs(req("POST", "/docs", "", { title: "Intro", projectId: "p1" }), makeEnv(db), user, new URL("https://api/docs"));
    expect(res.status).toBe(400);
  });

  it("returns 400 if projectId is missing", async () => {
    const db = makeDB();
    const res = await handleDocs(req("POST", "/docs", "", { title: "Intro", slug: "intro" }), makeEnv(db), user, new URL("https://api/docs"));
    expect(res.status).toBe(400);
  });

  it("returns 201 with the created doc", async () => {
    const db = makeDB(makeStmt());
    const res = await handleDocs(
      req("POST", "/docs", "", { title: "Intro", slug: "intro", content: "Hello", projectId: "p1" }),
      makeEnv(db),
      user,
      new URL("https://api/docs"),
    );
    expect(res.status).toBe(201);
    const body = await res.json() as Record<string, unknown>;
    const data = body.data as Record<string, unknown>;
    expect(data.title).toBe("Intro");
    expect(data.slug).toBe("intro");
    expect(data.projectId).toBe("p1");
    expect(data.authorId).toBe(user.userId);
    expect(data.publishedAt).toBeNull();
  });

  it("defaults content to empty string if not provided", async () => {
    const db = makeDB(makeStmt());
    const res = await handleDocs(
      req("POST", "/docs", "", { title: "Intro", slug: "intro", projectId: "p1" }),
      makeEnv(db),
      user,
      new URL("https://api/docs"),
    );
    const body = await res.json() as Record<string, unknown>;
    expect((body.data as Record<string, unknown>).content).toBe("");
  });
});

describe("GET /docs/:id", () => {
  it("returns 404 if the doc is not found", async () => {
    const db = makeDB(makeStmt(null));
    const res = await handleDocs(req("GET", "/docs/d1"), makeEnv(db), user, new URL("https://api/docs/d1"));
    expect(res.status).toBe(404);
  });

  it("returns the doc if found", async () => {
    const doc = { id: "d1", title: "Intro", slug: "intro", content: "Hello", projectId: "p1", authorId: "author-1", publishedAt: null, createdAt: "2024-01-01", updatedAt: "2024-01-01" };
    const db = makeDB(makeStmt(doc));
    const res = await handleDocs(req("GET", "/docs/d1"), makeEnv(db), user, new URL("https://api/docs/d1"));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.data).toEqual(doc);
  });
});

describe("PUT /docs/:id", () => {
  it("returns 404 if the doc does not exist after update", async () => {
    const db = makeDB(makeStmt(), makeStmt(null));
    const res = await handleDocs(
      req("PUT", "/docs/d1", "", { title: "Updated" }),
      makeEnv(db),
      user,
      new URL("https://api/docs/d1"),
    );
    expect(res.status).toBe(404);
  });

  it("returns the updated doc on success", async () => {
    const updated = { id: "d1", title: "Updated", slug: "intro", content: "Hello", projectId: "p1", authorId: "author-1", publishedAt: null, createdAt: "2024-01-01", updatedAt: "2024-01-02" };
    const db = makeDB(makeStmt(), makeStmt(updated));
    const res = await handleDocs(
      req("PUT", "/docs/d1", "", { title: "Updated" }),
      makeEnv(db),
      user,
      new URL("https://api/docs/d1"),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect((body.data as Record<string, unknown>).title).toBe("Updated");
  });
});

describe("DELETE /docs/:id", () => {
  it("returns deleted: true on success", async () => {
    const db = makeDB(makeStmt());
    const res = await handleDocs(req("DELETE", "/docs/d1"), makeEnv(db), user, new URL("https://api/docs/d1"));
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect((body.data as Record<string, unknown>).deleted).toBe(true);
  });
});
