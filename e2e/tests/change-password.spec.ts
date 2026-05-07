/**
 * E2E tests for changing a user's password from the settings page.
 *
 * Prerequisites — run from the monorepo root before starting tests:
 *   pnpm dev
 *
 * packages/auth/.dev.vars must contain:
 *   TURNSTILE_SECRET=1x0000000000000000000000000000000AA
 *
 * A fresh account is registered at the start and deleted in afterAll so no
 * data is left behind even if tests fail mid-way.
 */

import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// ── Unique-per-run values ────────────────────────────────────────────────────

const RUN_ID = Date.now();
const EMAIL = `e2e-pw-${RUN_ID}@example.com`;
const PASSWORD = "OriginalP@ssw0rd!";
const NEW_PASSWORD = "UpdatedP@ssw0rd!";
const NAME = "Password Change Test User";
// Offset +2 from app.spec so parallel runs don't share a rate-limit bucket.
const FAKE_IP = `10.${Math.floor(RUN_ID / 1e10) % 256}.${Math.floor(RUN_ID / 1e7) % 256}.${(RUN_ID + 2) % 256}`;

// ── Shared context ────────────────────────────────────────────────────────────

let context: BrowserContext;
let page: Page;

async function mockTurnstile(ctx: BrowserContext) {
  await ctx.addInitScript(() => {
    Object.defineProperty(window, "turnstile", {
      value: {
        render(_container: unknown, options: { callback: (t: string) => void }) {
          setTimeout(() => options.callback("e2e-bypass-token"), 50);
          return "mock-widget-id";
        },
        reset() {},
        remove() {},
      },
      writable: true,
      configurable: true,
    });
  });
}

async function injectFakeIp(ctx: BrowserContext) {
  await ctx.route("**/api/**", async (route) => {
    await route.continue({
      headers: { ...route.request().headers(), "CF-Connecting-IP": FAKE_IP },
    });
  });
}

async function logout(p: Page) {
  await p.goto("/login?logout=1");
  await expect(p).toHaveURL(/\/login/, { timeout: 5000 });
}

async function openChangePasswordDialog(p: Page) {
  await p.goto("/settings");
  await p.getByRole("button", { name: "Change password" }).click();
  await expect(p.getByRole("dialog", { name: "Change password" })).toBeVisible({ timeout: 5000 });
}

// Helpers scoped to the dialog to avoid label-substring ambiguity.
// "New password" is a substring of "Confirm new password", so exact is required.
const currentPasswordField = (p: Page) => p.getByLabel("Current password", { exact: true });
const newPasswordField = (p: Page) => p.getByLabel("New password", { exact: true });
const confirmPasswordField = (p: Page) => p.getByLabel("Confirm new password", { exact: true });
const submitButton = (p: Page) => p.getByRole("button", { name: "Change password", exact: true }).last();

// ── Lifecycle ─────────────────────────────────────────────────────────────────

test.describe.configure({ mode: "serial" });

test.beforeAll(async ({ browser }) => {
  context = await browser.newContext();
  await mockTurnstile(context);
  await injectFakeIp(context);
  page = await context.newPage();
});

test.afterAll(async () => {
  if (page) {
    try {
      await page.goto("/settings", { timeout: 10000 });
      const deleteBtn = page.getByRole("button", { name: /delete account/i });
      if (await deleteBtn.isVisible({ timeout: 3000 })) {
        await deleteBtn.click();
        await page.getByRole("alertdialog").waitFor({ timeout: 5000 });
        await page.getByRole("button", { name: /yes.*delete.*account/i }).click();
        await page.waitForURL(/\/(login|register)/, { timeout: 15000 });
      }
    } catch { /* already deleted or not signed in */ }
  }
  await context.close();
});

// ── Setup ─────────────────────────────────────────────────────────────────────

test("registers a fresh account", async () => {
  await page.goto("/register");
  await page.getByLabel("Name").fill(NAME);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled({ timeout: 5000 });
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).not.toHaveURL(/\/register/, { timeout: 10000 });
});

test("logs in after registration", async () => {
  if (page.url().includes("/login")) {
    await page.getByLabel("Email").fill(EMAIL);
    await page.getByLabel("Password").fill(PASSWORD);
    await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled({ timeout: 5000 });
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
});

// ── Change-password dialog ────────────────────────────────────────────────────

test("change password button opens the dialog", async () => {
  await openChangePasswordDialog(page);
  await expect(currentPasswordField(page)).toBeVisible();
  await expect(newPasswordField(page)).toBeVisible();
  await expect(confirmPasswordField(page)).toBeVisible();
});

test("submit is disabled while fields are empty", async () => {
  // Dialog is still open from the previous test.
  await expect(submitButton(page)).toBeDisabled();
});

test("shows inline error when new password is too weak", async () => {
  await newPasswordField(page).fill("weak");
  await expect(page.getByText("Password is too weak. Try adding more characters or symbols.")).toBeVisible();
});

test("shows inline error when confirm does not match", async () => {
  await newPasswordField(page).fill(NEW_PASSWORD);
  await confirmPasswordField(page).fill("different-value");
  await expect(page.getByText("Passwords do not match.")).toBeVisible();
});

test("submit is disabled when passwords do not match", async () => {
  // New password is strong but confirm is still mismatched from the previous test.
  await expect(submitButton(page)).toBeDisabled();
});

test("shows toast when current password is wrong", async () => {
  await currentPasswordField(page).fill("wrong-password");
  await newPasswordField(page).fill(NEW_PASSWORD);
  await confirmPasswordField(page).fill(NEW_PASSWORD);

  await expect(submitButton(page)).toBeEnabled({ timeout: 3000 });
  await submitButton(page).click();

  await expect(page.getByText("Current password is incorrect", { exact: true })).toBeVisible({ timeout: 8000 });
  // Dialog stays open after a failed attempt.
  await expect(page.getByRole("dialog", { name: "Change password" })).toBeVisible();
});

test("successfully changes the password", async () => {
  await currentPasswordField(page).fill(PASSWORD);
  await newPasswordField(page).fill(NEW_PASSWORD);
  await confirmPasswordField(page).fill(NEW_PASSWORD);

  await expect(submitButton(page)).toBeEnabled({ timeout: 3000 });
  await submitButton(page).click();

  await expect(page.getByText("Password changed", { exact: true })).toBeVisible({ timeout: 8000 });
  // Dialog closes after success.
  await expect(page.getByRole("dialog", { name: "Change password" })).not.toBeVisible({ timeout: 5000 });
});

// ── Verify new password works ─────────────────────────────────────────────────

test("old password no longer works", async () => {
  await logout(page);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled({ timeout: 5000 });
  await page.getByRole("button", { name: "Sign in" }).click();
  // Should stay on login (auth rejected).
  await expect(page).toHaveURL(/\/login/, { timeout: 8000 });
});

test("new password logs in successfully", async () => {
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(NEW_PASSWORD);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled({ timeout: 5000 });
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 10000 });
});

// ── Cleanup ───────────────────────────────────────────────────────────────────

test("deletes the account", async () => {
  await page.goto("/settings");
  await page.getByRole("button", { name: /delete account/i }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 });
  await page.getByRole("button", { name: /yes.*delete.*account/i }).click();
  await expect(page).toHaveURL(/\/(login|register)/, { timeout: 15000 });
});
