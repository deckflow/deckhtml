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

    // Create new page
    this.page = await this.browser.newPage();

    const w = viewport?.width ?? getSlideWidthPx();
    const h = viewport?.height ?? getSlideHeightPx();
    await this.page.setViewportSize({ width: w, height: h });

    const { documentUrl } = await setupResourcePolicyOnPage(this.page, inputPath, {
      allowLocalResources: options?.allowLocalResources,
    });

    await this.page.goto(documentUrl, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Wait for fonts and external resources to load
    await this.page.evaluate(() => {
      return document.fonts.ready;
    });

    // Wait for any animations or dynamic content
    await this.page.waitForTimeout(2000);

    return this.page;
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
