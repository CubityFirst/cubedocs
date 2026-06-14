import { describe, it, expect } from "vitest";
import { parseJuxtapose } from "./juxtapose";

describe("parseJuxtapose", () => {
  it("parses the two required image URLs with defaults", () => {
    const cfg = parseJuxtapose("before: a.jpg\nafter: b.jpg");
    expect(cfg).toEqual({
      before: "a.jpg",
      after: "b.jpg",
      beforeLabel: undefined,
      afterLabel: undefined,
      orientation: "horizontal",
      startAt: 50,
      handle: "arrows",
      accent: undefined,
    });
  });

  it("parses handle style (default arrows, bar opt-in)", () => {
    expect(parseJuxtapose("before: a\nafter: b")?.handle).toBe("arrows");
    expect(parseJuxtapose("before: a\nafter: b\nhandle: bar")?.handle).toBe("bar");
    expect(parseJuxtapose("before: a\nafter: b\nhandle: arrows")?.handle).toBe("arrows");
    expect(parseJuxtapose("before: a\nafter: b\nhandle: nonsense")?.handle).toBe("arrows");
  });

  it("parses accent: default (absent) / theme keyword / custom hex", () => {
    // Absent → undefined (the original white look is the rendering default).
    expect(parseJuxtapose("before: a\nafter: b")?.accent).toBeUndefined();
    // Theme keyword.
    expect(parseJuxtapose("before: a\nafter: b\naccent: theme")?.accent).toBe("theme");
    expect(parseJuxtapose("before: a\nafter: b\naccent: accent")?.accent).toBe("theme");
    // Custom hex (normalised to lowercase).
    expect(parseJuxtapose("before: a\nafter: b\naccent: #3B82F6")?.accent).toBe("#3b82f6");
    expect(parseJuxtapose("before: a\nafter: b\naccent: #abc")?.accent).toBe("#abc");
    // Invalid values are ignored → falls back to the white default.
    expect(parseJuxtapose("before: a\nafter: b\naccent: blue")?.accent).toBeUndefined();
    expect(parseJuxtapose("before: a\nafter: b\naccent: #12")?.accent).toBeUndefined();
  });

  it("parses optional quoted labels", () => {
    const cfg = parseJuxtapose('before: a.jpg "2019"\nafter: b.jpg "2024"');
    expect(cfg?.beforeLabel).toBe("2019");
    expect(cfg?.afterLabel).toBe("2024");
  });

  it("reads vertical orientation (any value starting with v)", () => {
    expect(parseJuxtapose("before: a\nafter: b\norientation: vertical")?.orientation).toBe("vertical");
    expect(parseJuxtapose("before: a\nafter: b\norientation: v")?.orientation).toBe("vertical");
    expect(parseJuxtapose("before: a\nafter: b\norientation: horizontal")?.orientation).toBe("horizontal");
  });

  it("clamps start to 0–100", () => {
    expect(parseJuxtapose("before: a\nafter: b\nstart: 30")?.startAt).toBe(30);
    expect(parseJuxtapose("before: a\nafter: b\nstart: -10")?.startAt).toBe(0);
    expect(parseJuxtapose("before: a\nafter: b\nstart: 250")?.startAt).toBe(100);
  });

  it("ignores blank lines, unknown keys and bad casing", () => {
    const cfg = parseJuxtapose("\nBEFORE: a.jpg\n\ncolor: red\nAfter:   b.jpg  \n");
    expect(cfg?.before).toBe("a.jpg");
    expect(cfg?.after).toBe("b.jpg");
  });

  it("returns null when either image is missing", () => {
    expect(parseJuxtapose("before: a.jpg")).toBeNull();
    expect(parseJuxtapose("after: b.jpg")).toBeNull();
    expect(parseJuxtapose("orientation: vertical")).toBeNull();
    expect(parseJuxtapose("")).toBeNull();
  });
});
