import { describe, it, expect, vi, beforeEach } from "vitest";
import { unzipSync } from "fflate";
import { handleProjectExport } from "./export";

vi.mock("../lib/access", () => ({ resolveRole: vi.fn() }));

import { resolveRole } from "../lib/access";

const user = { userId: "user-1", email: "a@example.com" } as unknown as Parameters<typeof handleProjectExport>[2];

function makeEnv() {
  const firsts: unknown[] = [];
  const alls: unknown[] = [];
  const first = vi.fn(() => Promise.resolve(firsts.shift() ?? null));
  const all = vi.fn(() => Promise.resolve(alls.shift() ?? { results: [] }));
  const bind = vi.fn(() => ({ first, all }));
  const prepare = vi.fn(() => ({ bind }));
  const get = vi.fn(async () => null); // R2 objects absent → empty zip entries
  return {
    env: { DB: { prepare }, ASSETS: { get } } as unknown as Parameters<typeof handleProjectExport>[1],
    get,
    queueFirst: (v: unknown) => firsts.push(v),
    queueAll: (v: unknown) => alls.push(v),
  };
}

function call(env: Parameters<typeof handleProjectExport>[1], method: string, path: string) {
  const url = new URL(`http://localhost${path}`);
  return handleProjectExport(new Request(url.toString(), { method }), env, user, url);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveRole).mockResolvedValue("admin");
});

describe("handleProjectExport", () => {
  it("404s for a non-GET method", async () => {
    // Queue a full happy-path dataset so the 404 pins the method guard, not a
    // missing project row: deleting the `method !== "GET"` check would otherwise
    // reach the zip path and 200.
    const { env, queueFirst, queueAll } = makeEnv();
    queueFirst({ name: "My Project" });
    queueAll({ results: [{ id: "d1", title: "Doc One", folder_id: null }] });
    queueAll({ results: [] });
    queueAll({ results: [] });
    const res = await call(env, "POST", "/projects/p1/export");
    expect(res.status).toBe(404);
  });

  it("404s when the caller isn't a member", async () => {
    vi.mocked(resolveRole).mockResolvedValue(null);
    // Queue a full happy-path dataset so the 404 pins the `role === null` gate:
    // without it the handler would reach the zip path and 200.
    const { env, queueFirst, queueAll } = makeEnv();
    queueFirst({ name: "My Project" });
    queueAll({ results: [{ id: "d1", title: "Doc One", folder_id: null }] });
    queueAll({ results: [] });
    queueAll({ results: [] });
    const res = await call(env, "GET", "/projects/p1/export");
    expect(res.status).toBe(404);
  });

  it("403s for a member below admin", async () => {
    vi.mocked(resolveRole).mockResolvedValue("editor");
    const { env } = makeEnv();
    const res = await call(env, "GET", "/projects/p1/export");
    expect(res.status).toBe(403);
  });

  it("404s when the project row is missing", async () => {
    const { env } = makeEnv(); // projectRow first() → null
    const res = await call(env, "GET", "/projects/p1/export");
    expect(res.status).toBe(404);
  });

  it("streams a zip (200) with the right headers for an admin", async () => {
    const { env, queueFirst, queueAll } = makeEnv();
    queueFirst({ name: "My Project" }); // projectRow
    queueAll({ results: [{ id: "d1", title: "Doc One", folder_id: "fd1" }] }); // docs
    queueAll({ results: [{ id: "x1", name: "pic.png", folder_id: "ff1" }] }); // files
    queueAll({ results: [
      { id: "fd1", name: "Docs Folder", parent_id: null, type: "docs" },
      { id: "ff1", name: "Files Folder", parent_id: null, type: "files" },
    ] }); // folders
    const res = await call(env, "GET", "/projects/p1/export");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain('filename="My Project.zip"');
    // Drain the stream and parse the zip: assert the exact set of entry paths,
    // each placed under its folder (doc -> ".md", file -> raw name).
    const buf = await res.arrayBuffer();
    const entries = unzipSync(new Uint8Array(buf));
    expect(Object.keys(entries).sort()).toEqual([
      "Docs Folder/Doc One.md",
      "Files Folder/pic.png",
    ]);
  });

  it("streams an empty zip when the project has no docs/files", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ name: "Empty" });
    // docs/files/folders default to { results: [] }
    const res = await call(env, "GET", "/projects/p1/export");
    expect(res.status).toBe(200);
    const buf = await res.arrayBuffer();
    const entries = unzipSync(new Uint8Array(buf));
    expect(Object.keys(entries)).toHaveLength(0);
  });
});
