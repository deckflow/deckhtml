/**
 * HTML Loader Module
 * Uses Playwright to load and render HTML files.
 *
 * Browser launch is fully caller-controlled (DH-P0-006):
 *   - `executablePath` (option or DECKHTML_CHROMIUM_EXECUTABLE_PATH env) selects the
 *     Chromium binary; falls back to Playwright's bundled build.
 *   - `userDataDir` (option or DECKHTML_BROWSER_DATA_DIR env) opts into a persistent
 *     profile. By default a fresh temp directory is created per process and removed
 *     on exit — the loader never writes to ~/browser-data unless asked to.
 *   - `headless` defaults to true.
 *   - Callers may inject their own `browser` (Browser) or `browserContext`
 *     (BrowserContext); the loader will not close a caller-owned browser.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, Browser, Page, BrowserContext } from 'playwright-core';
import { getSlideWidthPx, getSlideHeightPx } from './utils/coordinate';
import { setupResourcePolicyOnPage } from './utils/resource-policy';
import { gotoAndSettle } from './utils/navigate';

/** Caller-controlled browser launch options. */
export interface BrowserLaunchOptions {
  /** Explicit Chromium executable path. Defaults to DECKHTML_CHROMIUM_EXECUTABLE_PATH env, then Playwright's bundle. */
  executablePath?: string;
  /** Persistent profile directory. Defaults to DECKHTML_BROWSER_DATA_DIR env, then a per-process temp dir. */
  userDataDir?: string;
  /** Headless mode (default true). */
  headless?: boolean;
  /** Additional Chromium args. */
  args?: string[];
}

/** A caller-supplied browser instance. The loader will reuse it without owning it. */
export interface BrowserInjectionOptions {
  /** Inject an existing Playwright Browser; loader will not launch or close it. */
  browser?: Browser;
  /** Inject an existing Playwright BrowserContext; loader will not launch or close it. */
  browserContext?: BrowserContext;
}

const ENV_EXECUTABLE_PATH = process.env.DECKHTML_CHROMIUM_EXECUTABLE_PATH;
const ENV_USER_DATA_DIR = process.env.DECKHTML_BROWSER_DATA_DIR;

// Shared launched browser (when the loader owns it). Caller-injected browsers are
// never tracked here.
let ownedBrowser: Browser | null = null;
let ownedContext: BrowserContext | null = null;
let ownedUserDataDir: string | null = null;

process.on('beforeExit', async () => {
  await cleanupOwnedBrowser();
});

/**
 * Explicitly close the process-owned browser and remove its temp profile.
 * Call this in test teardown or when a long-running host is done with deckhtml.
 */
export async function closeOwnedBrowser(): Promise<void> {
  await cleanupOwnedBrowser();
}

