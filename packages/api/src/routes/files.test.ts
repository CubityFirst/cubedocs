import { describe, it, expect, vi, beforeEach } from "vitest";
import { handleFiles } from "./files";

vi.mock("../lib/access", () => ({ resolveRole: vi.fn() }));
vi.mock("../lib", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib")>()),
  serveR2Object: vi.fn(),
  folderInProject: vi.fn(),
}));
vi.mock("../lib/contentToken", () => ({
  signContentToken: vi.fn(),
  verifyContentToken: vi.fn(),
}));
vi.mock("../lib/r2Presign", () => ({
  presignR2GetUrl: vi.fn(),
  PRESIGN_URL_TTL_SECONDS: 900,
}));

import { resolveRole } from "../lib/access";
import { serveR2Object, folderInProject } from "../lib";
import { signContentToken, verifyContentToken } from "../lib/contentToken";
import { presignR2GetUrl } from "../lib/r2Presign";

const EXCALIDRAW_MIME = "application/vnd.excalidraw+json";

const user = { userId: "user-1", email: "a@example.com" } as unknown as Parameters<typeof handleFiles>[2];

function makeEnv() {
  const firsts: unknown[] = [];
  const alls: unknown[] = [];
  const runs: unknown[] = [];
  const bindCalls: unknown[][] = [];
  const first = vi.fn(() => Promise.resolve(firsts.shift() ?? null));
  const all = vi.fn(() => Promise.resolve(alls.shift() ?? { results: [] }));
  const run = vi.fn(() => Promise.resolve(runs.shift() ?? { meta: { changes: 1 } }));
  const bind = vi.fn((...args: unknown[]) => { bindCalls.push(args); return { first, all, run }; });
  const prepare = vi.fn((_sql: string) => ({ bind }));
  const put = vi.fn(async () => undefined);
  const del = vi.fn(async () => undefined);
  const get = vi.fn(async () => null);
  return {
    env: {
      DB: { prepare },
      ASSETS: { put, delete: del, get },
      JWT_SECRET: "secret",
    } as unknown as Parameters<typeof handleFiles>[1],
    run,
    put,
    del,
    prepare,
    bindCalls,
    queueFirst: (v: unknown) => firsts.push(v),
    queueAll: (v: unknown) => alls.push(v),
  };
}

function call(
  env: Parameters<typeof handleFiles>[1],
  method: string,
  path: string,
  body?: unknown,
  u: Parameters<typeof handleFiles>[2] | null = user,
) {
  const url = new URL(`http://localhost${path}`);
  return handleFiles(
    new Request(url.toString(), {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }),
    env, u, url,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(resolveRole).mockResolvedValue("editor");
  vi.mocked(folderInProject).mockResolvedValue(true);
  vi.mocked(verifyContentToken).mockResolvedValue(false);
  vi.mocked(signContentToken).mockResolvedValue("content-token");
  vi.mocked(presignR2GetUrl).mockResolvedValue(null);
  vi.mocked(serveR2Object).mockReturnValue(new Response("bytes", { status: 200 }) as never);
});

describe("handleFiles GET /files/:id/content", () => {
  it("404s when the file doesn't exist", async () => {
    const { env } = makeEnv(); // meta first() → null
    const res = await call(env, "GET", "/files/f1/content");
    expect(res.status).toBe(404);
  });

  it("serves a published file without a session", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ name: "a.png", mime_type: "image/png", size: 3, project_id: "p1", updated_at: null, published_at: "2026" });
    const res = await call(env, "GET", "/files/f1/content", undefined, null);
    expect(res.status).toBe(200);
    expect(serveR2Object).toHaveBeenCalled();
  });

  it("serves via a valid capability token without a session", async () => {
    vi.mocked(verifyContentToken).mockResolvedValue(true);
    const { env, queueFirst } = makeEnv();
    queueFirst({ name: "a.png", mime_type: "image/png", size: 3, project_id: "p1", updated_at: null, published_at: null });
    const res = await call(env, "GET", "/files/f1/content?token=t", undefined, null);
    expect(res.status).toBe(200);
    expect(serveR2Object).toHaveBeenCalled();
  });

  it("401s for an unpublished file with no token and no session", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ name: "a.png", mime_type: "image/png", size: 3, project_id: "p1", updated_at: null, published_at: null });
    const res = await call(env, "GET", "/files/f1/content", undefined, null);
    expect(res.status).toBe(401);
  });

  it("403s for a non-member session", async () => {
    vi.mocked(resolveRole).mockResolvedValue(null);
    const { env, queueFirst } = makeEnv();
    queueFirst({ name: "a.png", mime_type: "image/png", size: 3, project_id: "p1", updated_at: null, published_at: null });
    const res = await call(env, "GET", "/files/f1/content");
    expect(res.status).toBe(403);
  });

  it("403s a limited member with no doc share", async () => {
    vi.mocked(resolveRole).mockResolvedValue("limited");
    const { env, queueFirst } = makeEnv();
    queueFirst({ name: "a.png", mime_type: "image/png", size: 3, project_id: "p1", updated_at: null, published_at: null });
    queueFirst(null); // doc_shares lookup
    const res = await call(env, "GET", "/files/f1/content");
    expect(res.status).toBe(403);
  });

  it("serves a limited member who has a doc share", async () => {
    vi.mocked(resolveRole).mockResolvedValue("limited");
    const { env, queueFirst } = makeEnv();
    queueFirst({ name: "a.png", mime_type: "image/png", size: 3, project_id: "p1", updated_at: null, published_at: null });
    queueFirst({ id: "s1" }); // doc_shares lookup
    const res = await call(env, "GET", "/files/f1/content");
    expect(res.status).toBe(200);
    expect(serveR2Object).toHaveBeenCalled();
  });

  it("serves an authenticated member of an unpublished project", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ name: "a.png", mime_type: "image/png", size: 3, project_id: "p1", updated_at: null, published_at: null });
    const res = await call(env, "GET", "/files/f1/content");
    expect(res.status).toBe(200);
    expect(serveR2Object).toHaveBeenCalled();
  });
});

