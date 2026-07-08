import type { ElementInfo, UsedFontDescriptor } from './types';

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
}

export interface ConversionStats {
  elements: ConversionElementStats;
  fonts: ConversionFontStats;
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
  return { families, variants };
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
    ...(params.viewport ? { viewport: params.viewport } : {}),
    ...(params.platform ? { platform: params.platform } : {}),
    ...(params.durationMs !== undefined ? { durationMs: params.durationMs } : {}),
  };
}

export const EMPTY_CONVERSION_STATS: ConversionStats = {
  elements: { total: 0, byType: {}, slides: [] },
  fonts: { families: [], variants: [] },
};
