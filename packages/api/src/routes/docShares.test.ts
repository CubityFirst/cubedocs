import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleDocShares } from "./docShares";

vi.mock("../lib/access", () => ({ resolveRole: vi.fn() }));

import { resolveRole } from "../lib/access";

const user = { userId: "caller-1", email: "a@example.com" } as unknown as Parameters<typeof handleDocShares>[2];

function makeEnv() {
  const firsts: unknown[] = [];
  const alls: unknown[] = [];
  const runs: unknown[] = [];
  const first = vi.fn(() => Promise.resolve(firsts.shift() ?? null));
  const all = vi.fn(() => Promise.resolve(alls.shift() ?? { results: [] }));
  const run = vi.fn(() => Promise.resolve(runs.shift() ?? { meta: { changes: 1 } }));
  const bind = vi.fn(() => ({ first, all, run }));
  const prepare = vi.fn(() => ({ bind }));
  const batch = vi.fn(() => Promise.resolve([]));
  return {
    env: { DB: { prepare, batch } } as unknown as Parameters<typeof handleDocShares>[1],
    run,
    batch,
    queueFirst: (v: unknown) => firsts.push(v),
    queueAll: (v: unknown) => alls.push(v),
  };
}

function call(env: Parameters<typeof handleDocShares>[1], method: string, path: string, body?: unknown) {
  const url = new URL(`http://localhost${path}`);
  return handleDocShares(
    new Request(url.toString(), {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
    env, user, url,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveRole).mockResolvedValue("admin");
});

describe("handleDocShares /docs/:id/shares", () => {
  it("404s when the doc doesn't exist", async () => {
    const { env } = makeEnv(); // meta first() → null
    const res = await call(env, "GET", "/docs/d1/shares");
    expect(res.status).toBe(404);
  });

  it("403s when the caller is below admin", async () => {
    vi.mocked(resolveRole).mockResolvedValue("editor");
    const { env, queueFirst } = makeEnv();
    queueFirst({ project_id: "p1" }); // doc meta
    const res = await call(env, "GET", "/docs/d1/shares");
    expect(res.status).toBe(403);
  });

  it("lists the doc's shares for an admin", async () => {
    const { env, queueFirst, queueAll } = makeEnv();
    queueFirst({ project_id: "p1" });
    queueAll({ results: [{ user_id: "u2", name: "U", email: "u@x.z", permission: "view" }] });
    const res = await call(env, "GET", "/docs/d1/shares");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<{ userId: string; permission: string }> };
    expect(json.data[0].userId).toBe("u2");
  });

  it("400s POST without a userId", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ project_id: "p1" });
    const res = await call(env, "POST", "/docs/d1/shares", {});
    expect(res.status).toBe(400);
  });

  it("404s POST when the target isn't a project member", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ project_id: "p1" }); // meta
    queueFirst(null); // target lookup
    const res = await call(env, "POST", "/docs/d1/shares", { userId: "u2" });
    expect(res.status).toBe(404);
  });

  it("400s POST when sharing with an editor (already has access)", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ project_id: "p1" });
    queueFirst({ role: "editor" });
    const res = await call(env, "POST", "/docs/d1/shares", { userId: "u2", permission: "edit" });
    expect(res.status).toBe(400);
  });

  it("grants a share (201) to a viewer", async () => {
    const { env, queueFirst, run } = makeEnv();
    queueFirst({ project_id: "p1" });
    queueFirst({ role: "viewer" }); // target
    queueFirst({ name: "U", email: "u@x.z" }); // share lookup
    const res = await call(env, "POST", "/docs/d1/shares", { userId: "u2", permission: "edit" });
    expect(res.status).toBe(201);
    expect(run).toHaveBeenCalled();
    const json = (await res.json()) as { data: { permission: string } };
    expect(json.data.permission).toBe("edit");
  });

  it("400s PATCH with an invalid permission", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ project_id: "p1" });
    const res = await call(env, "PATCH", "/docs/d1/shares/u2", { permission: "owner" });
    expect(res.status).toBe(400);
  });

  it("404s DELETE when no share exists", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ project_id: "p1" });
    queueFirst(null); // existing share
    const res = await call(env, "DELETE", "/docs/d1/shares/u2");
    expect(res.status).toBe(404);
  });

  it("revokes an existing share", async () => {
    const { env, queueFirst, run } = makeEnv();
    queueFirst({ project_id: "p1" });
    queueFirst({ id: "s1" }); // existing
    const res = await call(env, "DELETE", "/docs/d1/shares/u2");
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalled();
  });
});

describe("handleDocShares folder-shares bulk", () => {
  it("403s for a caller below admin", async () => {
    vi.mocked(resolveRole).mockResolvedValue("editor");
    const { env } = makeEnv();
    const res = await call(env, "POST", "/projects/p1/folder-shares", { userId: "u2", folderId: "f1" });
    expect(res.status).toBe(403);
  });

  it("400s when sharing a folder with an editor", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ role: "editor" }); // target
    const res = await call(env, "POST", "/projects/p1/folder-shares", { userId: "u2", folderId: "f1" });
    expect(res.status).toBe(400);
  });

  it("returns granted:0 for an empty folder", async () => {
    const { env, queueFirst, queueAll } = makeEnv();
    queueFirst({ role: "viewer" });
    queueAll({ results: [] }); // docs in folder
    const res = await call(env, "POST", "/projects/p1/folder-shares", { userId: "u2", folderId: "f1" });
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { granted: number } };
    expect(json.data.granted).toBe(0);
  });

  it("bulk-shares every doc in the folder", async () => {
    const { env, queueFirst, queueAll, batch } = makeEnv();
    queueFirst({ role: "viewer" });
    queueAll({ results: [{ id: "d1" }, { id: "d2" }] });
    const res = await call(env, "POST", "/projects/p1/folder-shares", { userId: "u2", folderId: "f1", permission: "edit" });
    expect(res.status).toBe(200);
    expect(batch).toHaveBeenCalled();
    const json = (await res.json()) as { data: { granted: number } };
    expect(json.data.granted).toBe(2);
  });
});
