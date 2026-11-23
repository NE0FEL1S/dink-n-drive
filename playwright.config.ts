import { defineConfig, devices } from "@playwright/test";
import { loadTestEnv } from "./e2e/support/env";

loadTestEnv();

/**
 * End-to-end tests (docs/SETUP.md, "Testing").
 * - Locally: runs against `npm run dev` (started for you) unless E2E_BASE_URL is set.
 * - CI: runs against the Vercel deployment of the pushed `staging` commit.
 * Every test user and booking is tagged `e2e+…@dinkndrive.test` and deleted afterwards.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const isLocal = baseURL.startsWith("http://localhost");
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  workers: isCI ? 3 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "en-PH",
    timezoneId: "Asia/Manila",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "iphone", use: { ...devices["iPhone 15"] } },
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: isLocal
    ? { command: "npm run dev", url: baseURL, reuseExistingServer: true, timeout: 120_000 }
    : undefined,
});
