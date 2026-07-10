import type { ElementInfo, RasterMethod, RasterReason, UsedFontDescriptor } from './types';
import { probeEmbeddableFonts, type FontEmbedProbeResult } from './utils/embedFonts';

export type { FontEmbedMatch, FontEmbedProbeResult } from './utils/embedFonts';
export { probeEmbeddableFonts, matchEmbeddableFont } from './utils/embedFonts';

export type ElementTypeCounts = Record<string, number>;

export interface SlideElementStats {
  index: number;
  total: number;
  byType: ElementTypeCounts;
}

export interface ConversionElementStats {
  total: number;
  byType: ElementTypeCounts;
  slides: SlideElementStats[];
}

export interface ConversionFontStats {
  families: string[];
  variants: UsedFontDescriptor[];
  /** Probe result against the cloud embed font library (../../fonts/fonts-index.ts) */
  embed?: FontEmbedProbeResult;
}

export interface SimplifiedElementEntry {
  slide: number;
  type: string;
  tag: string;
  method: RasterMethod;
  reason: RasterReason;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SlideSimplifiedStats {
  index: number;
  total: number;
  byReason: Record<string, number>;
}

export interface ConversionSimplifiedStats {
  total: number;
  byMethod: Record<string, number>;
  byReason: Record<string, number>;
  slides: SlideSimplifiedStats[];
  items: SimplifiedElementEntry[];
}

export interface ConversionStats {
  elements: ConversionElementStats;
  fonts: ConversionFontStats;
  simplified: ConversionSimplifiedStats;
}

export interface ConversionReport {
  version: 1;
  generatedAt: string;
  input: string[];
  output: string;
  format: string;
  mode: string;
  slideCount: number;
  elements: ConversionElementStats;
  fonts: ConversionFontStats;
  simplified: ConversionSimplifiedStats;
  viewport?: { width: number; height: number };
  platform?: string;
  durationMs?: number;
}

function countByType(elements: ElementInfo[]): ElementTypeCounts {
  const counts: ElementTypeCounts = {};
  for (const el of elements) {
    counts[el.type] = (counts[el.type] ?? 0) + 1;
  }
  return counts;
}

function mergeCounts(target: ElementTypeCounts, source: ElementTypeCounts): void {
  for (const [type, count] of Object.entries(source)) {
    target[type] = (target[type] ?? 0) + count;
  }
}

export function buildElementStats(
  slidesMap: Map<number, ElementInfo[]>
): ConversionElementStats {
  const slides: SlideElementStats[] = [];
  const byType: ElementTypeCounts = {};
  let total = 0;

  const indices = [...slidesMap.keys()].sort((a, b) => a - b);
  for (const index of indices) {
    const elements = slidesMap.get(index) ?? [];
    const slideByType = countByType(elements);
    const slideTotal = elements.length;
    total += slideTotal;
    mergeCounts(byType, slideByType);
    slides.push({ index, total: slideTotal, byType: slideByType });
  }

  return { total, byType, slides };
}

export function buildSimplifiedStats(
  slidesMap: Map<number, ElementInfo[]>
): ConversionSimplifiedStats {
  const byMethod: Record<string, number> = {};
  const byReason: Record<string, number> = {};
  const slides: SlideSimplifiedStats[] = [];
  const items: SimplifiedElementEntry[] = [];
  let total = 0;

  const indices = [...slidesMap.keys()].sort((a, b) => a - b);
  for (const index of indices) {
    const elements = slidesMap.get(index) ?? [];
    const slideByReason: Record<string, number> = {};
    let slideTotal = 0;

    for (const el of elements) {
      if (!el.rasterMethod || !el.rasterReason) continue;
      slideTotal++;
      total++;
      byMethod[el.rasterMethod] = (byMethod[el.rasterMethod] ?? 0) + 1;
      byReason[el.rasterReason] = (byReason[el.rasterReason] ?? 0) + 1;
      slideByReason[el.rasterReason] = (slideByReason[el.rasterReason] ?? 0) + 1;
      items.push({
        slide: index,
        type: el.type,
        tag: el.tag,
        method: el.rasterMethod,
        reason: el.rasterReason,
        x: Math.round(el.x),
        y: Math.round(el.y),
        width: Math.round(el.width),
        height: Math.round(el.height),
      });
    }

    if (slideTotal > 0) {
      slides.push({ index, total: slideTotal, byReason: slideByReason });
    }
  }

  return { total, byMethod, byReason, slides, items };
}

export function buildFontStats(
  usedFontsMap: Map<string, UsedFontDescriptor>
): ConversionFontStats {
  const variants = [...usedFontsMap.values()].sort((a, b) => {
    const fam = a.fontFamily.localeCompare(b.fontFamily);
    if (fam !== 0) return fam;
    const bold = Number(Boolean(b.bold)) - Number(Boolean(a.bold));
    if (bold !== 0) return bold;
    return Number(Boolean(b.italic)) - Number(Boolean(a.italic));
  });
  const families = [...new Set(variants.map((d) => d.fontFamily))].sort();
  const embed = probeEmbeddableFonts(families);
  return { families, variants, embed };
}

export function buildConversionReport(params: {
  input: string[];
  output: string;
  format: string;
  mode: string;
  slideCount: number;
  stats: ConversionStats;
  viewport?: { width: number; height: number };
  platform?: string;
  durationMs?: number;
}): ConversionReport {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    input: params.input,
    output: params.output,
    format: params.format,
    mode: params.mode,
    slideCount: params.slideCount,
    elements: params.stats.elements,
    fonts: params.stats.fonts,
    simplified: params.stats.simplified,
    ...(params.viewport ? { viewport: params.viewport } : {}),
    ...(params.platform ? { platform: params.platform } : {}),
    ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
  };
}

export const EMPTY_CONVERSION_STATS: ConversionStats = {
  elements: { total: 0, byType: {}, slides: [] },
  fonts: { families: [], variants: [] },
  simplified: { total: 0, byMethod: {}, byReason: {}, slides: [], items: [] },
};
