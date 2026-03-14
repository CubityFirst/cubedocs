import { describe, it, expect } from "vitest";
import { errorResponse, okResponse, Errors } from "./errors";

describe("errorResponse", () => {
  it("returns ok: false with the error message and correct status", async () => {
    const res = errorResponse(Errors.NOT_FOUND);
    expect(res.status).toBe(404);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("Not found");
    expect(body.status).toBe(404);
  });

  it("sets 401 for UNAUTHORIZED", () => {
    expect(errorResponse(Errors.UNAUTHORIZED).status).toBe(401);
  });

  it("sets 403 for FORBIDDEN", () => {
    expect(errorResponse(Errors.FORBIDDEN).status).toBe(403);
  });

  it("sets 409 for CONFLICT", () => {
    expect(errorResponse(Errors.CONFLICT).status).toBe(409);
  });

  it("sets 400 for BAD_REQUEST", () => {
    expect(errorResponse(Errors.BAD_REQUEST).status).toBe(400);
  });

  it("sets 500 for INTERNAL", () => {
    expect(errorResponse(Errors.INTERNAL).status).toBe(500);
  });

  it("sets Content-Type to application/json", () => {
    const res = errorResponse(Errors.BAD_REQUEST);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});

describe("okResponse", () => {
  it("returns ok: true with data and status 200 by default", async () => {
    const res = okResponse({ id: "1", name: "test" });
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.data).toEqual({ id: "1", name: "test" });
  });

  it("accepts a custom status code", async () => {
    const res = okResponse({ created: true }, 201);
    expect(res.status).toBe(201);
  });

  it("wraps null data correctly", async () => {
    const res = okResponse(null);
    const body = await res.json() as Record<string, unknown>;
    expect(body.data).toBeNull();
  });

  it("wraps array data correctly", async () => {
    const res = okResponse([1, 2, 3]);
    const body = await res.json() as Record<string, unknown>;
    expect(body.data).toEqual([1, 2, 3]);
  });

  it("sets Content-Type to application/json", () => {
    const res = okResponse({});
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });
});
