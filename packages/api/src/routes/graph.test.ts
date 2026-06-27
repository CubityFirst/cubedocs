import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleGraph, handleGraphReindex } from "./graph";

vi.mock("../lib/access", () => ({ resolveAccess: vi.fn() }));
vi.mock("../lib/docLinks", () => ({ reindexProject: vi.fn(async () => {}) }));

import { resolveAccess } from "../lib/access";
import { reindexProject } from "../lib/docLinks";

const user = { userId: "user-1", email: "a@example.com" } as unknown as Parameters<typeof handleGraph>[2];

// Queue-based D1 mock: enqueue rows for .first() / .all() in call order.
function makeEnv() {
  const firsts: unknown[] = [];
  const alls: unknown[] = [];
  const runs: unknown[] = [];
  const first = vi.fn(() => Promise.resolve(firsts.shift() ?? null));
  const all = vi.fn(() => Promise.resolve(alls.shift() ?? { results: [] }));
  const run = vi.fn(() => Promise.resolve(runs.shift() ?? { meta: { changes: 1 } }));
  const bind = vi.fn(() => ({ first, all, run }));
  const prepare = vi.fn(() => ({ bind }));
  return {
    env: { DB: { prepare } } as unknown as Parameters<typeof handleGraph>[1],
    run,
    prepare,
    queueFirst: (v: unknown) => firsts.push(v),
    queueAll: (v: unknown) => alls.push(v),
    queueRun: (v: unknown) => runs.push(v),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveAccess).mockResolvedValue({ role: "editor" } as never);
});

describe("handleGraph", () => {
  it("404s on a non-GET method", async () => {
    const { env, queueFirst, queueAll, prepare } = makeEnv();
    // Seed a full happy-path dataset: if the method gate were removed the handler
    // would resolve access, read the project, and 200 with a graph. The 404 plus
    // the untouched DB/access mocks prove the method gate short-circuits first.
    queueFirst({ graph_enabled: 1, graph_tag_colors: null });
    queueFirst({ graph_indexed_at: "2026-01-01" });
    queueAll({ results: [{ id: "d1", title: "Doc 1", tags: null }] });
    queueAll({ results: [] });
    const res = await handleGraph(
      new Request("http://localhost/projects/p1/graph", { method: "POST" }),
      env, user, new URL("http://localhost/projects/p1/graph"),
    );
    expect(res.status).toBe(404);
    expect(resolveAccess).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
  });

  it("403s when the caller has no access to the project", async () => {
    vi.mocked(resolveAccess).mockResolvedValue(null);
    const { env } = makeEnv();
    const res = await handleGraph(
      new Request("http://localhost/projects/p1/graph"),
      env, user, new URL("http://localhost/projects/p1/graph"),
    );
    expect(res.status).toBe(403);
  });

  it("404s when the project row is missing", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst(null); // graph_enabled lookup
    const res = await handleGraph(
      new Request("http://localhost/projects/p1/graph"),
      env, user, new URL("http://localhost/projects/p1/graph"),
    );
    expect(res.status).toBe(404);
  });

  it("403s when graph is disabled for the project", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ graph_enabled: 0, graph_tag_colors: null });
    const res = await handleGraph(
      new Request("http://localhost/projects/p1/graph"),
      env, user, new URL("http://localhost/projects/p1/graph"),
    );
    expect(res.status).toBe(403);
  });

  it("returns nodes + edges + tagColors on success", async () => {
    const { env, queueFirst, queueAll } = makeEnv();
    queueFirst({ graph_enabled: 1, graph_tag_colors: JSON.stringify([{ tag: "x", color: "#fff" }]) });
    queueFirst({ graph_indexed_at: "2026-01-01" }); // buildGraph: already indexed (no reindex)
    queueAll({ results: [{ id: "d1", title: "Doc 1", tags: null }, { id: "d2", title: "Doc 2", tags: null }] });
    queueAll({ results: [{ source_doc_id: "d1", target_doc_id: "d2" }] });
    const res = await handleGraph(
      new Request("http://localhost/projects/p1/graph"),
      env, user, new URL("http://localhost/projects/p1/graph"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; data: { nodes: unknown[]; edges: unknown[]; tagColors: unknown[] } };
    expect(json.data.nodes).toHaveLength(2);
    expect(json.data.edges).toHaveLength(1);
    expect(json.data.tagColors).toEqual([{ tag: "x", color: "#fff" }]);
    expect(reindexProject).not.toHaveBeenCalled();
  });
});

describe("handleGraphReindex", () => {
  it("403s for a non-admin caller", async () => {
    vi.mocked(resolveAccess).mockResolvedValue({ role: "editor" } as never);
    const { env } = makeEnv();
    const res = await handleGraphReindex(
      new Request("http://localhost/projects/p1/graph/reindex", { method: "POST" }),
      env, user, new URL("http://localhost/projects/p1/graph/reindex"),
    );
    expect(res.status).toBe(403);
  });

  it("429s when still within the reindex cooldown", async () => {
    vi.mocked(resolveAccess).mockResolvedValue({ role: "admin" } as never);
    const { env, queueFirst } = makeEnv();
    const future = new Date(Date.now() + 60_000).toISOString();
    queueFirst({ graph_enabled: 1, graph_reindex_available_at: future });
    const res = await handleGraphReindex(
      new Request("http://localhost/projects/p1/graph/reindex", { method: "POST" }),
      env, user, new URL("http://localhost/projects/p1/graph/reindex"),
    );
    expect(res.status).toBe(429);
    expect(reindexProject).not.toHaveBeenCalled();
  });

  it("reindexes and returns the next-available time for an admin past cooldown", async () => {
    vi.mocked(resolveAccess).mockResolvedValue({ role: "admin" } as never);
    const { env, queueFirst } = makeEnv();
    queueFirst({ graph_enabled: 1, graph_reindex_available_at: null });
    const res = await handleGraphReindex(
      new Request("http://localhost/projects/p1/graph/reindex", { method: "POST" }),
      env, user, new URL("http://localhost/projects/p1/graph/reindex"),
    );
    expect(res.status).toBe(200);
    expect(reindexProject).toHaveBeenCalledWith(env, "p1");
    const json = (await res.json()) as { data: { nextAvailableAt: string } };
    expect(json.data.nextAvailableAt).toBeTruthy();
  });
});
