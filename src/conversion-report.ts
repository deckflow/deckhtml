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

// ── DH-P0-002 per-element conversion report ───────────────────────────────

export type MappingMode = 'native' | 'vector' | 'raster' | 'ignored' | 'unsupported';

export interface ElementGeometry {
  x: number;
  y: number;
  w: number;
  h: number;
  unit: 'inch' | 'px';
}

export interface ElementReportRecord {
  element_id: string | null;
  kind: string;
  mapping_mode: MappingMode;
  object_ref: string | null;
  geometry: ElementGeometry;
  warnings: import('./utils/diagnostics').Diagnostic[];
}

export interface SlideReport {
  slide_id: string;
  index: number;
  elements: ElementReportRecord[];
}

export interface ConversionReportSummary {
  native: number;
  vector: number;
  raster: number;
  ignored: number;
  unsupported: number;
}

export interface DeckHtmlConversionReport {
  schema_version: 1;
  engine: { name: string; version: string };
  status: 'succeeded' | 'failed';
  slides: SlideReport[];
  summary: ConversionReportSummary;
  diagnostics: import('./utils/diagnostics').Diagnostic[];
}

/**
 * Mutable collector used by the generator to build the per-element report.
 */
export class ReportCollector {
  readonly slides: SlideReport[] = [];
  readonly diagnostics: import('./utils/diagnostics').Diagnostic[] = [];
  /** Number of elements excluded before reaching the generator (ignored). */
  ignoredCount = 0;

  startSlide(slideId: string, index: number): void {
    this.slides.push({ slide_id: slideId, index, elements: [] });
  }

  addElement(record: ElementReportRecord): void {
    const slide = this.slides[this.slides.length - 1];
    if (slide) slide.elements.push(record);
  }

  build(
    engineName: string,
    engineVersion: string,
    status: 'succeeded' | 'failed',
  ): DeckHtmlConversionReport {
    const summary: ConversionReportSummary = {
      native: 0,
      vector: 0,
      raster: 0,
      ignored: this.ignoredCount,
      unsupported: 0,
    };
    for (const slide of this.slides) {
      for (const rec of slide.elements) {
        summary[rec.mapping_mode]++;
      }
    }
    // Stable sort: slides by index, elements kept in insertion (DOM) order.
    this.slides.sort((a, b) => a.index - b.index);
    return {
      schema_version: 1,
      engine: { name: engineName, version: engineVersion },
      status,
      slides: this.slides,
      summary,
      diagnostics: this.diagnostics,
    };
  }
}

/**
 * Recompute the summary counts from per-element records (DH-P0-003).
 *
 * The summary is always derivable from `slides[].elements[].mapping_mode` plus
 * the ignored count, so callers can verify the report was not tampered with
 * and strict-mode gates can re-check after any post-processing.
 */
export function recomputeSummary(
  report: DeckHtmlConversionReport,
  ignoredCount = 0,
): ConversionReportSummary {
  const summary: ConversionReportSummary = {
    native: 0,
    vector: 0,
    raster: 0,
    ignored: ignoredCount,
    unsupported: 0,
  };
  for (const slide of report.slides) {
    for (const rec of slide.elements) {
      summary[rec.mapping_mode]++;
    }
  }
  return summary;
}
