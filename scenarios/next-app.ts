/**
 * scenarios/next-app.ts
 *
 * Smoke test scenario for a Next.js App Router application.
 *
 * Key differences from a React SPA:
 *   - Server-side rendering means routes can genuinely 404 at the HTTP level
 *   - API routes live in app/api/** and are real HTTP endpoints
 *   - Route segments may require auth — we check public routes only
 *   - The /api/health route is a recommended addition (not built in to Next.js)
 *
 * Usage:
 *   npm run smoke -- --scenario=scenarios/next-app.ts
 *   BASE_URL=https://preview-abc123.vercel.app npm run smoke -- --scenario=scenarios/next-app.ts
 */

import type { ScenarioConfig } from "../src/types";

export const scenario: ScenarioConfig = {
  name: "next-app",

  baseUrl: process.env.BASE_URL ?? "http://localhost:3000",

  startup: {
    // Next.js dev mode compiles on first request — give it a generous timeout
    timeoutMs: 30_000,
    expectedStatusCode: 200,
    // Hit the health endpoint during startup if it exists, otherwise "/"
    healthPath: process.env.HEALTH_PATH ?? "/",
  },

  // -------------------------------------------------------------------
  // Route matrix
  //
  // Unlike a React SPA, Next.js returns real HTTP status codes per route.
  // A missing page component returns 404. A server error returns 500.
  // This makes route checks more meaningful — they verify that the
  // pages actually exist and render without crashing.
  // -------------------------------------------------------------------
  routes: [
    {
      path: "/",
      expectedStatus: 200,
      // Next.js should always include these in the HTML
      contentContains: ["<!DOCTYPE html>", "__NEXT_DATA__"],
    },
    {
      path: "/about",
      expectedStatus: 200,
    },
    {
      path: "/blog",
      expectedStatus: 200,
    },
    {
      // Pricing page — verify it exists (common to break when removing features)
      path: "/pricing",
      expectedStatus: 200,
    },
    {
      // Dashboard is typically auth-protected; expect a redirect to /login
      // If your middleware redirects unauthenticated users, this should 307
      path: "/dashboard",
      expectedStatus: 307, // Next.js middleware redirect
      // Change to 200 if dashboard is public, or 401 if you return that instead
    },
    {
      // Login page must always be public
      path: "/login",
      expectedStatus: 200,
    },
    {
      // Verify 404 handling — a non-existent page should return 404, not crash
      path: "/page-that-absolutely-does-not-exist",
      expectedStatus: 404,
    },
    {
      // Verify that the Next.js not-found page renders correctly
      // (i.e., the 404 page itself doesn't error)
      path: "/_not-found",
      expectedStatus: 404,
      skip: true, // Skip unless you've added this route explicitly
    },
  ],

  // -------------------------------------------------------------------
  // API checks
  //
  // Next.js App Router API routes live in app/api/**/route.ts.
  // These are real HTTP endpoints — checks are meaningful.
  //
  // Recommended: add a /api/health route to your Next.js app:
  //   app/api/health/route.ts → return Response.json({ status: "ok" })
  // -------------------------------------------------------------------
  api: {
    healthEndpoint: "/api/health",
    routes: [
      {
        path: "/api/health",
        expectedStatus: 200,
        expectedJsonContains: { status: "ok" },
      },
      {
        // If your app exposes a public API (e.g. for fetching public content)
        path: "/api/posts",
        expectedStatus: 200,
      },
      {
        // Auth-protected endpoint should return 401 without credentials
        path: "/api/user/profile",
        expectedStatus: 401,
      },
      {
        // Verify the RSC payload endpoint isn't accidentally exposed
        path: "/api/nonexistent",
        expectedStatus: 404,
      },
      {
        // Next.js-specific: verify that __nextjs internal routes are not
        // leaking sensitive build information
        path: "/_next/static/chunks/app/layout.js",
        expectedStatus: 200, // Should be served (it's a public static asset)
        skip: true, // Skip unless you want to verify bundle serving
      },
    ],
  },

  // -------------------------------------------------------------------
  // Browser checks
  //
  // With Next.js, we can be more specific about expected DOM structure
  // because SSR renders predictable HTML.
  // -------------------------------------------------------------------
  browser: {
    homepagePath: "/",
    expectNoConsoleErrors: true,
    pageLoadTimeoutMs: 15_000, // Next.js SSR pages can be slower than SPAs on first load

    requiredSelectors: [
      "html",
      "body",
      "nav",   // Your app's navigation component
      "main",  // Main content area
      // Add your app's specific layout selectors here:
      // "[data-testid='hero-section']",
      // "footer",
    ],

    requiredText: [
      // Add text that must appear on a healthy homepage
      // e.g. your product name, a headline, a CTA
      // "Get started",
      // "Sign in",
    ],
  },
};
