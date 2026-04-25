# ai-codebase-smoke-tests

> Playwright-based smoke tests designed to be run by AI agents — verify startup, routes, and critical flows before declaring a change safe.

---

## Why This Exists

AI coding agents are good at making changes. They are not good at knowing whether those changes broke something.

The typical agent loop ends with "I've updated the component" or "I've refactored the API route." What it rarely ends with is *evidence*. The agent made a change, it looks syntactically correct, the TypeScript compiler is happy — but did the app actually start? Do the routes return 200s? Does the homepage load without console errors?

Structured smoke tests give agents verifiable, machine-readable evidence that a change is safe before it's committed, pushed, or declared done. Instead of the agent asserting "this should work," it can run a suite, read structured JSON output, and either confirm the pass or surface the exact failure with a screenshot path and error message.

This repo is that suite.

---

## What Makes It Interesting

- **Agent-friendly output format** — results are emitted as structured JSON *and* a human-readable summary. An agent can parse the JSON to decide whether to proceed; a human can read the summary to understand what happened.
- **Startup checks first** — before testing routes, the suite verifies the dev server actually started and responds. Failures here are reported clearly so agents don't waste time testing a server that never came up.
- **Route matrix** — scenarios define a list of routes with expected status codes, content assertions, and optional timing thresholds. The suite walks the matrix and reports per-route results.
- **Browser + API checks** — Playwright drives a real browser for UI checks (homepage loads, no console errors, key elements visible) and also hits API endpoints directly for health/status verification.
- **Failure screenshots** — any test that fails in the browser captures a screenshot automatically. The path is included in the JSON output so an agent can reference it.
- **Scenario configs** — scenarios are plain TypeScript objects describing an app's routes, expected content, and API endpoints. Swapping scenarios means the same runner works for React apps, Next.js apps, or any HTTP server.

---

## Quickstart

```bash
# Install dependencies
npm install

# Make sure your dev server is running, then:
npm run smoke -- --scenario=scenarios/react-app.ts --base-url=http://localhost:3000

# Or run with a custom base URL
BASE_URL=http://localhost:3001 npm run smoke -- --scenario=scenarios/next-app.ts
```

Results are written to `smoke-results/` as:
- `results.json` — machine-readable, suitable for agent parsing
- `summary.txt` — human-readable pass/fail summary
- `screenshots/` — failure screenshots (if any)

---

## Example Workflow (Agent Perspective)

```
1. Agent makes a code change
2. Agent starts dev server (or confirms it's running)
3. Agent runs: npm run smoke -- --scenario=scenarios/react-app.ts
4. Agent reads smoke-results/results.json
5. If results.passed === true → proceed with commit
   If results.passed === false → read results.failures[], fix issues, re-run
```

A minimal agent prompt pattern:

```
After making changes, run the smoke tests and read the output.
Do not commit until results.json shows { "passed": true }.
If tests fail, read the failure messages and fix the root cause.
```

---

## Example `results.json` Shape

```json
{
  "passed": true,
  "timestamp": "2025-01-15T14:23:01.000Z",
  "scenario": "react-app",
  "baseUrl": "http://localhost:3000",
  "duration_ms": 4231,
  "summary": {
    "total": 12,
    "passed": 12,
    "failed": 0,
    "skipped": 0
  },
  "checks": {
    "startup": { "passed": true, "duration_ms": 312 },
    "routes": { "passed": true, "results": [...] },
    "api": { "passed": true, "results": [...] },
    "browser": { "passed": true, "results": [...] }
  },
  "failures": [],
  "screenshots": []
}
```

When something fails:

```json
{
  "passed": false,
  "failures": [
    {
      "check": "routes",
      "route": "/dashboard",
      "expected": 200,
      "actual": 404,
      "message": "Route returned 404, expected 200"
    },
    {
      "check": "browser",
      "route": "/",
      "message": "Console error: TypeError: Cannot read properties of undefined (reading 'map')",
      "screenshot": "smoke-results/screenshots/homepage-failure-1705327381.png"
    }
  ]
}
```

---

## What This Demonstrates

| Concept | Implementation |
|---|---|
| Playwright browser automation | `src/checks/startup.ts`, `src/checks/routes.ts` |
| Structured test output | `src/reporter.ts` |
| TypeScript config + strict mode | `tsconfig.json` |
| Agent-native test design | `SMOKE_TESTS.md`, scenario configs |
| Scenario-driven configuration | `scenarios/react-app.ts`, `scenarios/next-app.ts` |
| CI integration | `playwright.config.ts`, `examples/run-smoke-tests.sh` |

---

## Status

**Work in progress / portfolio piece.** The runner scaffolding and scenario configs are real and runnable. The individual check implementations are well-structured stubs with clear TODO markers showing what a full implementation would do. This is intentional — the design and structure are the thing being demonstrated, not a fully-shipped test framework.

If you're building on top of this, start with `src/checks/startup.ts` — it's the simplest check and a good model for the rest.

---

## Project Structure

```
src/
  runner.ts         # Orchestrates all checks, writes results
  reporter.ts       # Formats results as JSON + human summary
  checks/
    startup.ts      # Server startup verification
    routes.ts       # Route matrix checks
    api.ts          # API endpoint health checks
scenarios/
  react-app.ts      # Scenario config for a React SPA
  next-app.ts       # Scenario config for a Next.js app
examples/
  run-smoke-tests.sh
playwright.config.ts
tsconfig.json
package.json
```
