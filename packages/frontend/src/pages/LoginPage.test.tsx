import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "./LoginPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <LoginPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("LoginPage", () => {
  it("renders the email and password inputs", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderPage();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("renders the Sign in button", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderPage();
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows an error message on failed login", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), { status: 401 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument();
    });
  });

  it("shows an error message when the network fails", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error("Network error"));
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pass" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => {
      expect(screen.getByText(/could not connect/i)).toBeInTheDocument();
    });
  });

  it("stores the token in localStorage on successful login", async () => {
    const token = "jwt.token.here";
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true, data: { token } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const originalLocation = window.location;
    Object.defineProperty(window, "location", { writable: true, value: { href: "" } });

    renderPage();
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pass" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(localStorage.getItem("token")).toBe(token);
    });

    Object.defineProperty(window, "location", { writable: true, value: originalLocation });
  });
});
