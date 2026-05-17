import { describe, it, expect } from "vitest";
import { writeAdminAudit } from "./audit";
import type { Env } from "./index";
import type { AdminSession } from "./auth";

function fakeDb() {
  const calls: { sql: string; args: unknown[] }[] = [];
  const AUTH_DB = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            run: async () => {
              calls.push({ sql, args });
            },
          };
        },
      };
    },
  };
  return { env: { AUTH_DB } as unknown as Env, calls };
}

const ACTOR: AdminSession = {
  userId: "admin-1",
  email: "admin@example.com",
  expiresAt: Date.now() + 1000,
  isAdmin: true,
};

describe("writeAdminAudit", () => {
  it("inserts an actor-attributed row with serialized detail", async () => {
    const { env, calls } = fakeDb();
    await writeAdminAudit(env, ACTOR, "user.ink.grant", "user", "u-9", { expiresAt: null });

    expect(calls).toHaveLength(1);
    expect(calls[0].sql).toContain("INSERT INTO admin_audit_log");
    const [id, actorId, actorEmail, action, targetType, targetId, detail] = calls[0].args;
    expect(typeof id).toBe("string");
    expect(actorId).toBe("admin-1");
    expect(actorEmail).toBe("admin@example.com");
    expect(action).toBe("user.ink.grant");
    expect(targetType).toBe("user");
    expect(targetId).toBe("u-9");
    expect(detail).toBe(JSON.stringify({ expiresAt: null }));
  });

  it("stores NULL detail when none is provided", async () => {
    const { env, calls } = fakeDb();
    await writeAdminAudit(env, ACTOR, "user.avatar.delete", "user", "u-9");
    expect(calls[0].args[6]).toBeNull();
  });
});
