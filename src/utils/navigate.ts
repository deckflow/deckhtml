/**
 * Resilient Playwright navigation helpers.
 * Avoid hard-failing on hung CDN / image requests (networkidle never settles).
 */

import type { Page } from 'playwright';

export interface GotoAndSettleOptions {
  /** Timeout for document navigation (domcontentloaded). Default 30s. */
  navigationTimeoutMs?: number;
  /** Best-effort wait for idle network; never throws. Default 10s. */
  networkIdleTimeoutMs?: number;
  /** Cap for document.fonts.ready. Default 3s. */
  fontTimeoutMs?: number;
  /** Post-load settle for CSS animations. Default 2s. */
  settleMs?: number;
}

/**
 * Navigate to a document and settle fonts/network without blocking forever
 * on unreachable subresources.
 */
export async function gotoAndSettle(
  page: Page,
  documentUrl: string,
  options?: GotoAndSettleOptions
): Promise<void> {
  const navigationTimeoutMs = options?.navigationTimeoutMs ?? 30_000;
  const networkIdleTimeoutMs = options?.networkIdleTimeoutMs ?? 10_000;
  const fontTimeoutMs = options?.fontTimeoutMs ?? 3_000;
  const settleMs = options?.settleMs ?? 2_000;

  // domcontentloaded: do not wait for images/stylesheets (load/networkidle can hang).
  await page.goto(documentUrl, {
    waitUntil: 'domcontentloaded',
    timeout: navigationTimeoutMs,
  });

  // Best-effort: let healthy CDN assets finish; ignore hung connections.
  await page
    .waitForLoadState('networkidle', { timeout: networkIdleTimeoutMs })
    .catch(() => {});

  await Promise.race([
    page.evaluate(() => document.fonts.ready),
    page.waitForTimeout(fontTimeoutMs),
  ]);

  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
  }
}
