# Smoke Test Philosophy

This document describes the design principles behind this smoke test suite — what to test, what not to test, how to structure scenarios, and why "agent-friendly output" is a first-class design goal.

---

## The Core Problem

A smoke test suite has two audiences:

1. **Humans** — developers who run tests manually, read CI output, and need to understand what failed.
2. **AI agents** — autonomous systems that run tests programmatically, read output, and decide what to do next.

Traditional test suites are designed for audience #1. Output is formatted for terminal readability. Failures are described in prose. Pass/fail status is implicit in exit codes and formatted text.

AI agents are in audience #2. They can't "read" a terminal the way a human does. They need output that is unambiguous, parseable, and actionable. They need to know: **did this pass?** If not: **exactly what failed, and what information do I need to fix it?**

This suite is designed with audience #2 as the primary consumer, while remaining readable for audience #1.

---

## Agent-Friendly Output: What It Means Practically

### 1. A single top-level `passed` boolean

Every results file has `{ "passed": true/false }` at the root. An agent should be able to make a go/no-go decision by reading one field. No parsing of prose, no counting failures in a list, no interpreting exit codes.

### 2. All failures in a flat `failures` array

Rather than nesting failures inside each check type, the top-level `failures` array contains every failure across all checks. An agent reading results doesn't need to know the tree structure — it can read `results.failures` and get a complete picture.

Each failure entry includes:
- `check` — which check type caught it (`startup`, `routes`, `api`, `browser`)
- `route` or `endpoint` — the specific target
- `expected` / `actual` — what was expected and what actually happened
- `message` — a plain-English description of the failure
- `screenshot` (optional) — path to a failure screenshot if one was captured

### 3. Screenshot paths in the output

Browser failures capture screenshots. The screenshot path is included in the failure object so an agent can reference it, read it, or include it in a failure report. Screenshots are stored in a consistent location relative to the project root.

### 4. Deterministic output location

Results are always written to `smoke-results/results.json` and `smoke-results/summary.txt`. An agent doesn't need to parse command output to find the results — it knows where to look.

### 5. Non-zero exit code on failure

The runner exits with code `1` if any check failed, `0` if all passed. This is compatible with CI pipelines and with agent-run subprocesses that check exit codes.

### 6. Timing data included

Every check includes a `duration_ms` field. This matters because agents often can't distinguish "the test failed" from "the test hung." If duration is unexpectedly high, it's a signal that something is slow or stuck, not just broken.

---

## What to Test

Smoke tests verify that an application is *alive and structurally correct*. They are not comprehensive functional tests. The right question is: **"Is this app in a state where a human could use it?"**

### Always test:

- **Server startup** — does the dev server respond at the base URL within a reasonable timeout?
- **Homepage** — does the root route return 200 and render without console errors?
- **Key routes** — the 5–10 routes that, if broken, would make the app unusable (dashboard, login, main feature pages)
- **API health endpoint** — `/api/health` or equivalent; should return 200 with a simple status
- **No console errors on load** — any `console.error` during page load is a signal worth capturing
- **Critical API routes** — the API endpoints that back the key routes

### Optionally test:

- **Authentication flows** — if the app has auth, can you reach a login page? (Don't test full auth flows in smoke tests)
- **Static assets** — are CSS/JS bundles returning 200s? (Useful if you've made build changes)
- **404 handling** — does an unknown route return a proper 404?

### Do NOT test:

- **Business logic correctness** — smoke tests are not unit tests. Don't verify that a calculation returns the right answer.
- **Full user flows** — don't write a smoke test that creates an account, logs in, fills a form, and submits it. That's an integration test.
- **Visual regression** — smoke tests are not screenshot comparison tests. Don't assert that a button is the right shade of blue.
- **Performance** — don't set hard performance budgets in smoke tests. Timing data is informational, not a pass/fail gate (unless startup time exceeds a generous threshold).
- **Edge cases** — smoke tests cover the happy path. Edge cases belong in unit/integration tests.
- **Authenticated routes** — unless you have a robust seeded test user setup, skip routes that require login.

The rule of thumb: **if you'd want to know about it in the first 60 seconds after deploying a change, it belongs in a smoke test.**

---

## How to Structure Scenarios

A scenario is a TypeScript object (or file exporting a typed config) that describes an application. It is the single place where you specify:

```typescript
export const scenario: ScenarioConfig = {
  name: "my-app",
  baseUrl: process.env.BASE_URL ?? "http://localhost:3000",

  startup: {
    timeoutMs: 10_000,      // how long to wait for the server
    expectedStatusCode: 200, // what we expect from the root route
  },

  routes: [
    { path: "/", expectedStatus: 200, contentContains: ["Welcome"] },
    { path: "/about", expectedStatus: 200 },
    { path: "/missing-page", expectedStatus: 404 },
  ],

  api: {
    healthEndpoint: "/api/health",
    routes: [
      { path: "/api/users", expectedStatus: 200 },
    ],
  },

  browser: {
    homepagePath: "/",
    expectNoConsoleErrors: true,
    requiredSelectors: ["nav", "main", "[data-testid='app-root']"],
  },
};
```

**Design principles for scenarios:**

- Keep them simple. A scenario is a config, not test code.
- Use `process.env.BASE_URL` as the default so scenarios are portable across environments.
- Don't put assertions in scenarios. The runner handles assertion logic. Scenarios just describe *what* to check.
- One scenario per distinct application type. If your monorepo has a frontend and an admin panel, write two scenarios.
- Commit scenarios alongside the app they describe, not in a separate repo.

---

## Structuring for CI Integration

The smoke test suite is designed to run as a CI step — specifically, as a post-deploy verification step or a pre-merge check.

**Recommended CI placement:**
1. Build and deploy to a preview environment (or start a dev server in the CI container)
2. Run smoke tests against the preview URL
3. If smoke tests pass → proceed to merge/deploy
4. If smoke tests fail → block and report

**Environment variable convention:**

```
BASE_URL=https://preview-abc123.vercel.app npm run smoke -- --scenario=scenarios/next-app.ts
```

**CI artifacts:**
- Upload `smoke-results/` as a CI artifact. This lets you download and inspect failure screenshots and the full JSON output even after the CI job ends.

**Timeout guidance:**
- Startup check: 15 seconds max for a dev server, 10 seconds for a preview deploy
- Per-route check: 5 seconds
- Full suite: should complete in under 60 seconds for most apps

---

## Failure Capture Best Practices

When a browser-based check fails:

1. Capture a full-page screenshot immediately on failure
2. Capture the browser console log (errors and warnings)
3. Capture the page URL at time of failure
4. Include all three in the failure object

Agents use screenshots as evidence when reporting failures and as context when attempting fixes. A screenshot path that doesn't exist (because the screenshot wasn't captured) is useless. Always capture before navigating away.

Screenshot naming convention: `{check-type}-{route-slug}-{timestamp}.png`
Example: `browser-dashboard-1705327381.png`

---

## Summary

| Principle | Rule |
|---|---|
| Agent-readable output | `passed` boolean at root, flat `failures` array |
| Evidence-first | Screenshot paths in failure objects, never just messages |
| Scenario-driven | Apps described as config objects, not hardcoded test logic |
| Scope discipline | Smoke tests verify aliveness, not correctness |
| CI-compatible | Non-zero exit on failure, deterministic output path |
| Fast | Full suite should complete in <60 seconds |
