import { describe, it, expect } from "vitest";
import { parseFrontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("returns empty object when no frontmatter", () => {
    expect(parseFrontmatter("# Hello")).toEqual({});
  });

  it("returns empty object for empty string", () => {
    expect(parseFrontmatter("")).toEqual({});
  });

  it("parses sidebar_position", () => {
    expect(parseFrontmatter("---\nsidebar_position: 3\n---\n")).toEqual({ sidebar_position: 3 });
  });

  it("ignores non-numeric sidebar_position", () => {
    expect(parseFrontmatter("---\nsidebar_position: abc\n---\n")).toEqual({});
  });

  it("parses unquoted title", () => {
    expect(parseFrontmatter("---\ntitle: My Doc\n---\n")).toEqual({ title: "My Doc" });
  });

  it("parses single-quoted title, stripping quotes", () => {
    expect(parseFrontmatter("---\ntitle: 'My Doc'\n---\n")).toEqual({ title: "My Doc" });
  });

  it("parses double-quoted title, stripping quotes", () => {
    expect(parseFrontmatter("---\ntitle: \"My Doc\"\n---\n")).toEqual({ title: "My Doc" });
  });

  it("parses hide_title true", () => {
    expect(parseFrontmatter("---\nhide_title: true\n---\n")).toEqual({ hide_title: true });
  });

  it("parses hide_title false", () => {
    expect(parseFrontmatter("---\nhide_title: false\n---\n")).toEqual({ hide_title: false });
  });

  it("parses inline array tags", () => {
    expect(parseFrontmatter("---\ntags: [foo, bar]\n---\n")).toEqual({ tags: ["foo", "bar"] });
  });

  it("strips # prefix from inline tags", () => {
    expect(parseFrontmatter("---\ntags: [#foo, #bar]\n---\n")).toEqual({ tags: ["foo", "bar"] });
  });

  it("strips quotes from inline tags", () => {
    expect(parseFrontmatter("---\ntags: ['alpha', \"beta\"]\n---\n")).toEqual({ tags: ["alpha", "beta"] });
  });

  it("parses block list tags", () => {
    const md = "---\ntags:\n  - foo\n  - bar\n---\n";
    expect(parseFrontmatter(md)).toEqual({ tags: ["foo", "bar"] });
  });

  it("strips # prefix from block list tags", () => {
    const md = "---\ntags:\n  - '#foo'\n  - '#bar'\n---\n";
    expect(parseFrontmatter(md)).toEqual({ tags: ["foo", "bar"] });
  });

  it("parses single inline tag as a one-element array", () => {
    expect(parseFrontmatter("---\ntags: foo\n---\n")).toEqual({ tags: ["foo"] });
  });

  it("handles CRLF line endings", () => {
    expect(parseFrontmatter("---\r\nsidebar_position: 2\r\n---\r\n")).toEqual({ sidebar_position: 2 });
  });

  it("ignores body content after closing ---", () => {
    const result = parseFrontmatter("---\ntitle: Hello\n---\nSome content here");
    expect(result).toEqual({ title: "Hello" });
  });

  it("parses multiple fields together", () => {
    const md = "---\ntitle: My Doc\nsidebar_position: 1\nhide_title: true\ntags: [a, b]\ndescription: A summary.\nimage: /api/files/abc/content\n---\n";
    expect(parseFrontmatter(md)).toEqual({
      title: "My Doc",
      sidebar_position: 1,
      hide_title: true,
      tags: ["a", "b"],
      description: "A summary.",
      image: "/api/files/abc/content",
    });
  });

  it("parses unquoted description", () => {
    expect(parseFrontmatter("---\ndescription: A short summary.\n---\n")).toEqual({ description: "A short summary." });
  });

  it("parses double-quoted description, stripping quotes", () => {
    expect(parseFrontmatter("---\ndescription: \"With: a colon\"\n---\n")).toEqual({ description: "With: a colon" });
  });

  it("ignores empty description", () => {
    expect(parseFrontmatter("---\ndescription:\n---\n")).toEqual({});
  });

  it("parses image with file path", () => {
    expect(parseFrontmatter("---\nimage: /api/files/abc123/content\n---\n")).toEqual({ image: "/api/files/abc123/content" });
  });

  it("parses image with quoted absolute URL", () => {
    expect(parseFrontmatter("---\nimage: \"https://example.com/cover.png\"\n---\n")).toEqual({ image: "https://example.com/cover.png" });
  });

  it("ignores empty image", () => {
    expect(parseFrontmatter("---\nimage:\n---\n")).toEqual({});
  });

  it("ignores unknown keys", () => {
    expect(parseFrontmatter("---\nsome_random_key: value\n---\n")).toEqual({});
  });
});
