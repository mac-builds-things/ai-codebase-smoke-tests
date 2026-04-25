/**
 * utils/screenshot.ts
 *
 * Capture a full-page screenshot and return the path.
 * Returns null if the capture fails (we never want screenshot failures
 * to mask the actual test failure).
 */

import path from "path";
import type { Page } from "playwright";

export async function captureScreenshot(
  page: Page,
  outputDir: string,
  name: string
): Promise<string | null> {
  const timestamp = Date.now();
  const filename = `${name}-${timestamp}.png`;
  const screenshotPath = path.join(outputDir, "screenshots", filename);

  try {
    await page.screenshot({
      path: screenshotPath,
      fullPage: true,
    });
    return screenshotPath;
  } catch {
    // Screenshot failures are silently swallowed — they're supplementary evidence,
    // not the primary failure signal.
    return null;
  }
}
