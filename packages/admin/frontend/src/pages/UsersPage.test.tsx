import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UsersPage } from "./UsersPage";
import type { AdminUser } from "@/lib/api";

const {
  searchUsers,
  updateUserModeration,
  forceUserPasswordChange,
  exportUserData,
  toastSuccess,
  toastError,
} = vi.hoisted(() => ({
  searchUsers: vi.fn(),
  updateUserModeration: vi.fn(),
  forceUserPasswordChange: vi.fn(),
  exportUserData: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  searchUsers,
  updateUserModeration,
  forceUserPasswordChange,
  exportUserData,
}));

vi.mock("sonner", () => ({
  toast: {
    success: toastSuccess,
    error: toastError,
  },
}));

const activeUser: AdminUser = {
  id: "u1",
  email: "alice@example.com",
  name: "Alice",
  created_at: "2026-03-20T12:00:00.000Z",
  moderation: 0,
  force_password_change: 0,
  latest_moderation_action: null,
  latest_moderation_reason: null,
  latest_moderation_created_at: null,
};

const suspendedUser: AdminUser = {
  ...activeUser,
  moderation: Math.floor(Date.now() / 1000) + 3600,
  latest_moderation_action: "suspended",
  latest_moderation_reason: "Abusive upload traffic",
  latest_moderation_created_at: "2026-03-23T09:10:00.000Z",
};

describe("UsersPage moderation reasons", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    searchUsers.mockReset();
    updateUserModeration.mockReset();
    forceUserPasswordChange.mockReset();
    exportUserData.mockReset();
    toastSuccess.mockReset();
    toastError.mockReset();
  });

  it("requires a moderation reason before disabling", async () => {
    searchUsers.mockResolvedValue([activeUser]);
    const user = userEvent.setup();

    render(<UsersPage />);

    await user.type(screen.getByPlaceholderText("Email or user ID..."), "alice");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByText("alice@example.com"));
    await user.click(screen.getByRole("button", { name: "Disable account" }));

    const disableButton = await screen.findByRole("button", { name: /^Disable$/ });
    expect(disableButton).toBeDisabled();

    await user.type(screen.getByLabelText("Moderation reason"), "Chargeback abuse");
    expect(disableButton).toBeEnabled();

    await user.click(disableButton);

    await waitFor(() => {
      expect(updateUserModeration).toHaveBeenCalledWith("u1", -1, "Chargeback abuse");
    });
  });

  it("keeps scheduled disable working with a required reason", async () => {
    searchUsers.mockResolvedValue([activeUser]);
    const user = userEvent.setup();

    render(<UsersPage />);

    await user.type(screen.getByPlaceholderText("Email or user ID..."), "alice");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByText("alice@example.com"));
    await user.click(screen.getByRole("button", { name: "Disable account" }));

    await user.click(screen.getByText("Until X time"));
    await user.type(screen.getByLabelText("Moderation reason"), "Cooling-off period");
    await user.click(screen.getByRole("button", { name: /^Disable$/ }));

    await waitFor(() => {
      expect(updateUserModeration).toHaveBeenCalledTimes(1);
    });
    const call = updateUserModeration.mock.calls[0];
    expect(call?.[0]).toBe("u1");
    expect(typeof call?.[1]).toBe("number");
    expect(call?.[1]).toBeGreaterThan(Math.floor(Date.now() / 1000));
    expect(call?.[2]).toBe("Cooling-off period");
  });

  it("shows the current moderation reason for suspended users", async () => {
    searchUsers.mockResolvedValue([suspendedUser]);
    const user = userEvent.setup();

    render(<UsersPage />);

    await user.type(screen.getByPlaceholderText("Email or user ID..."), "alice");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await user.click(await screen.findByText("alice@example.com"));

    expect(await screen.findByText(/Current moderation reason:/)).toBeInTheDocument();
    expect(screen.getByText(/Abusive upload traffic/)).toBeInTheDocument();
  });
});
