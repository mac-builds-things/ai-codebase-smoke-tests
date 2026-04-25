/**
 * playwright.config.ts
 *
 * Playwright configuration for the smoke test suite.
 *
 * Note: Most of the runner logic lives in src/runner.ts (the custom orchestrator).
 * This config is used when running `npm test` directly via Playwright's own
 * test runner — useful for interactive debugging and CI integration that
 * expects the standard Playwright output format.
 *
 * For agent-driven runs, use `npm run smoke` instead — it uses the custom
 * runner and produces agent-friendly JSON output.
 */

import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  // Directory containing test files (for direct Playwright usage)
  testDir: "./tests",

  // How long a single test can run before it's considered hung
  timeout: 30_000,

  // How long to wait for the entire test suite
  globalTimeout: 5 * 60 * 1000, // 5 minutes

  // Retry failed tests once in CI — helps with flaky network conditions
  retries: process.env.CI ? 1 : 0,

  // Run tests in parallel in CI, sequentially locally for easier debugging
  workers: process.env.CI ? 4 : 1,

  // Reporter configuration
  reporter: [
    // Standard terminal output
    ["list"],
    // JSON report for agent parsing (in addition to our custom results.json)
    ["json", { outputFile: "smoke-results/playwright-report.json" }],
    // HTML report for human review
    ["html", { outputFolder: "smoke-results/playwright-html", open: "never" }],
  ],

  // Shared settings for all tests
  use: {
    // Base URL — used by page.goto('/path') in tests
    baseURL: BASE_URL,

    // Always capture a screenshot on test failure
    screenshot: "only-on-failure",

    // Capture a video on first retry (helps debug flaky failures)
    video: "on-first-retry",

    // Capture trace on first retry for full debugging
    trace: "on-first-retry",

    // Ignore HTTPS errors (useful for preview environments with self-signed certs)
    ignoreHTTPSErrors: true,

    // How long to wait for navigation events
    navigationTimeout: 15_000,

    // How long to wait for actions (click, fill, etc.)
    actionTimeout: 10_000,
  },

  // Test against multiple browsers in CI, just Chrome locally
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // Disable hardware acceleration in CI containers
        launchOptions: {
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
          ],
        },
      },
    },

    // Uncomment to test Firefox and Safari in CI:
    // {
    //   name: "firefox",
    //   use: { ...devices["Desktop Firefox"] },
    // },
    // {
    //   name: "webkit",
    //   use: { ...devices["Desktop Safari"] },
    // },

    // Mobile viewports (optional — uncomment to include)
    // {
    //   name: "mobile-chrome",
    //   use: { ...devices["Pixel 5"] },
    // },
    // {
    //   name: "mobile-safari",
    //   use: { ...devices["iPhone 12"] },
    // },
  ],

  // Start a local dev server before running tests
  // Uncomment and adjust if you want Playwright to manage the server lifecycle:
  //
  // webServer: {
  //   command: "npm run dev",
  //   url: BASE_URL,
  //   reuseExistingServer: !process.env.CI,
  //   timeout: 30_000,
  // },
});