describe("handleFiles auth gate for non-content ops", () => {
  it("401s without a session", async () => {
    const { env } = makeEnv();
    const res = await call(env, "GET", "/files/f1", undefined, null);
    expect(res.status).toBe(401);
  });
});

describe("handleFiles GET /files/:id", () => {
  it("404s when the file is missing", async () => {
    const { env } = makeEnv();
    const res = await call(env, "GET", "/files/f1");
    expect(res.status).toBe(404);
  });

  it("403s for a non-member", async () => {
    vi.mocked(resolveRole).mockResolvedValue(null);
    const { env, queueFirst } = makeEnv();
    queueFirst({ id: "f1", name: "a.png", mime_type: "image/png", size: 3, project_id: "p1", folder_id: null, uploaded_by: "u", created_at: "x", updated_at: "y" });
    const res = await call(env, "GET", "/files/f1");
    expect(res.status).toBe(403);
  });

  it("403s for a limited member", async () => {
    vi.mocked(resolveRole).mockResolvedValue("limited");
    const { env, queueFirst } = makeEnv();
    queueFirst({ id: "f1", name: "a.png", mime_type: "image/png", size: 3, project_id: "p1", folder_id: null, uploaded_by: "u", created_at: "x", updated_at: "y" });
    const res = await call(env, "GET", "/files/f1");
    expect(res.status).toBe(403);
  });

  it("returns metadata + content token for a non-video file (no stream url)", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ id: "f1", name: "a.png", mime_type: "image/png", size: 3, project_id: "p1", folder_id: null, uploaded_by: "u", created_at: "x", updated_at: "y" });
    const res = await call(env, "GET", "/files/f1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { content_token: string; content_stream_url: string | null } };
    expect(json.data.content_token).toBe("content-token");
    expect(json.data.content_stream_url).toBeNull();
    expect(presignR2GetUrl).not.toHaveBeenCalled();
  });

  it("presigns a stream url for an inline-safe video", async () => {
    vi.mocked(presignR2GetUrl).mockResolvedValue("https://r2/stream");
    const { env, queueFirst } = makeEnv();
    queueFirst({ id: "f1", name: "v.mp4", mime_type: "video/mp4", size: 3, project_id: "p1", folder_id: null, uploaded_by: "u", created_at: "x", updated_at: "y" });
    const res = await call(env, "GET", "/files/f1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { content_stream_url: string | null } };
    expect(json.data.content_stream_url).toBe("https://r2/stream");
    expect(presignR2GetUrl).toHaveBeenCalled();
  });
});

