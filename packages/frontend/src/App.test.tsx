import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { App } from "./App";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("App routing", () => {
  it("renders the 404 page for an unknown route", () => {
    renderAt("/this-does-not-exist");
    expect(screen.getByText("404")).toBeInTheDocument();
  });

  it("renders the login page at /login", () => {
    renderAt("/login");
    expect(screen.getByText("Sign in")).toBeInTheDocument();
  });

  it("renders the register page at /register", () => {
    renderAt("/register");
    expect(screen.getByText("Create an account")).toBeInTheDocument();
  });
});
