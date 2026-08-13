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
  resourcePolicy?: import('./utils/resource-policy').ResourcePolicy;
  diagnostics?: import('./utils/resource-policy').ResourceDiagnostic[];
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
    resourcePolicy: params.resourcePolicy,
    diagnostics: params.diagnostics,
  };

  await runAsyncPool(indices, params.concurrency, async (slideIndex) => {
    const page = await loader.loadHTMLInNewPage(
      params.inputPath,
      params.viewport,
      loadOptions
    );
    try {
      const inspector = new ElementInspector(page);
      // Reuse discovery rules per worker so its data attributes and active-deck
      // metadata always refer to this page's DOM, not the coordinator page.
      const workerDiscovery = await inspector.discoverSlideContainers(
        params.slideSelector,
        params.autoDetectSlides
      );
      if (workerDiscovery.count !== params.discovery.count) {
        throw new Error(
          `Parallel slide discovery mismatch: expected ${params.discovery.count}, got ${workerDiscovery.count}`
        );
      }
      const elements = await inspector.inspectOneSlideIsolated(
        slideIndex,
        workerDiscovery,
        params.inspectOptions
      );
      slidesMap.set(slideIndex, elements);
    } finally {
      await page.close().catch(() => {});
    }
  });

  return slidesMap;
}
