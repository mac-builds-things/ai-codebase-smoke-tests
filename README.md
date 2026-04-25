# ai-codebase-smoke-tests

Playwright smoke tests that give AI agents verifiable evidence before they commit a change.

Agents make changes but can't tell if they broke something. These smoke tests give them verifiable evidence. Run the suite, read the JSON, and either proceed or fix the failure — no assertions, no guessing, no "it should be fine."

**Pass:**
```json
{
  "passed": true,
  "duration_ms": 4231,
  "summary": { "total": 12, "passed": 12, "failed": 0 },
  "failures": [],
  "screenshots": []
}
```

**Fail:**
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

## Setup

```bash
npm install
```

Set your base URL either inline or via env:

```bash
export BASE_URL=http://localhost:3000
```

## Running

```bash
# Run against a specific scenario
npm run smoke -- --scenario=scenarios/react-app.ts

# Override base URL inline
BASE_URL=http://localhost:3001 npm run smoke -- --scenario=scenarios/next-app.ts
```

Results land in `smoke-results/`:
- `results.json` — machine-readable, for agents
- `summary.txt` — human-readable pass/fail
- `screenshots/` — failure screenshots, paths included in JSON

## Writing a scenario

```typescript
// scenarios/my-app.ts
import type { SmokeTestScenario } from "../src/types";

const scenario: SmokeTestScenario = {
  name: "my-app",
  routes: [
    { path: "/", expectedStatus: 200, expectedContent: "Welcome" },
    { path: "/dashboard", expectedStatus: 200 },
    { path: "/missing", expectedStatus: 404 },
  ],
  apiEndpoints: [
    { path: "/api/health", expectedStatus: 200 },
  ],
};

export default scenario;
```

Drop the file in `scenarios/`, pass it with `--scenario=`, done.

## What's checked

- **Startup** — dev server responds before any other checks run
- **Routes** — status codes, optional content assertions, optional timing thresholds
- **API endpoints** — direct HTTP hits, separate from browser checks
- **Console errors** — any `console.error` or uncaught exception in the browser fails the run
- **Failure screenshots** — captured automatically, path written into `results.json`

## Designed for agents

- **`results.json` is the contract** — agents read `passed` first, then iterate `failures[]`. No parsing logs, no grepping output.
- **Failures are actionable** — each failure includes check type, route, expected vs actual, and screenshot path. Enough context to fix without re-running.
- **Composable in any loop** — run → read JSON → fix → re-run. Works from a shell command, a script, or an agent tool call.

---
Work in progress. Runner scaffolding and scenario configs are real and runnable; check implementations are well-structured stubs. Start with `src/checks/startup.ts`.
