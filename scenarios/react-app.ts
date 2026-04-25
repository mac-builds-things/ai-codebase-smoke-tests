/**
 * scenarios/react-app.ts
 *
 * Smoke test scenario for a typical React SPA (Create React App / Vite).
 *
 * Assumptions:
 *   - Dev server runs on port 3000 by default
 *   - React Router handles client-side routing
 *   - No server-side rendering — all routes return the same HTML shell
 *   - API backend runs separately (or is proxied by the dev server)
 *
 * Usage:
 *   npm run smoke -- --scenario=scenarios/react-app.ts
 *   BASE_URL=http://localhost:5173 npm run smoke -- --scenario=scenarios/react-app.ts
 */

import type { ScenarioConfig } from "../src/types";

export const scenario: ScenarioConfig = {
  name: "react-app",

  // Override with BASE_URL env var or --base-url CLI flag
  baseUrl: process.env.BASE_URL ?? "http://localhost:3000",

  startup: {
    // React dev server can be slow to start on first request
    timeoutMs: 15_000,
    // The dev server itself always returns 200 for any path (client-side routing)
    expectedStatusCode: 200,
  },

  // -------------------------------------------------------------------
  // Route matrix
  //
  // For a React SPA with client-side routing, every route returns 200
  // from the dev server (it serves index.html for all paths). We verify
  // the HTML shell loads, then rely on browser checks for actual content.
  //
  // In production (e.g. Vercel/Nginx), you may want to check that /dashboard
  // returns 200 (meaning the rewrite rules are configured correctly) rather
  // than 404 (meaning they're not).
  // -------------------------------------------------------------------
  routes: [
    {
      path: "/",
      expectedStatus: 200,
      // The HTML shell must reference the app root and a bundle
      contentContains: ["<div id=\"root\">", "<script"],
    },
    {
      path: "/about",
      expectedStatus: 200,
    },
    {
      path: "/dashboard",
      expectedStatus: 200,
    },
    {
      path: "/settings",
      expectedStatus: 200,
    },
    {
      // Static assets should respond correctly
      path: "/favicon.ico",
      expectedStatus: 200,
    },
    {
      // In a properly configured SPA deployment, unknown paths return 200
      // (the shell) rather than 404. This check verifies the rewrite config.
      // Change to 404 if your server returns 404 for unknown paths.
      path: "/this-path-definitely-does-not-exist",
      expectedStatus: 200,
      skip: false, // Set to true if your server legitimately 404s unknown paths
    },
  ],

  // -------------------------------------------------------------------
  // API checks
  //
  // Assumes the API is either:
  //   (a) running separately and proxied via the dev server at /api/*
  //   (b) a mock server started alongside the dev server
  //
  // Adjust paths to match your app's actual API structure.
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
        // If your app has a /api/me or /api/user endpoint
        path: "/api/me",
        expectedStatus: 200,
        // Don't assert on body — the shape depends on whether a test user is seeded
      },
      {
        // A public list endpoint should be accessible without auth
        path: "/api/items",
        expectedStatus: 200,
      },
      {
        // Verify that unknown API routes return 404, not 500
        path: "/api/nonexistent-endpoint",
        expectedStatus: 404,
      },
    ],
  },

  // -------------------------------------------------------------------
  // Browser checks
  //
  // Playwright opens the homepage in a real browser and checks:
  //   - No console errors on load
  //   - Key structural elements are present in the DOM
  //   - Page title / visible text matches expectations
  // -------------------------------------------------------------------
  browser: {
    homepagePath: "/",
    expectNoConsoleErrors: true,
    pageLoadTimeoutMs: 10_000,
    // These selectors must exist in the DOM after the app mounts.
    // Adjust to match your app's actual structure.
    requiredSelectors: [
      "#root",           // React root element
      "nav",             // Navigation should always be present
    ],
    requiredText: [
      // Add visible text that should appear on a healthy homepage
      // e.g. your app name, a headline, "Sign in" link
      // Leave empty if homepage content varies based on auth state
    ],
  },
};
