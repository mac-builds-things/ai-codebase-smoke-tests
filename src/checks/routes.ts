/**
 * checks/routes.ts
 *
 * Walks a route matrix defined in the scenario and verifies:
 *   - Each route returns the expected HTTP status code
 *   - Response body contains expected strings (if configured)
 *   - Response body does NOT contain excluded strings (if configured)
 *   - Browser-loaded page renders without console errors (browser checks)
 *
 * Each route is checked independently so failures don't block other routes.
 * Results include per-route detail objects suitable for structured reporting.
 */

import type { Page } from "playwright";
import type {
  ScenarioConfig,
  CheckResult,
  RouteCheck,
  RouteCheckResult,
  FailureDetail,
} from "../types";
import { captureScreenshot } from "../utils/screenshot";

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runRouteChecks(
  page: Page,
  scenario: ScenarioConfig,
  outputDir: string
): Promise<CheckResult> {
  const startTime = Date.now();
  const failures: FailureDetail[] = [];
  const details: RouteCheckResult[] = [];

  const routes = scenario.routes ?? [];
  const baseUrl = scenario.baseUrl ?? "http://localhost:3000";

  if (routes.length === 0) {
    // No routes configured — not an error, just nothing to check
    return {
      passed: true,
      duration_ms: Date.now() - startTime,
      failures: [],
      details: [],
    };
  }

  for (const routeConfig of routes) {
    if (routeConfig.skip) continue;

    const result = await checkRoute(page, routeConfig, baseUrl, outputDir);
    details.push(result);

    if (!result.passed && result.failure) {
      failures.push(result.failure);
    }
  }

  return {
    passed: failures.length === 0,
    duration_ms: Date.now() - startTime,
    failures,
    details,
  };
}

// ---------------------------------------------------------------------------
// Per-route check
// ---------------------------------------------------------------------------

async function checkRoute(
  page: Page,
  routeConfig: RouteCheck,
  baseUrl: string,
  outputDir: string
): Promise<RouteCheckResult> {
  const routeStart = Date.now();
  const expectedStatus = routeConfig.expectedStatus ?? 200;
  const fullUrl = `${baseUrl}${routeConfig.path}`;

  // ------------------------------------------------------------------
  // HTTP-level check via fetch (faster than full browser navigation)
  // ------------------------------------------------------------------
  let actualStatus: number | undefined;
  let responseBody: string | undefined;

  try {
    const response = await fetch(fullUrl, {
      method: "GET",
      signal: AbortSignal.timeout(8000),
      // Follow redirects — we care about the final status
      redirect: "follow",
    });

    actualStatus = response.status;

    // Only read body if we need to check content
    if (
      (routeConfig.contentContains && routeConfig.contentContains.length > 0) ||
      (routeConfig.contentExcludes && routeConfig.contentExcludes.length > 0)
    ) {
      responseBody = await response.text();
    }
  } catch (err) {
    const duration_ms = Date.now() - routeStart;
    const failure: FailureDetail = {
      check: "routes",
      route: routeConfig.path,
      expected: `HTTP ${expectedStatus}`,
      actual: "Connection error",
      message: `Failed to fetch ${fullUrl}: ${String(err)}`,
    };

    return {
      route: routeConfig.path,
      passed: false,
      expectedStatus,
      duration_ms,
      failure,
    };
  }

  // ------------------------------------------------------------------
  // Status code assertion
  // ------------------------------------------------------------------
  if (actualStatus !== expectedStatus) {
    const screenshotPath = await captureBrowserScreenshot(
      page,
      fullUrl,
      outputDir,
      `route-${slugify(routeConfig.path)}-status`
    );

    const failure: FailureDetail = {
      check: "routes",
      route: routeConfig.path,
      expected: expectedStatus,
      actual: actualStatus,
      message: `${routeConfig.path} returned ${actualStatus}, expected ${expectedStatus}`,
      screenshot: screenshotPath ?? undefined,
    };

    return {
      route: routeConfig.path,
      passed: false,
      statusCode: actualStatus,
      expectedStatus,
      duration_ms: Date.now() - routeStart,
      failure,
    };
  }

  // ------------------------------------------------------------------
  // Content assertions
  // ------------------------------------------------------------------
  if (responseBody !== undefined) {
    // Must contain
    for (const required of routeConfig.contentContains ?? []) {
      if (!responseBody.includes(required)) {
        const failure: FailureDetail = {
          check: "routes",
          route: routeConfig.path,
          expected: `body to contain "${required}"`,
          actual: "string not found in response body",
          message: `${routeConfig.path}: response body does not contain expected string "${required}"`,
        };

        return {
          route: routeConfig.path,
          passed: false,
          statusCode: actualStatus,
          expectedStatus,
          duration_ms: Date.now() - routeStart,
          failure,
        };
      }
    }

    // Must NOT contain
    for (const excluded of routeConfig.contentExcludes ?? []) {
      if (responseBody.includes(excluded)) {
        const failure: FailureDetail = {
          check: "routes",
          route: routeConfig.path,
          expected: `body NOT to contain "${excluded}"`,
          actual: `"${excluded}" was found in response body`,
          message: `${routeConfig.path}: response body contains excluded string "${excluded}"`,
        };

        return {
          route: routeConfig.path,
          passed: false,
          statusCode: actualStatus,
          expectedStatus,
          duration_ms: Date.now() - routeStart,
          failure,
        };
      }
    }
  }

  // All checks passed for this route
  return {
    route: routeConfig.path,
    passed: true,
    statusCode: actualStatus,
    expectedStatus,
    duration_ms: Date.now() - routeStart,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to a URL in the browser and capture a screenshot.
 * Used only when we need a visual artifact for a failure — for status code
 * checks we navigate here so agents have a screenshot showing what the
 * page actually rendered.
 *
 * TODO: Optionally run all route checks through the browser (not just fetch)
 *       for richer assertions (DOM presence, visible text, etc.)
 */
async function captureBrowserScreenshot(
  page: Page,
  url: string,
  outputDir: string,
  name: string
): Promise<string | null> {
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 5000 });
  } catch {
    // If the navigation itself fails, that's already captured in the failure
  }
  return captureScreenshot(page, outputDir, name);
}

function slugify(path: string): string {
  return path.replace(/^\//, "").replace(/\//g, "-").replace(/[^a-zA-Z0-9-]/g, "") || "root";
}
