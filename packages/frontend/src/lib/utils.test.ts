import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("returns a single class unchanged", () => {
    expect(cn("foo")).toBe("foo");
  });

  it("joins multiple classes with a space", () => {
    expect(cn("foo", "bar", "baz")).toBe("foo bar baz");
  });

  it("filters out falsy values", () => {
    expect(cn("foo", false, null, undefined, "bar")).toBe("foo bar");
  });

  it("merges conflicting Tailwind classes (last wins)", () => {
    expect(cn("p-4", "p-8")).toBe("p-8");
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles conditional object syntax from clsx", () => {
    expect(cn({ foo: true, bar: false })).toBe("foo");
    expect(cn({ foo: true, bar: true })).toBe("foo bar");
  });

  it("handles array syntax from clsx", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("returns an empty string for no arguments", () => {
    expect(cn()).toBe("");
  });

  it("handles mixed conditionals and Tailwind deduplication", () => {
    const isActive = true;
    expect(cn("px-2 py-1", isActive && "bg-blue-500", "px-4")).toBe("py-1 bg-blue-500 px-4");
  });
});