describe("handleFiles GET /files (list)", () => {
  it("400s without projectId", async () => {
    const { env } = makeEnv();
    const res = await call(env, "GET", "/files");
    expect(res.status).toBe(400);
  });

  it("403s for a non-member", async () => {
    vi.mocked(resolveRole).mockResolvedValue(null);
    const { env } = makeEnv();
    const res = await call(env, "GET", "/files?projectId=p1");
    expect(res.status).toBe(403);
  });

  it("403s for a limited member", async () => {
    vi.mocked(resolveRole).mockResolvedValue("limited");
    const { env } = makeEnv();
    const res = await call(env, "GET", "/files?projectId=p1");
    expect(res.status).toBe(403);
  });

  it("lists all files for a member", async () => {
    const { env, queueAll } = makeEnv();
    queueAll({ results: [{ id: "f1" }, { id: "f2" }] });
    const res = await call(env, "GET", "/files?projectId=p1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[] };
    expect(json.data).toHaveLength(2);
  });

  it("lists files within a folder", async () => {
    const { env, queueAll, prepare, bindCalls } = makeEnv();
    queueAll({ results: [{ id: "f1" }] });
    const res = await call(env, "GET", "/files?projectId=p1&folderId=fl1");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[] };
    expect(json.data).toHaveLength(1);
    // The folder-scoped branch must filter on the folder column with both binds.
    expect(prepare.mock.calls.some(c => (c[0] as string).includes("f.folder_id = ?"))).toBe(true);
    expect(bindCalls).toContainEqual(["p1", "fl1"]);
  });

  it("lists root files when folderId is present but empty", async () => {
    const { env, queueAll, prepare, bindCalls } = makeEnv();
    queueAll({ results: [] });
    const res = await call(env, "GET", "/files?projectId=p1&folderId=");
    expect(res.status).toBe(200);
    // Empty folderId means "root files" - IS NULL filter, never an equality bind.
    const listSql = prepare.mock.calls.map(c => c[0] as string).filter(s => s.includes("FROM files f"));
    expect(listSql.some(s => s.includes("f.folder_id IS NULL"))).toBe(true);
    expect(listSql.some(s => s.includes("f.folder_id = ?"))).toBe(false);
    expect(bindCalls).toContainEqual(["p1"]);
  });
});

describe("handleFiles POST /files (upload)", () => {
  function uploadReq(env: Parameters<typeof handleFiles>[1], form: FormData) {
    const url = new URL("http://localhost/files");
    return handleFiles(new Request(url.toString(), { method: "POST", body: form }), env, user, url);
  }

  it("400s when not multipart", async () => {
    const { env } = makeEnv();
    const res = await call(env, "POST", "/files", { projectId: "p1" });
    expect(res.status).toBe(400);
  });

  it("400s when file or projectId is missing", async () => {
    const { env } = makeEnv();
    const form = new FormData();
    form.set("projectId", "p1");
    const res = await uploadReq(env, form);
    expect(res.status).toBe(400);
  });

  it("400s when the file exceeds the size limit", async () => {
    const { env } = makeEnv();
    const form = new FormData();
    form.set("file", new File([new Uint8Array(50 * 1024 * 1024 + 1)], "big.bin", { type: "application/octet-stream" }));
    form.set("projectId", "p1");
    const res = await uploadReq(env, form);
    expect(res.status).toBe(400);
  });

  it("403s for a viewer (below editor)", async () => {
    vi.mocked(resolveRole).mockResolvedValue("viewer");
    const { env } = makeEnv();
    const form = new FormData();
    form.set("file", new File([new Uint8Array(8)], "a.png", { type: "image/png" }));
    form.set("projectId", "p1");
    const res = await uploadReq(env, form);
    expect(res.status).toBe(403);
  });

  it("403s for a non-member", async () => {
    vi.mocked(resolveRole).mockResolvedValue(null);
    const { env } = makeEnv();
    const form = new FormData();
    form.set("file", new File([new Uint8Array(8)], "a.png", { type: "image/png" }));
    form.set("projectId", "p1");
    const res = await uploadReq(env, form);
    expect(res.status).toBe(403);
  });

  it("uploads a file (201) for an editor", async () => {
    const { env, put, run } = makeEnv();
    const form = new FormData();
    form.set("file", new File([new Uint8Array(8)], "a.png", { type: "image/png" }));
    form.set("projectId", "p1");
    const res = await uploadReq(env, form);
    expect(res.status).toBe(201);
    expect(put).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
    const json = (await res.json()) as { data: { name: string; project_id: string } };
    expect(json.data.name).toBe("a.png");
    expect(json.data.project_id).toBe("p1");
  });
});