async function cleanupOwnedBrowser(): Promise<void> {
  const ctx = ownedContext;
  const browser = ownedBrowser;
  const dir = ownedUserDataDir;
  ownedContext = null;
  ownedBrowser = null;
  ownedUserDataDir = null;
  if (ctx) await ctx.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  if (dir) {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

function resolveExecutablePath(option?: string): string | undefined {
  return option ?? ENV_EXECUTABLE_PATH ?? undefined;
}

function resolveUserDataDir(option?: string): string | undefined {
  return option ?? ENV_USER_DATA_DIR ?? undefined;
}

/**
 * Structured diagnostic thrown when the browser cannot be launched.
 */
export class BrowserUnavailableError extends Error {
  readonly ruleId = 'DECKHTML_BROWSER_UNAVAILABLE';
  constructor(
    message: string,
    readonly recovery?: string,
  ) {
    super(message);
    this.name = 'BrowserUnavailableError';
  }
}

export class HTMLLoader {
  private browser: BrowserContext | null = null;
  private page: Page | null = null;
  /** True when the loader is using a caller-injected context (do not close). */
  private borrowedContext = false;

  /**
   * Initialize browser instance.
   */
  async init(
    launchOptions?: BrowserLaunchOptions,
    injection?: BrowserInjectionOptions,
  ): Promise<void> {
    // Caller-injected context takes precedence.
    if (injection?.browserContext) {
      this.browser = injection.browserContext;
      this.borrowedContext = true;
      return;
    }
    if (injection?.browser) {
      // Reuse a caller-owned browser; create a fresh context from it.
      if (ownedContext && ownedContext.browser() === injection.browser) {
        this.browser = ownedContext;
      } else {
        this.browser = await injection.browser.newContext();
        // Track it so pages are closed, but do not close the caller's browser.
        // We won't auto-close this context either since the browser is caller-owned.
        this.borrowedContext = true;
      }
      return;
    }

    // Reuse an already-owned context from this process.
    if (ownedContext) {
      this.browser = ownedContext;
      return;
    }

    const executablePath = resolveExecutablePath(launchOptions?.executablePath);
    const userDataDirOption = resolveUserDataDir(launchOptions?.userDataDir);
    const headless = launchOptions?.headless ?? true;
    const extraArgs = launchOptions?.args ?? [];

    try {
      if (userDataDirOption) {
        // Caller explicitly wants a persistent profile.
        ownedContext = await chromium.launchPersistentContext(userDataDirOption, {
          headless,
          executablePath,
          ignoreHTTPSErrors: true,
          args: ['--allow-running-insecure-content', ...extraArgs],
        });
        ownedUserDataDir = null; // caller owns the dir; do not delete it
      } else {
        // Default: ephemeral temp profile, removed on process exit.
        const tempDir = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), 'deckhtml-profile-'),
        );
        ownedContext = await chromium.launchPersistentContext(tempDir, {
          headless,
          executablePath,
          ignoreHTTPSErrors: true,
          args: ['--allow-running-insecure-content', ...extraArgs],
        });
        ownedUserDataDir = tempDir;
      }
      ownedBrowser = ownedContext.browser();
      this.browser = ownedContext;
      this.borrowedContext = false;

      ownedContext.on('close', () => {
        ownedContext = null;
        ownedBrowser = null;
        // Best-effort cleanup of the temp profile.
        const dir = ownedUserDataDir;
        ownedUserDataDir = null;
        if (dir) {
          fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
        }
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error);
      throw new BrowserUnavailableError(
        `Failed to launch Chromium for HTML inspection: ${message}`,
        executablePath
          ? `Verify executablePath "${executablePath}" is a valid Chromium binary.`
          : `Install Playwright browsers (npx playwright-core install chromium) or set DECKHTML_CHROMIUM_EXECUTABLE_PATH to an existing Chromium.`,
      );
    }
  }

  /**
   * Load HTML file and prepare for inspection
   */
  async loadHTML(
    inputPath: string,
    viewport?: { width: number; height: number },
    options?: { allowLocalResources?: boolean; resourcePolicy?: import('./utils/resource-policy').ResourcePolicy; diagnostics?: import('./utils/resource-policy').ResourceDiagnostic[] }
  ): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    this.page = await this.browser.newPage();
    await this.prepareLoadedPage(this.page, inputPath, viewport, options);
    return this.page;
  }

  /**
   * Open a new Playwright page, load HTML, and return it (caller closes the page).
   */
  async loadHTMLInNewPage(
    inputPath: string,
    viewport?: { width: number; height: number },
    options?: { allowLocalResources?: boolean; resourcePolicy?: import('./utils/resource-policy').ResourcePolicy; diagnostics?: import('./utils/resource-policy').ResourceDiagnostic[] }
  ): Promise<Page> {
    if (!this.browser) {
      throw new Error('Browser not initialized. Call init() first.');
    }

    const page = await this.browser.newPage();
    await this.prepareLoadedPage(page, inputPath, viewport, options);
    return page;
  }

  private async prepareLoadedPage(
    page: Page,
    inputPath: string,
    viewport?: { width: number; height: number },
    options?: { allowLocalResources?: boolean; resourcePolicy?: import('./utils/resource-policy').ResourcePolicy; diagnostics?: import('./utils/resource-policy').ResourceDiagnostic[] }
  ): Promise<void> {
    const w = viewport?.width ?? getSlideWidthPx();
    const h = viewport?.height ?? getSlideHeightPx();
    await page.setViewportSize({ width: w, height: h });

    const { documentUrl } = await setupResourcePolicyOnPage(page, inputPath, {
      allowLocalResources: options?.allowLocalResources,
      policy: options?.resourcePolicy,
      diagnostics: options?.diagnostics,
    });

    // Match prior slide-isolation settle (entrance animations / delayed reveals).
    await gotoAndSettle(page, documentUrl, { settleMs: 3000 });
  }

  /**
   * Get the current page instance
   */
  getPage(): Page {
    if (!this.page) {
      throw new Error('No page loaded. Call loadHTML() first.');
    }
    return this.page;
  }

  /**
   * Close this loader's page. Does not close a caller-injected browser or the
   * process-owned shared context (other loaders / parallel inspect may still
   * need it). The owned context is closed on process exit or via closeOwnedBrowser().
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    // Keep this.browser reference so parallel-inspect can open new pages from
    // the shared owned context after the loader's primary page is closed.
  }
}
