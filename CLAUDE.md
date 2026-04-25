# CLAUDE.md

## Project

TypeScript, Playwright. Runner in `src/runner.ts` orchestrates all checks. Reporter in `src/reporter.ts` formats output for agents (structured JSON) and humans (rich text). Checks organized in `src/checks/` (`startup.ts`, `routes.ts`, `api.ts`). Scenarios in `scenarios/` (`react-app.ts`, `next-app.ts`). Screenshot utility in `src/utils/screenshot.ts`.

## Commands

```
npm run smoke                                    # Run all smoke tests (default: localhost:3000)
BASE_URL=http://localhost:4000 npm run smoke     # Against a specific URL
npm run test                                     # Playwright test suite
npx playwright show-report                       # View last test report
```

## Scenario format

Each scenario exports a `SmokeTestScenario` object with:

- `name` — human-readable label
- `baseUrl` — target origin
- `startup` — `{ title, maxTTFB }` for the initial server response check
- `routes` — array of `{ path, expectedStatus }` entries
- `api` — health endpoint + additional routes to verify
- `assertions` — text/element checks on page content

## What every smoke test must cover

1. Server responds (startup check)
2. Homepage loads without console errors
3. At least 3 routes respond with expected status codes
4. At least 1 API endpoint responds correctly
5. No 500 errors anywhere in the route matrix

## Conventions

- Results must be machine-readable: reporter always outputs JSON to stdout, human summary to stderr
- Screenshots are captured on failure automatically — don't manually add screenshot calls in scenarios
- `maxTTFB` should be `3000ms` for local dev, `5000ms` for CI
- A smoke test that takes more than 60s total has scope creep — split it

## Agent notes

Smoke tests are meant to be run by agents after making changes. Read the JSON output from `reporter.ts` — it has a `passed` boolean at the top level. If `passed: false`, check the `failures` array for specific routes/checks that failed. When adding a new scenario, use `scenarios/react-app.ts` as the reference.
