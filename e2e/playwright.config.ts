import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  globalTeardown: "./global-teardown.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // Local wrangler dev intermittently drops requests through the
  // browser → vite → API worker → auth worker chain (rate-limit edge cases,
  // service-binding hiccups). One retry catches those without masking real
  // bugs, since deterministic failures still fail twice.
  retries: 1,
  workers: 2,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    launchOptions: process.env.PWSLOWMO
      ? { slowMo: Number(process.env.PWSLOWMO) }
      : undefined,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
  ],
});
