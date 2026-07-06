import { HTMLLoader } from './loader';
import {
  ElementInspector,
  InspectElementsOptions,
  SlideContainerDiscovery,
} from './inspector';
import { ElementInfo } from './types';
import { runAsyncPool } from './utils/async-pool';

export interface InspectSlidesParallelParams {
  inputPath: string;
  viewport: { width: number; height: number };
  allowLocalResources?: boolean;
  slideSelector?: string;
  autoDetectSlides: boolean;
  discovery: SlideContainerDiscovery;
  inspectOptions: InspectElementsOptions;
  concurrency: number;
}

/**
 * Inspect each slide in its own Playwright page, with a bounded page pool.
 */
export async function inspectSlidesParallel(
  loader: HTMLLoader,
  params: InspectSlidesParallelParams
): Promise<Map<number, ElementInfo[]>> {
  const slidesMap = new Map<number, ElementInfo[]>();
  const indices = Array.from({ length: params.discovery.count }, (_, i) => i);
  const loadOptions = {
    allowLocalResources: params.allowLocalResources,
  };

  await runAsyncPool(indices, params.concurrency, async (slideIndex) => {
    const page = await loader.loadHTMLInNewPage(
      params.inputPath,
      params.viewport,
      loadOptions
    );
    try {
      const inspector = new ElementInspector(page);
      await inspector.discoverSlideContainers(
        params.slideSelector,
        params.autoDetectSlides
      );
      const elements = await inspector.inspectOneSlideIsolated(
        slideIndex,
        params.discovery,
        params.inspectOptions
      );
      slidesMap.set(slideIndex, elements);
    } finally {
      await page.close().catch(() => {});
    }
  });

  return slidesMap;
}
