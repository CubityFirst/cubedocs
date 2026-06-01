import { describe, it, expect, vi } from "vitest";
import { fileServeHeaders, folderInProject, wouldCreateFolderCycle } from "./lib";

// Minimal D1-ish stub: prepare().bind().first() resolves to the queued result.
function dbReturning(result: unknown) {
  const first = vi.fn().mockResolvedValue(result);
  const bind = vi.fn().mockReturnValue({ first });
  const prepare = vi.fn().mockReturnValue({ bind });
  return { db: { prepare } as unknown as D1Database, prepare, bind, first };
}

describe("folderInProject (cross-project relocation guard)", () => {
  it("treats null/empty target as the project root (always valid, no query)", async () => {
    const { db, prepare } = dbReturning(null);
    expect(await folderInProject(db, null, "proj-1")).toBe(true);
    expect(await folderInProject(db, undefined, "proj-1")).toBe(true);
    expect(await folderInProject(db, "", "proj-1")).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
  });

  it("returns true only when a row matches the folder+project", async () => {
    const { db, bind } = dbReturning({ ok: 1 });
    expect(await folderInProject(db, "folder-A", "proj-1", "docs")).toBe(true);
    expect(bind).toHaveBeenCalledWith("folder-A", "proj-1", "docs");
  });

  it("returns false when the folder belongs to another project (no row)", async () => {
    const { db } = dbReturning(null);
    expect(await folderInProject(db, "folder-in-proj-2", "proj-1")).toBe(false);
  });
});

describe("wouldCreateFolderCycle", () => {
  it("true when the folder appears in the new parent's ancestor chain", async () => {
    const { db } = dbReturning({ ok: 1 });
    expect(await wouldCreateFolderCycle(db, "F", "descendant-of-F")).toBe(true);
  });
  it("false when no cycle (no row)", async () => {
    const { db } = dbReturning(null);
    expect(await wouldCreateFolderCycle(db, "F", "unrelated")).toBe(false);
  });
});

describe("fileServeHeaders (stored-XSS defence)", () => {
  it("serves real images inline with their declared type", () => {
    const h = fileServeHeaders("image/png", "cat.png");
    expect(h["Content-Type"]).toBe("image/png");
    expect(h["Content-Disposition"]).toBe('inline; filename="cat.png"');
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("forces HTML uploads to download as octet-stream (no inline execution)", () => {
    const h = fileServeHeaders("text/html", "evil.html");
    expect(h["Content-Type"]).toBe("application/octet-stream");
    expect(h["Content-Disposition"]).toBe('attachment; filename="evil.html"');
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("forces SVG (script-capable) to download", () => {
    const h = fileServeHeaders("image/svg+xml", "x.svg");
    expect(h["Content-Type"]).toBe("application/octet-stream");
    expect(h["Content-Disposition"]).toContain("attachment");
  });

  it("ignores parameters/case when matching the allowlist", () => {
    const h = fileServeHeaders("IMAGE/PNG; charset=binary", "a.png");
    expect(h["Content-Disposition"]).toContain("inline");
    // declared type is preserved verbatim for the browser
    expect(h["Content-Type"]).toBe("IMAGE/PNG; charset=binary");
  });

  it("treats html disguised with an image extension as still html → download", () => {
    // mime is the source of truth, not the name
    const h = fileServeHeaders("text/html", "notreally.png");
    expect(h["Content-Disposition"]).toContain("attachment");
  });

  it("strips quotes/control chars from the filename (header-injection defence)", () => {
    const h = fileServeHeaders("image/png", 'a".png\r\nSet-Cookie: x=1');
    expect(h["Content-Disposition"]).not.toContain('"a"');
    expect(h["Content-Disposition"]).not.toContain("\r");
    expect(h["Content-Disposition"]).not.toContain("\n");
  });

  it("defaults empty/unknown mime to download", () => {
    const h = fileServeHeaders(null, "x");
    expect(h["Content-Type"]).toBe("application/octet-stream");
    expect(h["Content-Disposition"]).toContain("attachment");
  });
});
