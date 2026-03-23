import { describe, expect, it, vi } from "vitest";
import { strFromU8, unzipSync } from "fflate";
import worker from "../index";

type QueryResult = Record<string, unknown> | null;

function createPreparedStatement(
  sql: string,
  resolver: {
    first?: (sql: string, params: unknown[]) => QueryResult | Promise<QueryResult>;
    all?: (sql: string, params: unknown[]) => { results: QueryResult[] } | Promise<{ results: QueryResult[] }>;
    run?: (sql: string, params: unknown[]) => unknown | Promise<unknown>;
  },
) {
  const stmt = {
    sql,
    params: [] as unknown[],
    bind: vi.fn((...params: unknown[]) => {
      stmt.params = params;
      return stmt;
    }),
    first: vi.fn(() => resolver.first?.(sql, stmt.params) ?? null),
    all: vi.fn(() => resolver.all?.(sql, stmt.params) ?? { results: [] }),
    run: vi.fn(() => resolver.run?.(sql, stmt.params) ?? { success: true }),
  };
  return stmt;
}

function makeEnv(options?: {
  authFirst?: (sql: string, params: unknown[]) => QueryResult | Promise<QueryResult>;
  authAll?: (sql: string, params: unknown[]) => { results: QueryResult[] } | Promise<{ results: QueryResult[] }>;
  authRun?: (sql: string, params: unknown[]) => unknown | Promise<unknown>;
  dbAll?: (sql: string, params: unknown[]) => { results: QueryResult[] } | Promise<{ results: QueryResult[] }>;
}) {
  const authPrepare = vi.fn((sql: string) => createPreparedStatement(sql, {
    first: options?.authFirst,
    all: options?.authAll,
    run: options?.authRun,
  }));
  const batch = vi.fn().mockResolvedValue([]);
  const dbPrepare = vi.fn((sql: string) => createPreparedStatement(sql, {
    all: options?.dbAll,
  }));

  return {
    env: {
      AUTH_DB: {
        prepare: authPrepare,
        batch,
      } as unknown as D1Database,
      DB: {
        prepare: dbPrepare,
      } as unknown as D1Database,
      ASSETS: {} as R2Bucket,
      SITE_ASSETS: { fetch: vi.fn() } as unknown as Fetcher,
    },
    authPrepare,
    batch,
    dbPrepare,
  };
}

describe("admin users moderation routes", () => {
  it("rejects disable without a reason", async () => {
    const { env, batch } = makeEnv();
    const req = new Request("https://admin/api/users/u1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moderation: -1, reason: "   " }),
    });

    const res = await worker.fetch(req, env);

    expect(res.status).toBe(400);
    expect(batch).not.toHaveBeenCalled();
  });

  it("rejects suspended-until timestamps in the past", async () => {
    const { env, batch } = makeEnv();
    const pastTimestamp = Math.floor(Date.now() / 1000) - 60;
    const req = new Request("https://admin/api/users/u1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moderation: pastTimestamp, reason: "Temporary suspension" }),
    });

    const res = await worker.fetch(req, env);

    expect(res.status).toBe(400);
    expect(batch).not.toHaveBeenCalled();
  });

  it("updates moderation and records a moderation event", async () => {
    const { env, batch } = makeEnv();
    const req = new Request("https://admin/api/users/u1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ moderation: -1, reason: "Chargeback abuse" }),
    });

    const res = await worker.fetch(req, env);

    expect(res.status).toBe(200);
    expect(batch).toHaveBeenCalledTimes(1);
    const statements = batch.mock.calls[0]?.[0] as Array<{ sql: string; params: unknown[] }>;
    expect(statements).toHaveLength(2);
    expect(statements[0]?.sql).toContain("UPDATE users SET moderation");
    expect(statements[0]?.params).toEqual([-1, "u1"]);
    expect(statements[1]?.sql).toContain("INSERT INTO user_moderation_events");
    expect(statements[1]?.params[2]).toBe("disabled");
    expect(statements[1]?.params[3]).toBe(-1);
    expect(statements[1]?.params[4]).toBe("Chargeback abuse");
  });

  it("includes latest moderation fields in search results", async () => {
    const { env } = makeEnv({
      authAll: async (sql) => {
        if (sql.includes("FROM users u")) {
          return {
            results: [{
              id: "u1",
              email: "alice@example.com",
              name: "Alice",
              created_at: "2026-03-20T12:00:00.000Z",
              moderation: -1,
              force_password_change: 0,
              latest_moderation_action: "disabled",
              latest_moderation_reason: "Chargeback abuse",
              latest_moderation_created_at: "2026-03-23 09:10:00",
            }],
          };
        }
        return { results: [] };
      },
    });

    const res = await worker.fetch(new Request("https://admin/api/users/search?q=alice"), env);
    const body = await res.json() as { ok: boolean; data: Array<Record<string, unknown>> };

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.data[0]?.latest_moderation_action).toBe("disabled");
    expect(body.data[0]?.latest_moderation_reason).toBe("Chargeback abuse");
  });

  it("includes moderation.json in exports", async () => {
    const { env } = makeEnv({
      authFirst: async (sql) => {
        if (sql.includes("FROM users u")) {
          return {
            id: "u1",
            email: "alice@example.com",
            name: "Alice",
            created_at: "2026-03-20T12:00:00.000Z",
            moderation: -1,
            force_password_change: 0,
            latest_moderation_action: "disabled",
            latest_moderation_reason: "Chargeback abuse",
            latest_moderation_created_at: "2026-03-23 09:10:00",
          };
        }
        if (sql.includes("totp_secret IS NOT NULL")) {
          return { has_totp: 0 };
        }
        return null;
      },
      authAll: async (sql) => {
        if (sql.includes("FROM webauthn_credentials")) return { results: [] };
        if (sql.includes("FROM user_moderation_events")) {
          return {
            results: [{
              id: "m1",
              user_id: "u1",
              action: "disabled",
              moderation_value: -1,
              reason: "Chargeback abuse",
              created_at: "2026-03-23 09:10:00",
              actor_user_id: null,
              actor_email: null,
            }],
          };
        }
        return { results: [] };
      },
      dbAll: async () => ({ results: [] }),
    });

    const res = await worker.fetch(new Request("https://admin/api/users/u1/export"), env);
    const zipBuffer = new Uint8Array(await res.arrayBuffer());
    const files = unzipSync(zipBuffer);
    const moderationJson = JSON.parse(strFromU8(files["moderation.json"])) as {
      current_reason: string | null;
      history: Array<{ reason: string | null }>;
    };

    expect(res.status).toBe(200);
    expect(files["moderation.json"]).toBeDefined();
    expect(moderationJson.current_reason).toBe("Chargeback abuse");
    expect(moderationJson.history[0]?.reason).toBe("Chargeback abuse");
  });
});
