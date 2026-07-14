/**
 * HTML Loader Module
 * Uses Playwright to load and render HTML files
 */

import os from "node:os";
import path from "node:path";
import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { getSlideWidthPx, getSlideHeightPx } from './utils/coordinate';
import { setupResourcePolicyOnPage } from './utils/resource-policy';

// 浏览器数据目录, 默认为用户主目录下的 browser-data 文件夹
const browserDataDir = process.env.BROWSER_DATA_DIR || path.join(os.homedir(), "browser-data");
let browser: BrowserContext | null = null;

process.on('beforeExit', async () => {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
  }
});

export class HTMLLoader {
  private browser: BrowserContext | null = null;
  private page: Page | null = null;

  /**
   * Initialize browser instance
   */
  async init(): Promise<void> {
    if (browser) {
      this.browser = browser;
      return;
    }
    this.browser = await chromium.launchPersistentContext(browserDataDir, {
      headless: true,
    });
    browser = this.browser;
    browser.on('close', () => {
      browser?.close().catch(() => {});
      browser = null;
    });
  }

  /**
   * Load HTML file and prepare for inspection
   */
  async loadHTML(
    inputPath: string,
    viewport?: { width: number; height: number },
    options?: { allowLocalResources?: boolean }
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
    options?: { allowLocalResources?: boolean }
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
    options?: { allowLocalResources?: boolean }
  ): Promise<void> {
    const w = viewport?.width ?? getSlideWidthPx();
    const h = viewport?.height ?? getSlideHeightPx();
    await page.setViewportSize({ width: w, height: h });

    const { documentUrl } = await setupResourcePolicyOnPage(page, inputPath, {
      allowLocalResources: options?.allowLocalResources,
    });

    await page.goto(documentUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    await page.evaluate(() => document.fonts.ready);
    // Match slide-isolation settle: entrance animations / delayed reveals.
    await page.waitForTimeout(3000);
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
   * Close browser and cleanup
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
  }
}
