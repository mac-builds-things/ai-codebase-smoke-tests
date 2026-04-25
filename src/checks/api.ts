/**
 * checks/api.ts
 *
 * Verifies API endpoints are healthy and returning expected responses.
 * Does NOT use a browser — all requests are made via fetch() directly.
 *
 * Checks performed:
 *   1. Health endpoint (e.g. /api/health) returns 200
 *   2. Each configured API route returns the expected status code
 *   3. If expectedJsonContains is specified, response JSON must contain those fields
 *
 * API checks run after route checks. If the health endpoint fails,
 * remaining API route checks still run (failures are collected, not thrown).
 */

import type { ScenarioConfig, CheckResult, ApiRouteCheck, ApiCheckResult, FailureDetail } from "../types";

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function runApiChecks(
  scenario: ScenarioConfig,
  _outputDir: string
): Promise<CheckResult> {
  const startTime = Date.now();
  const failures: FailureDetail[] = [];
  const details: ApiCheckResult[] = [];

  const apiConfig = scenario.api;
  const baseUrl = scenario.baseUrl ?? "http://localhost:3000";

  if (!apiConfig) {
    return {
      passed: true,
      duration_ms: Date.now() - startTime,
      failures: [],
      details: [],
    };
  }

  // ------------------------------------------------------------------
  // Health endpoint check
  // ------------------------------------------------------------------
  if (apiConfig.healthEndpoint) {
    const healthCheck = await checkApiRoute(
      {
        path: apiConfig.healthEndpoint,
        expectedStatus: 200,
        method: "GET",
      },
      baseUrl
    );

    details.push(healthCheck);

    if (!healthCheck.passed && healthCheck.failure) {
      failures.push(healthCheck.failure);
    }
  }

  // ------------------------------------------------------------------
  // Additional API route checks
  // ------------------------------------------------------------------
  for (const routeConfig of apiConfig.routes ?? []) {
    if (routeConfig.skip) continue;

    const result = await checkApiRoute(routeConfig, baseUrl);
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
// Per-endpoint check
// ---------------------------------------------------------------------------

async function checkApiRoute(
  routeConfig: ApiRouteCheck,
  baseUrl: string
): Promise<ApiCheckResult> {
  const checkStart = Date.now();
  const method = routeConfig.method ?? "GET";
  const expectedStatus = routeConfig.expectedStatus ?? 200;
  const fullUrl = `${baseUrl}${routeConfig.path}`;

  let actualStatus: number | undefined;
  let responseJson: unknown;

  try {
    const response = await fetch(fullUrl, {
      method,
      headers: {
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    actualStatus = response.status;

    // Attempt to parse JSON body for content assertions
    if (routeConfig.expectedJsonContains) {
      try {
        responseJson = await response.json();
      } catch {
        // JSON parse failure is handled below if expectedJsonContains was set
        responseJson = null;
      }
    }
  } catch (err) {
    const failure: FailureDetail = {
      check: "api",
      route: routeConfig.path,
      expected: `HTTP ${expectedStatus}`,
      actual: "Connection error",
      message: `API request to ${fullUrl} failed: ${String(err)}`,
    };

    return {
      endpoint: routeConfig.path,
      method,
      passed: false,
      expectedStatus,
      duration_ms: Date.now() - checkStart,
      failure,
    };
  }

  // ------------------------------------------------------------------
  // Status code check
  // ------------------------------------------------------------------
  if (actualStatus !== expectedStatus) {
    const failure: FailureDetail = {
      check: "api",
      route: routeConfig.path,
      expected: expectedStatus,
      actual: actualStatus,
      message: `${method} ${routeConfig.path} returned ${actualStatus}, expected ${expectedStatus}`,
    };

    return {
      endpoint: routeConfig.path,
      method,
      passed: false,
      statusCode: actualStatus,
      expectedStatus,
      duration_ms: Date.now() - checkStart,
      failure,
    };
  }

  // ------------------------------------------------------------------
  // JSON content assertion
  // ------------------------------------------------------------------
  if (routeConfig.expectedJsonContains) {
    const containsCheck = assertJsonContains(
      responseJson,
      routeConfig.expectedJsonContains,
      routeConfig.path
    );

    if (!containsCheck.passed) {
      return {
        endpoint: routeConfig.path,
        method,
        passed: false,
        statusCode: actualStatus,
        expectedStatus,
        duration_ms: Date.now() - checkStart,
        failure: containsCheck.failure,
      };
    }
  }

  return {
    endpoint: routeConfig.path,
    method,
    passed: true,
    statusCode: actualStatus,
    expectedStatus,
    duration_ms: Date.now() - checkStart,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface JsonAssertResult {
  passed: boolean;
  failure?: FailureDetail;
}

/**
 * Check that a JSON response contains all expected key-value pairs.
 * Only checks top-level keys — deep nesting is not supported yet.
 *
 * TODO: Support dot-notation for nested key assertions, e.g. "data.status"
 */
function assertJsonContains(
  actual: unknown,
  expected: Record<string, unknown>,
  routePath: string
): JsonAssertResult {
  if (actual === null || typeof actual !== "object" || Array.isArray(actual)) {
    return {
      passed: false,
      failure: {
        check: "api",
        route: routePath,
        expected: "JSON object response",
        actual: typeof actual,
        message: `${routePath}: expected a JSON object response but got ${typeof actual}`,
      },
    };
  }

  const actualObj = actual as Record<string, unknown>;

  for (const [key, expectedValue] of Object.entries(expected)) {
    const actualValue = actualObj[key];

    if (JSON.stringify(actualValue) !== JSON.stringify(expectedValue)) {
      return {
        passed: false,
        failure: {
          check: "api",
          route: routePath,
          expected: `${key}: ${JSON.stringify(expectedValue)}`,
          actual: `${key}: ${JSON.stringify(actualValue)}`,
          message: `${routePath}: JSON field "${key}" was ${JSON.stringify(actualValue)}, expected ${JSON.stringify(expectedValue)}`,
        },
      };
    }
  }

  return { passed: true };
}
