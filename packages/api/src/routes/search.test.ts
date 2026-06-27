import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleSearch } from "./search";

vi.mock("../lib/access", () => ({ resolveRole: vi.fn() }));

import { resolveRole } from "../lib/access";

const user = { userId: "user-1", email: "a@example.com" } as unknown as Parameters<typeof handleSearch>[2];

function makeEnv() {
  const alls: unknown[] = [];
  const all = vi.fn(() => Promise.resolve(alls.shift() ?? { results: [] }));
  const bind = vi.fn(() => ({ all }));
  const prepare = vi.fn((_sql?: string) => ({ bind }));
  return {
    env: { DB: { prepare } } as unknown as Parameters<typeof handleSearch>[1],
    prepare,
    bind,
    queueAll: (v: unknown) => alls.push(v),
  };
}

function call(env: Parameters<typeof handleSearch>[1], qs: string) {
  const url = new URL(`http://localhost/search?${qs}`);
  return handleSearch(new Request(url.toString()), env, user, url);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveRole).mockResolvedValue("editor");
});

describe("handleSearch", () => {
  it("404s on a non-GET method", async () => {
    const { env } = makeEnv();
    const url = new URL("http://localhost/search?projectId=p1&q=hi");
    const res = await handleSearch(new Request(url.toString(), { method: "POST" }), env, user, url);
    expect(res.status).toBe(404);
  });

  it("400s when projectId is missing", async () => {
    const { env } = makeEnv();
    const res = await call(env, "q=hello");
    expect(res.status).toBe(400);
  });

  it("400s when neither q nor tag is given", async () => {
    const { env } = makeEnv();
    const res = await call(env, "projectId=p1");
    expect(res.status).toBe(400);
  });

  it("403s when the caller isn't a member", async () => {
    vi.mocked(resolveRole).mockResolvedValue(null);
    const { env } = makeEnv();
    const res = await call(env, "projectId=p1&q=hello");
    expect(res.status).toBe(403);
  });

  it("runs a full-text search and returns the rows", async () => {
    const { env, prepare, bind, queueAll } = makeEnv();
    queueAll({ results: [{ doc_id: "d1", title: "Doc", excerpt: "<mark>hello</mark>" }] });
    const res = await call(env, "projectId=p1&q=hello");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: Array<{ doc_id: string }> };
    expect(json.data).toHaveLength(1);
    expect(json.data[0].doc_id).toBe("d1");
    // The non-limited path must MATCH the FTS table AND scope by project, with
    // no doc_shares join. sanitizeFtsQuery("hello") -> '"hello"'; bind order is
    // (query, projectId).
    const sql = prepare.mock.calls[0][0] as string;
    expect(sql).toContain("docs_fts MATCH ?");
    expect(sql).toContain("f.project_id = ?");
    expect(sql).not.toContain("doc_shares");
    expect(bind).toHaveBeenCalledWith('"hello"', "p1");
  });

  it("runs a tag search and parses the tags JSON", async () => {
    const { env, prepare, bind, queueAll } = makeEnv();
    queueAll({ results: [{ doc_id: "d1", title: "Doc", tags: JSON.stringify(["alpha", "beta"]) }] });
    const res = await call(env, "projectId=p1&tag=alph");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<{ doc_id: string; tags: string[] }> };
    expect(json.data[0].tags).toEqual(["alpha", "beta"]);
    // Non-limited tag search scopes by project and binds (projectId, tag).
    const sql = prepare.mock.calls[0][0] as string;
    expect(sql).toContain("d.project_id = ?");
    expect(bind).toHaveBeenCalledWith("p1", "alph");
  });

  it("uses the doc-shares-scoped tag query for a limited member", async () => {
    vi.mocked(resolveRole).mockResolvedValue("limited");
    const { env, prepare, bind, queueAll } = makeEnv();
    queueAll({ results: [] });
    await call(env, "projectId=p1&tag=alph");
    // limited path joins doc_shares and binds (userId, projectId, tag) in order.
    const sql = prepare.mock.calls[0][0] as string;
    expect(sql).toContain("doc_shares");
    expect(bind).toHaveBeenCalledWith("user-1", "p1", "alph");
  });

  it("uses the doc-shares-scoped query for a limited member", async () => {
    vi.mocked(resolveRole).mockResolvedValue("limited");
    const { env, bind, queueAll } = makeEnv();
    queueAll({ results: [] });
    await call(env, "projectId=p1&q=hello");
    // limited path binds the userId first (for the doc_shares join)
    expect(bind).toHaveBeenCalledWith("user-1", expect.anything(), "p1");
  });
});
