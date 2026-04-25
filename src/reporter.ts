/**
 * reporter.ts
 *
 * Formats smoke test results for both agent consumption (structured JSON)
 * and human reading (plain-text summary).
 *
 * Design goal: an agent should be able to make a go/no-go decision by reading
 * `results.json` without any parsing beyond JSON.parse(). The `passed` boolean
 * at the root is the primary signal. The `failures` array is the secondary signal.
 */

import fs from "fs";
import path from "path";
import type {
  ScenarioConfig,
  SuiteResults,
  CheckResult,
  FailureDetail,
} from "./types";

// ---------------------------------------------------------------------------
// Reporter class
// ---------------------------------------------------------------------------

interface ReporterOptions {
  scenario: ScenarioConfig;
  outputDir: string;
}

export class Reporter {
  private scenario: ScenarioConfig;
  private outputDir: string;

  constructor({ scenario, outputDir }: ReporterOptions) {
    this.scenario = scenario;
    this.outputDir = outputDir;
  }

  /**
   * Build the final SuiteResults object from individual check results.
   * This is called after all checks have completed.
   */
  buildResults(
    checkResults: Record<string, CheckResult>,
    duration_ms: number
  ): SuiteResults {
    // Collect all failures across all checks into a flat array
    const allFailures: FailureDetail[] = Object.values(checkResults).flatMap(
      (check) => check.failures
    );

    // Collect all screenshots
    const allScreenshots: string[] = allFailures
      .filter((f) => f.screenshot != null)
      .map((f) => f.screenshot!);

    // Count total checks (startup = 1, plus per-item details for routes/api)
    let total = 0;
    let failed = 0;
    let skipped = 0;

    for (const [name, result] of Object.entries(checkResults)) {
      if (result.details && result.details.length > 0) {
        // Route and API checks have per-item details
        for (const detail of result.details) {
          total++;
          if (!detail.passed) failed++;
        }
      } else {
        // Startup and browser checks count as a single check each
        total++;
        if (!result.passed) failed++;
      }
    }

    const passed = failed === 0;

    return {
      passed,
      timestamp: new Date().toISOString(),
      scenario: this.scenario.name,
      baseUrl: this.scenario.baseUrl ?? "unknown",
      duration_ms,
      summary: {
        total,
        passed: total - failed - skipped,
        failed,
        skipped,
      },
      checks: checkResults,
      failures: allFailures,
      screenshots: allScreenshots,
    };
  }

  /**
   * Write results to disk:
   *   - smoke-results/results.json  (machine-readable)
   *   - smoke-results/summary.txt   (human-readable)
   */
  write(results: SuiteResults): void {
    this.writeJson(results);
    this.writeSummary(results);
  }

  // ---------------------------------------------------------------------------
  // Private: JSON output
  // ---------------------------------------------------------------------------

  private writeJson(results: SuiteResults): void {
    const jsonPath = path.join(this.outputDir, "results.json");
    fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), "utf-8");
  }

  // ---------------------------------------------------------------------------
  // Private: Human-readable summary
  // ---------------------------------------------------------------------------

  private writeSummary(results: SuiteResults): void {
    const lines: string[] = [];
    const hr = "─".repeat(60);

    lines.push(hr);
    lines.push(`Smoke Test Results — ${results.scenario}`);
    lines.push(`Run at: ${results.timestamp}`);
    lines.push(`Base URL: ${results.baseUrl}`);
    lines.push(`Duration: ${results.duration_ms}ms`);
    lines.push(hr);

    const statusLine = results.passed
      ? `PASSED — ${results.summary.passed}/${results.summary.total} checks passed`
      : `FAILED — ${results.summary.failed}/${results.summary.total} checks failed`;

    lines.push(statusLine);
    lines.push("");

    // Per-check summaries
    if (results.checks.startup) {
      const s = results.checks.startup;
      lines.push(`Startup  : ${s.passed ? "PASS" : "FAIL"} (${s.duration_ms}ms)`);
    }

    if (results.checks.routes) {
      const r = results.checks.routes;
      const routeTotal = r.details?.length ?? 0;
      const routeFailed = r.failures.length;
      lines.push(
        `Routes   : ${r.passed ? "PASS" : "FAIL"} — ${routeTotal - routeFailed}/${routeTotal} routes (${r.duration_ms}ms)`
      );
    }

    if (results.checks.api) {
      const a = results.checks.api;
      const apiTotal = a.details?.length ?? 0;
      const apiFailed = a.failures.length;
      lines.push(
        `API      : ${a.passed ? "PASS" : "FAIL"} — ${apiTotal - apiFailed}/${apiTotal} endpoints (${a.duration_ms}ms)`
      );
    }

    if (results.checks.browser) {
      const b = results.checks.browser;
      lines.push(`Browser  : ${b.passed ? "PASS" : "FAIL"} (${b.duration_ms}ms)`);
    }

    // Failure details
    if (results.failures.length > 0) {
      lines.push("");
      lines.push("Failures:");
      lines.push(hr);

      for (const failure of results.failures) {
        lines.push(`  [${failure.check.toUpperCase()}] ${failure.route ?? ""}`);
        lines.push(`  ${failure.message}`);
        if (failure.expected != null && failure.actual != null) {
          lines.push(`  Expected: ${failure.expected}`);
          lines.push(`  Actual  : ${failure.actual}`);
        }
        if (failure.screenshot) {
          lines.push(`  Screenshot: ${failure.screenshot}`);
        }
        lines.push("");
      }
    }

    lines.push(hr);

    const summaryPath = path.join(this.outputDir, "summary.txt");
    fs.writeFileSync(summaryPath, lines.join("\n"), "utf-8");
  }
}

// ---------------------------------------------------------------------------
// Convenience: read results from disk (useful for agents parsing after the run)
// ---------------------------------------------------------------------------

/**
 * Read and parse results.json from the output directory.
 * Throws if the file doesn't exist or is malformed.
 */
export function readResults(outputDir: string = "smoke-results"): SuiteResults {
  const jsonPath = path.join(outputDir, "results.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`No results found at ${jsonPath}. Run the smoke tests first.`);
  }
  return JSON.parse(fs.readFileSync(jsonPath, "utf-8")) as SuiteResults;
}