describe("handleFiles PUT /files/:id/content (overwrite drawing)", () => {
  function putContent(env: Parameters<typeof handleFiles>[1], id: string, bytes: Uint8Array) {
    const url = new URL(`http://localhost/files/${id}/content`);
    return handleFiles(new Request(url.toString(), { method: "PUT", body: bytes as BodyInit }), env, user, url);
  }

  it("404s when the file is missing", async () => {
    const { env } = makeEnv();
    const res = await putContent(env, "f1", new Uint8Array([1]));
    expect(res.status).toBe(404);
  });

  it("400s for an immutable (non-drawing) file", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ name: "a.png", mime_type: "image/png", project_id: "p1", updated_at: null });
    const res = await putContent(env, "f1", new Uint8Array([1]));
    expect(res.status).toBe(400);
  });

  it("403s for a viewer", async () => {
    vi.mocked(resolveRole).mockResolvedValue("viewer");
    const { env, queueFirst } = makeEnv();
    queueFirst({ name: "d.excalidraw", mime_type: EXCALIDRAW_MIME, project_id: "p1", updated_at: null });
    const res = await putContent(env, "f1", new Uint8Array([1]));
    expect(res.status).toBe(403);
  });

  it("overwrites a drawing (200) for an editor", async () => {
    const { env, queueFirst, put, run } = makeEnv();
    queueFirst({ name: "d.excalidraw", mime_type: EXCALIDRAW_MIME, project_id: "p1", updated_at: null });
    const res = await putContent(env, "f1", new Uint8Array([1, 2, 3]));
    expect(res.status).toBe(200);
    expect(put).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
    const json = (await res.json()) as { data: { id: string; size: number } };
    expect(json.data.size).toBe(3);
  });
});

describe("handleFiles PUT /files/:id (move/rename)", () => {
  it("404s when the file is missing", async () => {
    const { env } = makeEnv();
    const res = await call(env, "PUT", "/files/f1", { name: "new" });
    expect(res.status).toBe(404);
  });

  it("403s for a viewer", async () => {
    vi.mocked(resolveRole).mockResolvedValue("viewer");
    const { env, queueFirst } = makeEnv();
    queueFirst({ project_id: "p1" });
    const res = await call(env, "PUT", "/files/f1", { name: "new" });
    expect(res.status).toBe(403);
  });

  it("400s when moving to a folder outside the project", async () => {
    vi.mocked(folderInProject).mockResolvedValue(false);
    const { env, queueFirst } = makeEnv();
    queueFirst({ project_id: "p1" });
    const res = await call(env, "PUT", "/files/f1", { folderId: "bad" });
    expect(res.status).toBe(400);
  });

  it("renames a file for an editor", async () => {
    const { env, queueFirst, run, prepare, bindCalls } = makeEnv();
    queueFirst({ project_id: "p1" }); // meta
    queueFirst({ id: "f1", name: "new" }); // updated select
    const res = await call(env, "PUT", "/files/f1", { name: "new" });
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalled();
    const json = (await res.json()) as { data: { name: string } };
    expect(json.data.name).toBe("new");
    // The rename must issue a name UPDATE bound to (name, id) - not just echo the select.
    expect(prepare.mock.calls.some(c => (c[0] as string).includes("UPDATE files SET name = ?"))).toBe(true);
    expect(bindCalls).toContainEqual(["new", "f1"]);
  });

  it("moves a file to a valid folder", async () => {
    const { env, queueFirst, run, prepare, bindCalls } = makeEnv();
    queueFirst({ project_id: "p1" });
    queueFirst({ id: "f1", folder_id: "fl1" });
    const res = await call(env, "PUT", "/files/f1", { folderId: "fl1" });
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalled();
    // The move must issue a folder_id UPDATE bound to (folderId, id).
    expect(prepare.mock.calls.some(c => (c[0] as string).includes("UPDATE files SET folder_id = ?"))).toBe(true);
    expect(bindCalls).toContainEqual(["fl1", "f1"]);
  });
});

describe("handleFiles DELETE /files/:id", () => {
  it("404s when the file is missing", async () => {
    const { env } = makeEnv();
    const res = await call(env, "DELETE", "/files/f1");
    expect(res.status).toBe(404);
  });

  it("403s for a viewer", async () => {
    vi.mocked(resolveRole).mockResolvedValue("viewer");
    const { env, queueFirst } = makeEnv();
    queueFirst({ project_id: "p1" });
    const res = await call(env, "DELETE", "/files/f1");
    expect(res.status).toBe(403);
  });

  it("deletes the file + R2 blob for an editor", async () => {
    const { env, queueFirst, del, run } = makeEnv();
    queueFirst({ project_id: "p1" });
    const res = await call(env, "DELETE", "/files/f1");
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalledWith("files/f1");
    expect(run).toHaveBeenCalled();
  });
});

describe("handleFiles unknown route", () => {
  it("404s an unsupported method", async () => {
    const { env, queueFirst } = makeEnv();
    queueFirst({ project_id: "p1" });
    const res = await call(env, "PATCH", "/files/f1");
    expect(res.status).toBe(404);
  });
});
