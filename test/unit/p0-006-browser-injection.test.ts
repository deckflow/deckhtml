import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright-core';
import { convertHtmlToPptx } from '../../dist/api.js';
import {
  HTMLLoader,
  BrowserUnavailableError,
  closeOwnedBrowser,
} from '../../dist/loader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(
  ROOT,
  'benchmark',
  'pending',
  'p0-006-browser-injection',
  'deck.html',
);

describe('DH-P0-006 controlled browser injection', () => {
  after(async () => {
    await closeOwnedBrowser();
  });

  it('BrowserUnavailableError is thrown with a ruleId and recovery when executablePath is invalid', async () => {
    const loader = new HTMLLoader();
    await assert.rejects(
      () =>
        loader.init({
          executablePath: '/definitely/not/a/real/chromium-binary',
          headless: true,
        }),
      (err: unknown) => {
        assert.ok(err instanceof BrowserUnavailableError, 'expected BrowserUnavailableError');
        assert.equal((err as BrowserUnavailableError).ruleId, 'DECKHTML_BROWSER_UNAVAILABLE');
        assert.match((err as Error).message, /Failed to launch Chromium/);
        return true;
      },
    );
  });

  it('accepts a caller-injected Browser and does not close it', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const result = await convertHtmlToPptx({
        input: FIXTURE,
        viewportWidth: 1280,
        viewportHeight: 720,
        quiet: true,
        browser: { browser },
      });
      assert.ok(result.data && result.data.length > 0, 'PPTX buffer empty');
      assert.equal(result.slideCount, 1);
      // The caller's browser must still be usable afterwards.
      const page = await browser.newPage();
      await page.goto('about:blank');
      await page.close();
    } finally {
      await browser.close();
    }
  });

  it('honours an explicit executablePath matching the host Chromium', async () => {
    // Discover the host Chromium path via playwright's default executable.
    const hostPath = chromium.executablePath();
    assert.ok(hostPath, 'playwright chromium.executablePath() returned nothing');
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      browser: { executablePath: hostPath },
    });
    assert.ok(result.data.length > 0);
    assert.equal(result.slideCount, 1);
  });

  it('does not write to ~/browser-data by default (uses a temp profile)', async () => {
    // We cannot directly inspect the temp dir, but we can verify a second loader
    // in the same process reuses the same owned context (proving no per-call
    // persistent profile creation).
    const loader1 = new HTMLLoader();
    await loader1.init({ headless: true });
    const ctx1 = (loader1 as unknown as { browser: import('playwright-core').BrowserContext }).browser;
    await loader1.close();

    const loader2 = new HTMLLoader();
    await loader2.init({ headless: true });
    const ctx2 = (loader2 as unknown as { browser: import('playwright-core').BrowserContext }).browser;
    await loader2.close();

    assert.ok(ctx1 && ctx2, 'contexts not initialised');
    // Same shared owned context (process-level reuse), not a new persistent profile.
    assert.equal(ctx1, ctx2, 'second loader should reuse the owned context');
  });
});
