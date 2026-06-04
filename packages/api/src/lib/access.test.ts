import { describe, it, expect, vi } from "vitest";
import { resolveAccess, resolveRole } from "./access";

// Minimal D1-ish stub: prepare().bind().first() resolves to the queued row.
// resolveAccess issues exactly one prepare().bind(userId,userId,projectId).first().
function dbReturning(row: unknown) {
  const first = vi.fn().mockResolvedValue(row);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { db: { prepare } as unknown as D1Database, prepare, bind, first };
}

const row = (
  project_role: string | null, org_role: string | null,
  project_name: string | null = project_role && "DirectName",
  org_name: string | null = org_role && "OrgName",
) => ({ project_role, project_name, org_role, org_name });

describe("resolveAccess (effective per-site role = max of direct vs org)", () => {
  it("direct membership only → project role, source 'project'", async () => {
    const { db, bind } = dbReturning(row("editor", null));
    const a = await resolveAccess(db, "proj-1", "user-1");
    expect(a).toMatchObject({ role: "editor", source: "project", projectRole: "editor", orgRole: null });
    // userId is bound twice (both joins), then projectId.
    expect(bind).toHaveBeenCalledWith("user-1", "user-1", "proj-1");
  });

  it("org membership only → org role, source 'org'", async () => {
    const { db } = dbReturning(row(null, "admin"));
    const a = await resolveAccess(db, "proj-1", "user-1");
    expect(a).toMatchObject({ role: "admin", source: "org", projectRole: null, orgRole: "admin" });
  });

  it("both roles → the higher-ranked one wins (org higher)", async () => {
    const { db } = dbReturning(row("viewer", "admin"));
    const a = await resolveAccess(db, "proj-1", "user-1");
    expect(a).toMatchObject({ role: "admin", source: "org" });
  });

  it("both roles → the higher-ranked one wins (direct higher)", async () => {
    const { db } = dbReturning(row("owner", "editor"));
    const a = await resolveAccess(db, "proj-1", "user-1");
    expect(a).toMatchObject({ role: "owner", source: "project" });
  });

  it("equal rank → resolves to org (identical effect)", async () => {
    const { db } = dbReturning(row("admin", "admin"));
    const a = await resolveAccess(db, "proj-1", "user-1");
    expect(a).toMatchObject({ role: "admin", source: "org" });
  });

  it("LOAD-BEARING: direct 'limited' + org 'viewer' → elevated to 'viewer'", async () => {
    const { db } = dbReturning(row("limited", "viewer"));
    const a = await resolveAccess(db, "proj-1", "user-1");
    // Org trickle-down lifts the user out of the per-doc-share 'limited' gate.
    expect(a?.role).toBe("viewer");
    expect(a?.source).toBe("org");
  });

  it("direct 'limited' with no org access stays 'limited'", async () => {
    const { db } = dbReturning(row("limited", null));
    const a = await resolveAccess(db, "proj-1", "user-1");
    expect(a).toMatchObject({ role: "limited", source: "project" });
  });

  it("project does not exist (no row) → null", async () => {
    const { db } = dbReturning(null);
    expect(await resolveAccess(db, "missing", "user-1")).toBeNull();
  });

  it("project exists but no membership either way → null", async () => {
    const { db } = dbReturning(row(null, null));
    expect(await resolveAccess(db, "proj-1", "stranger")).toBeNull();
  });

  it("name falls back to userId when the winning side's name is null", async () => {
    const { db } = dbReturning(row(null, "viewer", null, null));
    const a = await resolveAccess(db, "proj-1", "user-1");
    expect(a?.name).toBe("user-1");
  });

  it("name comes from the winning membership row", async () => {
    const { db } = dbReturning(row("viewer", "admin", "Direct", "Org"));
    const a = await resolveAccess(db, "proj-1", "user-1");
    expect(a?.name).toBe("Org"); // org wins (admin > viewer)
  });
});

describe("resolveRole (role-only convenience)", () => {
  it("returns the effective role string", async () => {
    const { db } = dbReturning(row("viewer", "editor"));
    expect(await resolveRole(db, "proj-1", "user-1")).toBe("editor");
  });
  it("returns null when there is no access", async () => {
    const { db } = dbReturning(null);
    expect(await resolveRole(db, "proj-1", "user-1")).toBeNull();
  });
});
