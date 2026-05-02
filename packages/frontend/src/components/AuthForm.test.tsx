import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthForm } from "./AuthForm";

function renderForm(overrides?: Partial<React.ComponentProps<typeof AuthForm>>) {
  const defaults = {
    title: "Annex",
    subtitle: "Sign in to your account",
    submitLabel: "Sign in",
    onSubmit: vi.fn(),
    children: <input data-testid="child-input" />,
    footer: <span>Footer content</span>,
  };
  return render(<AuthForm {...defaults} {...overrides} />);
}

describe("AuthForm", () => {
  it("renders the title", () => {
    renderForm();
    expect(screen.getByText("Annex")).toBeInTheDocument();
  });

  it("renders the subtitle", () => {
    renderForm();
    expect(screen.getByText("Sign in to your account")).toBeInTheDocument();
  });

  it("renders the submit button with the submitLabel", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });

  it("renders children inside the form", () => {
    renderForm();
    expect(screen.getByTestId("child-input")).toBeInTheDocument();
  });

  it("renders the footer content", () => {
    renderForm();
    expect(screen.getByText("Footer content")).toBeInTheDocument();
  });

  it("does not render an error alert when error is null", () => {
    renderForm({ error: null });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders the error message when error is provided", () => {
    renderForm({ error: "Invalid credentials" });
    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
  });

  it("disables the submit button when loading is true", () => {
    renderForm({ loading: true });
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows loading indicator in button label when loading", () => {
    renderForm({ loading: true, submitLabel: "Sign in" });
    expect(screen.getByRole("button")).toHaveTextContent("Sign in…");
  });

  it("calls onSubmit when the form is submitted", () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    renderForm({ onSubmit });
    fireEvent.submit(screen.getByRole("button").closest("form")!);
    expect(onSubmit).toHaveBeenCalledOnce();
  });
});
