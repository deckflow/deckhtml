/**
 * HTML → PNG export via Playwright viewport screenshots.
 */

import type { Page } from 'playwright';
import { HTMLLoader } from './loader';
import {
  ElementInspector,
  type SlideContainerDiscovery,
} from './inspector';
import { setViewportPixels } from './utils/coordinate';
import { runQuietly } from './utils/quiet';
import { EMPTY_CONVERSION_STATS, type ConversionStats } from './conversion-report';
import type { ConversionOptions } from './types';

export interface PngConversionResult {
  /** One PNG buffer per detected page/slide, in order. */
  images: Buffer[];
  slideCount: number;
  stats?: ConversionStats;
}

function resolveInputPaths(options: ConversionOptions): string[] {
  if (options.inputs?.length) return options.inputs;
  if (options.input) return [options.input];
  throw new Error('At least one input file is required (use input or inputs).');
}

function resolveViewport(
  options: ConversionOptions
): { width: number; height: number } {
  return {
    width: options.viewportWidth ?? 1280,
    height: options.viewportHeight ?? 720,
  };
}

async function captureViewportPng(
  page: Page,
  viewport: { width: number; height: number },
  slideSelector?: string | null
): Promise<Buffer> {
  await page.emulateMedia({ media: 'screen' });

  const screenshotOptions = {
    type: 'png' as const,
    animations: 'disabled' as const,
  };

  if (slideSelector) {
    return page.locator(slideSelector).first().screenshot(screenshotOptions);
  }

  return page.screenshot({
    ...screenshotOptions,
    clip: { x: 0, y: 0, width: viewport.width, height: viewport.height },
  });
}

async function getDocumentScrollHeight(page: Page): Promise<number> {
  return page.evaluate(() =>
    Math.max(
      document.documentElement.scrollHeight,
      document.body?.scrollHeight ?? 0
    )
  );
}

function needsPerSlideCapture(
  discovery: SlideContainerDiscovery,
  splitByHeight: boolean,
  scrollHeight: number,
  viewportHeight: number
): boolean {
  if (discovery.count >= 2) return true;
  if (discovery.activeDeck) return true;
  if (splitByHeight && discovery.count < 2) {
    return scrollHeight > viewportHeight + 1;
  }
  return false;
}

async function exportSingleInputToPng(
  loader: HTMLLoader,
  inputPath: string,
  options: ConversionOptions
): Promise<Buffer[]> {
  const viewport = resolveViewport(options);
  setViewportPixels(viewport.width, viewport.height);

  const page = await loader.loadHTML(inputPath, viewport, {
    allowLocalResources: options.allowLocalResources ?? true,
  });

  try {
    const inspector = new ElementInspector(page);
    const autoDetect = options.autoDetectSlides !== false;
    const discovery = await inspector.discoverSlideContainers(
      options.slideSelector,
      autoDetect
    );
    const splitByHeight = Boolean(options.splitByHeight);
    const scrollHeight = await getDocumentScrollHeight(page);

    if (needsPerSlideCapture(discovery, splitByHeight, scrollHeight, viewport.height)) {
      const images: Buffer[] = [];

      if (discovery.count >= 2) {
        if (!options.quiet) {
          const ruleHint = discovery.rule ?? discovery.selector;
          console.error(
            `🖼  PNG export: ${discovery.count} slides (isolated capture, rule: ${ruleHint})`
          );
        }
        for (let i = 0; i < discovery.count; i++) {
          await inspector.prepareSlideForRasterExport(i, discovery);
          try {
            const slideSelector = inspector.slideIndexSelector(i);
            const captureSelector = await inspector.applyRasterExportFrame(
              viewport,
              slideSelector
            );
            images.push(
              await captureViewportPng(page, viewport, captureSelector ?? slideSelector)
            );
          } finally {
            await inspector.restoreRasterExportFrame();
            await inspector.restoreSlideForRasterExport();
          }
        }
        return images;
      }

      const pageCount = Math.max(1, Math.ceil(scrollHeight / viewport.height));
      if (!options.quiet) {
        console.error(`🖼  PNG export: ${pageCount} pages (split by height)`);
      }
      for (let i = 0; i < pageCount; i++) {
        await inspector.applyViewportClipForRaster(i * viewport.height, viewport);
        try {
          const captureSelector = await inspector.applyRasterExportFrame(viewport);
          images.push(await captureViewportPng(page, viewport, captureSelector));
        } finally {
          await inspector.restoreViewportClipForRaster();
        }
      }
      return images;
    }

    if (!options.quiet) {
      console.error('🖼  PNG export: single page');
    }
    const captureSelector = await inspector.applyRasterExportFrame(viewport);
    return [await captureViewportPng(page, viewport, captureSelector)];
  } finally {
    await page.evaluate(
      (ids) => {
        for (const id of ids) {
          document.getElementById(id)?.remove();
        }
      },
      ['deckhtml-raster-clip-style', 'deckhtml-raster-frame-style']
    );
    await loader.close().catch(() => {});
  }
}

/**
 * Convert HTML input(s) to one or more PNG buffers using Playwright screenshots.
 * Multi-slide decks and multi-file inputs produce one image per page, in order.
 */
export async function convertHtmlToPng(
  options: ConversionOptions
): Promise<PngConversionResult> {
  return runQuietly(Boolean(options.quiet), async () => {
    const inputPaths = resolveInputPaths(options);
    const loader = new HTMLLoader();
    await loader.init();

    try {
      const images: Buffer[] = [];

      for (let i = 0; i < inputPaths.length; i++) {
        const inputPath = inputPaths[i]!;
        if (inputPaths.length > 1 && !options.quiet) {
          console.error(`\n📄 Processing ${i + 1}/${inputPaths.length}: ${inputPath}`);
        }
        const pages = await exportSingleInputToPng(loader, inputPath, options);
        images.push(...pages);
      }

      return {
        images,
        slideCount: images.length,
        stats: EMPTY_CONVERSION_STATS,
      };
    } finally {
      await loader.close().catch(() => {});
    }
  });
}
