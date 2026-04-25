/**
 * types.ts
 *
 * Shared TypeScript types for the smoke test suite.
 * Exported from here and imported by all other modules.
 */

// ---------------------------------------------------------------------------
// Scenario configuration
// ---------------------------------------------------------------------------

export interface RouteCheck {
  /** The path to check, relative to baseUrl (e.g. "/dashboard") */
  path: string;
  /** Expected HTTP status code. Defaults to 200. */
  expectedStatus?: number;
  /** If set, the response body must contain this string */
  contentContains?: string[];
  /** If set, the response body must NOT contain this string */
  contentExcludes?: string[];
  /** Skip this route (useful for temporarily disabling checks without removing them) */
  skip?: boolean;
}

export interface ApiRouteCheck {
  path: string;
  expectedStatus?: number;
  /** If set, the response JSON must deeply contain these key-value pairs */
  expectedJsonContains?: Record<string, unknown>;
  method?: "GET" | "POST" | "HEAD";
  skip?: boolean;
}

export interface StartupConfig {
  /** How long to wait for the server to respond (ms). Default: 10000 */
  timeoutMs?: number;
  /** Expected status code from the root route during startup. Default: 200 */
  expectedStatusCode?: number;
  /** Optional: path to hit during startup check instead of "/" */
  healthPath?: string;
}

export interface BrowserConfig {
  /** Path to load in the browser for homepage checks. Default: "/" */
  homepagePath?: string;
  /** If true, any console.error during page load causes a failure */
  expectNoConsoleErrors?: boolean;
  /** CSS selectors that must be present in the DOM after page load */
  requiredSelectors?: string[];
  /** Text strings that must be visible on the page */
  requiredText?: string[];
  /** How long to wait for page load (ms). Default: 10000 */
  pageLoadTimeoutMs?: number;
}

export interface ApiConfig {
  /** Path to the health endpoint (e.g. "/api/health") */
  healthEndpoint?: string;
  /** Additional API routes to verify */
  routes?: ApiRouteCheck[];
}

export interface ScenarioConfig {
  /** Human-readable name for this scenario */
  name: string;
  /** Base URL of the running app. Can be overridden by CLI --base-url or BASE_URL env var */
  baseUrl?: string;
  /** Startup check configuration */
  startup?: StartupConfig;
  /** Routes to verify */
  routes?: RouteCheck[];
  /** API endpoint checks */
  api?: ApiConfig;
  /** Browser-based checks */
  browser?: BrowserConfig;
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface FailureDetail {
  /** Which check produced this failure */
  check: "startup" | "routes" | "api" | "browser";
  /** The route or endpoint that failed (if applicable) */
  route?: string;
  /** Expected value */
  expected?: string | number | boolean;
  /** Actual value */
  actual?: string | number | boolean;
  /** Human-readable failure description */
  message: string;
  /** Path to a failure screenshot (browser checks only) */
  screenshot?: string;
}

export interface RouteCheckResult {
  route: string;
  passed: boolean;
  statusCode?: number;
  expectedStatus: number;
  duration_ms: number;
  failure?: FailureDetail;
}

export interface ApiCheckResult {
  endpoint: string;
  method: string;
  passed: boolean;
  statusCode?: number;
  expectedStatus: number;
  duration_ms: number;
  failure?: FailureDetail;
}

export interface CheckResult {
  passed: boolean;
  duration_ms: number;
  failures: FailureDetail[];
  /** Per-item detail results (routes, api endpoints, etc.) */
  details?: (RouteCheckResult | ApiCheckResult)[];
}

export interface SuiteResults {
  /** Top-level pass/fail — the first thing an agent reads */
  passed: boolean;
  timestamp: string;
  scenario: string;
  baseUrl: string;
  duration_ms: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  checks: {
    startup?: CheckResult;
    routes?: CheckResult;
    api?: CheckResult;
    browser?: CheckResult;
  };
  /** Flat array of all failures across all checks — for agent consumption */
  failures: FailureDetail[];
  /** Paths to any failure screenshots captured during the run */
  screenshots: string[];
}
