import { describe, it, expect, vi, beforeEach } from "vitest";
import { handlePendingInvites } from "./pendingInvites";

const user = { userId: "user-1", email: "a@example.com" } as unknown as Parameters<typeof handlePendingInvites>[2];

function makeEnv() {
  const firsts: unknown[] = [];
  const runs: unknown[] = [];
  const batches: unknown[] = [];
  const first = vi.fn(() => Promise.resolve(firsts.shift() ?? null));
  const all = vi.fn(() => Promise.resolve({ results: [] }));
  const run = vi.fn(() => Promise.resolve(runs.shift() ?? { meta: { changes: 1 } }));
  const bind = vi.fn(() => ({ first, all, run }));
  const prepare = vi.fn((_sql: string) => ({ bind }));
  const batch = vi.fn(() => Promise.resolve(batches.shift() ?? []));
  return {
    env: { DB: { prepare, batch } } as unknown as Parameters<typeof handlePendingInvites>[1],
    run,
    batch,
    prepare,
    queueFirst: (v: unknown) => firsts.push(v),
    queueBatch: (v: unknown) => batches.push(v),
  };
}

function call(env: Parameters<typeof handlePendingInvites>[1], method: string, path: string) {
  const url = new URL(`http://localhost${path}`);
  return handlePendingInvites(new Request(url.toString(), { method }), env, user, url);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("handlePendingInvites GET", () => {
  it("merges site + org invites, newest first", async () => {
    const { env, queueBatch } = makeEnv();
    queueBatch([
      { results: [{ id: "pm1", project_id: "p1", role: "editor", invited_by: "x", created_at: "2026-01-01", project_name: "Site", project_description: "d", inviter_name: "Inv" }] },
      { results: [{ id: "om1", organization_id: "o1", role: "admin", invited_by: "y", created_at: "2026-02-01", org_name: "Org", inviter_name: "Inv2" }] },
    ]);
    const res = await call(env, "GET", "/pending-invites");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<{ id: string; type: string }> };
    expect(json.data).toHaveLength(2);
    // org invite is newer (2026-02) → sorted first
    expect(json.data[0].type).toBe("org");
    expect(json.data[1].type).toBe("site");
  });
});

describe("handlePendingInvites POST accept", () => {
  it("404s when the invite isn't the caller's pending one", async () => {
    const { env } = makeEnv(); // first() → null
    const res = await call(env, "POST", "/pending-invites/inv1/accept");
    expect(res.status).toBe(404);
  });

  it("accepts a pending site invite", async () => {
    const { env, queueFirst, run, prepare } = makeEnv();
    queueFirst({ id: "inv1" });
    const res = await call(env, "POST", "/pending-invites/inv1/accept");
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalled();
    const json = (await res.json()) as { data: { accepted: boolean } };
    expect(json.data.accepted).toBe(true);
    // A site accept must target project_members, never the org table.
    const sqls = prepare.mock.calls.map(c => c[0] as string);
    expect(sqls.some(s => s.includes("project_members"))).toBe(true);
    expect(sqls.some(s => s.includes("organization_members"))).toBe(false);
  });

  it("accepts a pending org invite (?type=org)", async () => {
    const { env, queueFirst, run, prepare } = makeEnv();
    queueFirst({ id: "inv1" });
    const res = await call(env, "POST", "/pending-invites/inv1/accept?type=org");
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalled();
    // ?type=org must route the accept to organization_members, never project_members.
    const sqls = prepare.mock.calls.map(c => c[0] as string);
    expect(sqls.some(s => s.includes("organization_members"))).toBe(true);
    expect(sqls.some(s => s.includes("project_members"))).toBe(false);
  });
});

describe("handlePendingInvites DELETE decline", () => {
  it("404s when there's no matching pending invite", async () => {
    const { env } = makeEnv(); // first() → null
    const res = await call(env, "DELETE", "/pending-invites/inv1");
    expect(res.status).toBe(404);
  });

  it("declines a pending invite", async () => {
    const { env, queueFirst, run } = makeEnv();
    queueFirst({ id: "inv1" });
    const res = await call(env, "DELETE", "/pending-invites/inv1");
    expect(res.status).toBe(200);
    expect(run).toHaveBeenCalled();
    const json = (await res.json()) as { data: { declined: boolean } };
    expect(json.data.declined).toBe(true);
  });
});

describe("handlePendingInvites routing", () => {
  it("404s on an unsupported method/path", async () => {
    const { env } = makeEnv();
    const res = await call(env, "GET", "/pending-invites/inv1");
    expect(res.status).toBe(404);
  });

  it("404s on a wrong method for the collection", async () => {
    const { env } = makeEnv();
    const res = await call(env, "PUT", "/pending-invites");
    expect(res.status).toBe(404);
  });
});
