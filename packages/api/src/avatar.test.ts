import { describe, it, expect } from "vitest";
import { parseVariant, resolveAvatar, deleteAllAvatarVariants, avatarKey } from "./avatar";

// Minimal in-memory R2 stand-in. Tracks puts/deletes so we can assert the
// one-time legacy migration writes -dark and removes the legacy object.
interface Stored { body: ArrayBuffer; contentType: string }

class FakeR2 {
  store = new Map<string, Stored>();
  puts: string[] = [];
  deletes: string[] = [];

  constructor(seed: Record<string, [string, string]> = {}) {
    for (const [k, [text, ct]] of Object.entries(seed)) {
      this.store.set(k, { body: enc(text), contentType: ct });
    }
  }

  async get(key: string) {
    const e = this.store.get(key);
    if (!e) return null;
    return { arrayBuffer: async () => e.body, httpMetadata: { contentType: e.contentType } };
  }

  async put(key: string, body: ArrayBuffer, opts?: { httpMetadata?: { contentType?: string } }) {
    this.puts.push(key);
    this.store.set(key, { body, contentType: opts?.httpMetadata?.contentType ?? "application/octet-stream" });
  }

  async delete(keys: string | string[]) {
    for (const k of Array.isArray(keys) ? keys : [keys]) {
      this.deletes.push(k);
      this.store.delete(k);
    }
  }
}

function enc(s: string): ArrayBuffer {
  return new TextEncoder().encode(s).buffer as ArrayBuffer;
}
function dec(b: ArrayBuffer): string {
  return new TextDecoder().decode(b);
}
function mk(seed?: Record<string, [string, string]>) {
  const fake = new FakeR2(seed);
  return { fake, bucket: fake as unknown as R2Bucket };
}

describe("parseVariant", () => {
  it("maps only the literal 'light' to light; everything else is dark", () => {
    expect(parseVariant("light")).toBe("light");
    expect(parseVariant("dark")).toBe("dark");
    expect(parseVariant(null)).toBe("dark");
    expect(parseVariant(undefined)).toBe("dark");
    expect(parseVariant("LIGHT")).toBe("dark");
    expect(parseVariant("")).toBe("dark");
  });
});

describe("resolveAvatar", () => {
  it("returns the dark object for a dark request", async () => {
    const { fake, bucket } = mk({ "avatars/u-dark": ["DARK", "image/webp"] });
    const r = await resolveAvatar(bucket, "u", "dark");
    expect(r && dec(r.body)).toBe("DARK");
    expect(r?.contentType).toBe("image/webp");
    expect(fake.puts).toEqual([]);
    expect(fake.deletes).toEqual([]);
  });

  it("returns the light object for a light request", async () => {
    const { bucket } = mk({ "avatars/u-light": ["LIGHT", "image/png"] });
    const r = await resolveAvatar(bucket, "u", "light");
    expect(r && dec(r.body)).toBe("LIGHT");
    expect(r?.contentType).toBe("image/png");
  });

  it("falls back light -> dark when no light variant exists", async () => {
    const { bucket } = mk({ "avatars/u-dark": ["DARK", "image/webp"] });
    const r = await resolveAvatar(bucket, "u", "light");
    expect(r && dec(r.body)).toBe("DARK");
  });

  it("falls back dark -> light when no dark variant exists (bidirectional)", async () => {
    const { fake, bucket } = mk({ "avatars/u-light": ["LIGHT", "image/webp"] });
    const r = await resolveAvatar(bucket, "u", "dark");
    expect(r && dec(r.body)).toBe("LIGHT");
    // No migration writes when only a light variant is present.
    expect(fake.puts).toEqual([]);
  });

  it("migrates a legacy object to -dark and deletes the legacy key (dark request)", async () => {
    const { fake, bucket } = mk({ "avatars/u": ["LEGACY", "image/gif"] });
    const r = await resolveAvatar(bucket, "u", "dark");
    expect(r && dec(r.body)).toBe("LEGACY");
    expect(r?.contentType).toBe("image/gif");
    expect(fake.puts).toContain("avatars/u-dark");
    expect(fake.deletes).toContain("avatars/u");
    expect(fake.store.has("avatars/u")).toBe(false);
    const migrated = fake.store.get("avatars/u-dark");
    expect(migrated && dec(migrated.body)).toBe("LEGACY");
    expect(migrated?.contentType).toBe("image/gif");
  });

  it("migrates the legacy object even when the request is for light", async () => {
    const { fake, bucket } = mk({ "avatars/u": ["LEGACY", "image/jpeg"] });
    const r = await resolveAvatar(bucket, "u", "light");
    expect(r && dec(r.body)).toBe("LEGACY");
    expect(fake.store.has("avatars/u-dark")).toBe(true);
    expect(fake.store.has("avatars/u")).toBe(false);
  });

  it("is idempotent: a second resolve serves -dark and does not re-migrate", async () => {
    const { fake, bucket } = mk({ "avatars/u": ["LEGACY", "image/gif"] });
    await resolveAvatar(bucket, "u", "dark");
    fake.puts.length = 0;
    fake.deletes.length = 0;
    const r = await resolveAvatar(bucket, "u", "dark");
    expect(r && dec(r.body)).toBe("LEGACY");
    expect(fake.puts).toEqual([]);
    expect(fake.deletes).toEqual([]);
  });

  it("returns null when the user has no avatar at all", async () => {
    const { bucket } = mk();
    expect(await resolveAvatar(bucket, "u", "dark")).toBeNull();
    expect(await resolveAvatar(bucket, "u", "light")).toBeNull();
  });
});

describe("deleteAllAvatarVariants", () => {
  it("removes both variants and any legacy object", async () => {
    const { fake, bucket } = mk({
      "avatars/u-dark": ["D", "image/webp"],
      "avatars/u-light": ["L", "image/webp"],
      "avatars/u": ["LEG", "image/gif"],
    });
    await deleteAllAvatarVariants(bucket, "u");
    expect(fake.store.size).toBe(0);
    expect(fake.deletes).toEqual(
      expect.arrayContaining([avatarKey("u", "dark"), avatarKey("u", "light"), "avatars/u"]),
    );
  });
});
