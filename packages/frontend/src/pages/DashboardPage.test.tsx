import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>,
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    localStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("renders the 'Your Sites' heading", () => {
    renderPage();
    expect(screen.getByText("Your Sites")).toBeInTheDocument();
  });

  it("renders the empty state when there are no projects", () => {
    renderPage();
    expect(screen.getByText(/no sites yet/i)).toBeInTheDocument();
  });

  it("does not fetch if there is no token in localStorage", () => {
    renderPage();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("fetches projects when a token is present", async () => {
    localStorage.setItem("token", "mytoken");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: [] }), { status: 200 }),
    );
    renderPage();
    await waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        "/api/projects",
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer mytoken" }) }),
      );
    });
  });

  it("renders project cards when projects are returned", async () => {
    localStorage.setItem("token", "mytoken");
    const projects = [
      { id: "p1", name: "My Docs", slug: "my-docs", doc_count: 3 },
      { id: "p2", name: "API Docs", slug: "api-docs", doc_count: 1 },
    ];
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: projects }), { status: 200 }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("My Docs")).toBeInTheDocument();
      expect(screen.getByText("API Docs")).toBeInTheDocument();
    });
  });

  it("shows the correct doc count badge", async () => {
    localStorage.setItem("token", "mytoken");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: [{ id: "p1", name: "Docs", slug: "docs", doc_count: 5 }] }), { status: 200 }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("5 docs")).toBeInTheDocument();
    });
  });

  it("uses singular 'doc' for doc_count of 1", async () => {
    localStorage.setItem("token", "mytoken");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: [{ id: "p1", name: "Docs", slug: "docs", doc_count: 1 }] }), { status: 200 }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText("1 doc")).toBeInTheDocument();
    });
  });
});
