/**
 * runner.ts
 *
 * Orchestrates all smoke test checks for a given scenario.
 * Called by `npm run smoke` with a scenario path and optional base URL.
 *
 * Usage:
 *   npx ts-node src/runner.ts --scenario=scenarios/react-app.ts [--base-url=http://localhost:3000]
 *
 * Exit codes:
 *   0 — all checks passed
 *   1 — one or more checks failed
 *   2 — configuration error or scenario not found
 */

import path from "path";
import fs from "fs";
import { chromium, Browser, Page } from "playwright";

import { runStartupCheck } from "./checks/startup";
import { runRouteChecks } from "./checks/routes";
import { runApiChecks } from "./checks/api";
import { Reporter } from "./reporter";
import type { ScenarioConfig, SuiteResults, CheckResult } from "./types";

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { scenarioPath: string; baseUrl?: string } {
  const args = argv.slice(2);
  let scenarioPath: string | undefined;
  let baseUrl: string | undefined;

  for (const arg of args) {
    if (arg.startsWith("--scenario=")) {
      scenarioPath = arg.replace("--scenario=", "");
    } else if (arg.startsWith("--base-url=")) {
      baseUrl = arg.replace("--base-url=", "");
    }
  }

  if (!scenarioPath) {
    console.error("Error: --scenario=<path> is required");
    process.exit(2);
  }

  return { scenarioPath, baseUrl };
}

// ---------------------------------------------------------------------------
// Scenario loading
// ---------------------------------------------------------------------------

async function loadScenario(scenarioPath: string): Promise<ScenarioConfig> {
  const resolved = path.resolve(process.cwd(), scenarioPath);

  if (!fs.existsSync(resolved)) {
    console.error(`Error: scenario file not found at ${resolved}`);
    process.exit(2);
  }

  try {
    // Dynamic import works for both .ts (via ts-node) and compiled .js
    const mod = await import(resolved);
    const scenario: ScenarioConfig = mod.scenario ?? mod.default;

    if (!scenario) {
      console.error(`Error: scenario file must export a named 'scenario' or default export`);
      process.exit(2);
    }

    return scenario;
  } catch (err) {
    console.error(`Error loading scenario: ${err}`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------
// Output directory setup
// ---------------------------------------------------------------------------

function ensureOutputDir(): string {
  const outputDir = path.join(process.cwd(), "smoke-results");
  const screenshotDir = path.join(outputDir, "screenshots");

  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  return outputDir;
}

// ---------------------------------------------------------------------------
// Browser lifecycle
// ---------------------------------------------------------------------------

async function createBrowser(): Promise<Browser> {
  return chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage", // Prevents crashes in low-memory CI environments
    ],
  });
}

async function createPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({
    // Capture console messages — we check for errors later
    ignoreHTTPSErrors: true,
  });
  return context.newPage();
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const { scenarioPath, baseUrl: cliBaseUrl } = parseArgs(process.argv);
  const scenario = await loadScenario(scenarioPath);
  const outputDir = ensureOutputDir();

  // CLI --base-url overrides scenario.baseUrl, which overrides process.env.BASE_URL
  const resolvedBaseUrl =
    cliBaseUrl ??
    process.env.BASE_URL ??
    scenario.baseUrl ??
    "http://localhost:3000";

  const effectiveScenario: ScenarioConfig = {
    ...scenario,
    baseUrl: resolvedBaseUrl,
  };

  const reporter = new Reporter({
    scenario: effectiveScenario,
    outputDir,
  });

  console.log(`\n🔍 Running smoke tests`);
  console.log(`   Scenario : ${effectiveScenario.name}`);
  console.log(`   Base URL : ${resolvedBaseUrl}`);
  console.log(`   Output   : ${outputDir}\n`);

  const suiteStart = Date.now();
  const browser = await createBrowser();
  const page = await createPage(browser);

  const checkResults: Record<string, CheckResult> = {};

  try {
    // ------------------------------------------------------------------
    // 1. Startup check — must pass before we test anything else
    // ------------------------------------------------------------------
    console.log("  [1/3] Startup checks...");
    const startupResult = await runStartupCheck(page, effectiveScenario, outputDir);
    checkResults.startup = startupResult;

    if (!startupResult.passed) {
      console.error(`  ✗ Startup check failed — aborting remaining checks`);
      console.error(`    ${startupResult.failures[0]?.message ?? "Unknown error"}`);

      const results = reporter.buildResults(checkResults, Date.now() - suiteStart);
      reporter.write(results);
      await browser.close();
      process.exit(1);
    }

    console.log(`  ✓ Startup check passed (${startupResult.duration_ms}ms)`);

    // ------------------------------------------------------------------
    // 2. Route checks
    // ------------------------------------------------------------------
    console.log("  [2/3] Route checks...");
    const routeResult = await runRouteChecks(page, effectiveScenario, outputDir);
    checkResults.routes = routeResult;

    const routePassed = routeResult.passed ? "✓" : "✗";
    const routeCount = routeResult.details?.length ?? 0;
    const routeFailed = routeResult.failures.length;
    console.log(`  ${routePassed} Route checks: ${routeCount - routeFailed}/${routeCount} passed`);

    // ------------------------------------------------------------------
    // 3. API checks
    // ------------------------------------------------------------------
    console.log("  [3/3] API checks...");
    const apiResult = await runApiChecks(effectiveScenario, outputDir);
    checkResults.api = apiResult;

    const apiPassed = apiResult.passed ? "✓" : "✗";
    const apiCount = apiResult.details?.length ?? 0;
    const apiFailed = apiResult.failures.length;
    console.log(`  ${apiPassed} API checks: ${apiCount - apiFailed}/${apiCount} passed`);

  } finally {
    await browser.close();
  }

  // ------------------------------------------------------------------
  // Write results and exit
  // ------------------------------------------------------------------
  const totalDuration = Date.now() - suiteStart;
  const results = reporter.buildResults(checkResults, totalDuration);
  reporter.write(results);

  const overallPassed = results.passed;
  const totalChecks = results.summary.total;
  const totalFailed = results.summary.failed;

  console.log(`\n${"─".repeat(50)}`);
  if (overallPassed) {
    console.log(`✓ All ${totalChecks} checks passed in ${totalDuration}ms`);
    console.log(`  Results: ${path.join(outputDir, "results.json")}`);
  } else {
    console.error(`✗ ${totalFailed}/${totalChecks} checks failed in ${totalDuration}ms`);
    console.error(`  Results: ${path.join(outputDir, "results.json")}`);
    console.error(`  Summary: ${path.join(outputDir, "summary.txt")}`);
    if (results.screenshots.length > 0) {
      console.error(`  Screenshots: ${results.screenshots.join(", ")}`);
    }
  }
  console.log(`${"─".repeat(50)}\n`);

  process.exit(overallPassed ? 0 : 1);
}

run().catch((err) => {
  console.error("Unhandled error in smoke test runner:", err);
  process.exit(1);
});
