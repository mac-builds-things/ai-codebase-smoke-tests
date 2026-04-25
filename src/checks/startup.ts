/**
 * checks/startup.ts
 *
 * Verifies that the dev/preview server is actually up and responding before
 * any other checks run. If startup fails, the runner aborts — there's no point
 * checking routes on a server that isn't responding.
 *
 * Checks performed:
 *   1. Server responds to baseUrl within the timeout
 *   2. Response status code matches the expected value
 *   3. Page load in browser completes without a network error
 *   4. No critical console errors appear on initial load
 */

import type { Page } from "playwright";
import type { ScenarioConfig, CheckResult, FailureDetail } from "../types";
import { captureScreenshot } from "../utils/screenshot";

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runStartupCheck(
  page: Page,
  scenario: ScenarioConfig,
  outputDir: string
): Promise<CheckResult> {
  const startTime = Date.now();
  const failures: FailureDetail[] = [];

  const config = scenario.startup ?? {};
  const timeoutMs = config.timeoutMs ?? 10_000;
  const expectedStatus = config.expectedStatusCode ?? 200;
  const healthPath = config.healthPath ?? "/";
  const baseUrl = scenario.baseUrl ?? "http://localhost:3000";
  const targetUrl = `${baseUrl}${healthPath}`;

  // ------------------------------------------------------------------
  // Step 1: HTTP-level reachability check
  // Poll until the server responds or we hit the timeout.
  // ------------------------------------------------------------------
  const httpCheck = await pollForServer(targetUrl, expectedStatus, timeoutMs);

  if (!httpCheck.reachable) {
    failures.push({
      check: "startup",
      route: healthPath,
      expected: `HTTP ${expectedStatus} within ${timeoutMs}ms`,
      actual: httpCheck.lastError ?? "No response",
      message: `Server did not respond at ${targetUrl} within ${timeoutMs}ms. Is the dev server running?`,
    });

    // No point attempting a browser load if HTTP isn't responding
    return {
      passed: false,
      duration_ms: Date.now() - startTime,
      failures,
    };
  }

  if (httpCheck.statusCode !== expectedStatus) {
    failures.push({
      check: "startup",
      route: healthPath,
      expected: expectedStatus,
      actual: httpCheck.statusCode,
      message: `Server responded with ${httpCheck.statusCode}, expected ${expectedStatus}`,
    });
  }

  // ------------------------------------------------------------------
  // Step 2: Browser-level page load
  // Open the homepage in Playwright and confirm it loads without errors.
  // ------------------------------------------------------------------
  const consoleErrors: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      consoleErrors.push(msg.text());
    }
  });

  try {
    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: timeoutMs,
    });
  } catch (err) {
    const screenshotPath = await captureScreenshot(page, outputDir, "startup-pageerror");

    failures.push({
      check: "startup",
      route: healthPath,
      message: `Browser failed to load ${targetUrl}: ${String(err)}`,
      screenshot: screenshotPath ?? undefined,
    });

    return {
      passed: failures.length === 0,
      duration_ms: Date.now() - startTime,
      failures,
    };
  }

  // ------------------------------------------------------------------
  // Step 3: Console error check
  // Any console.error during initial page load is a startup failure.
  // This catches React render errors, missing env vars logged to console, etc.
  // ------------------------------------------------------------------
  if (consoleErrors.length > 0) {
    const screenshotPath = await captureScreenshot(page, outputDir, "startup-consoleerror");

    for (const errorMsg of consoleErrors) {
      failures.push({
        check: "startup",
        route: healthPath,
        message: `Console error during startup: ${errorMsg}`,
        screenshot: screenshotPath ?? undefined,
      });
    }
  }

  return {
    passed: failures.length === 0,
    duration_ms: Date.now() - startTime,
    failures,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PollResult {
  reachable: boolean;
  statusCode?: number;
  lastError?: string;
}

/**
 * Poll an HTTP endpoint until it returns any response or the timeout elapses.
 * Uses fetch() with short individual timeouts and exponential-ish backoff.
 *
 * TODO: Replace with Playwright's waitForURL or a proper retry utility
 *       for more robust behavior across network environments.
 */
async function pollForServer(
  url: string,
  _expectedStatus: number,
  timeoutMs: number
): Promise<PollResult> {
  const deadline = Date.now() + timeoutMs;
  let lastError: string | undefined;
  let attempt = 0;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2000),
      });
      return { reachable: true, statusCode: response.status };
    } catch (err) {
      lastError = String(err);
    }

    // Exponential backoff: 200ms, 400ms, 800ms, capped at 2000ms
    const backoff = Math.min(200 * Math.pow(2, attempt), 2000);
    await sleep(backoff);
    attempt++;
  }

  return { reachable: false, lastError };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
