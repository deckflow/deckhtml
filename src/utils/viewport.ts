/**
 * Viewport defaults and HTML/SVG size auto-detection.
 *
 * Explicit ConversionOptions.viewportWidth/Height (or CLI --width) always win.
 * When omitted, we read declared slide size from the source so Playwright
 * loads at the design width (critical for fixed-px decks such as 1920×1080).
 */

import { readFileSync } from 'fs';

export const DEFAULT_VIEWPORT_WIDTH = 1280;
export const DEFAULT_VIEWPORT_HEIGHT = 720;

export type ViewportSize = { width: number; height: number };

function isPositiveSize(width: number, height: number): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  );
}

/** Parse the first `WxH` / `W×H` token in a string (e.g. meta deck-size). */
export function parseWxH(text: string): ViewportSize | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const width = Math.round(parseFloat(match[1]!));
  const height = Math.round(parseFloat(match[2]!));
  return isPositiveSize(width, height) ? { width, height } : null;
}

function parseCssPxLength(value: string): number | null {
  const match = value.trim().match(/^(-?[\d.]+)\s*px$/i);
  if (!match) return null;
  const n = parseFloat(match[1]!);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Read `<meta name="deck-size" content="… 1920x1080">` (attribute order flexible).
 */
export function parseDeckSizeMeta(html: string): ViewportSize | null {
  const metaRe =
    /<meta\b[^>]*\bname\s*=\s*["']deck-size["'][^>]*>/gi;
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaRe.exec(html)) !== null) {
    const tag = metaMatch[0];
    const contentMatch = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i);
    if (!contentMatch) continue;
    const size = parseWxH(contentMatch[1]!);
    if (size) return size;
  }

  // content= before name= (less common)
  const altRe =
    /<meta\b[^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*\bname\s*=\s*["']deck-size["'][^>]*>/gi;
  let altMatch: RegExpExecArray | null;
  while ((altMatch = altRe.exec(html)) !== null) {
    const size = parseWxH(altMatch[1]!);
    if (size) return size;
  }

  return null;
}

/**
 * Read CSS custom properties `--deck-width` / `--deck-height` (px).
 */
export function parseDeckCssVariables(html: string): ViewportSize | null {
  const widthMatch = html.match(/--deck-width\s*:\s*([^;}\n]+)/i);
  const heightMatch = html.match(/--deck-height\s*:\s*([^;}\n]+)/i);
  if (!widthMatch || !heightMatch) return null;
  const width = parseCssPxLength(widthMatch[1]!);
  const height = parseCssPxLength(heightMatch[1]!);
  if (width == null || height == null) return null;
  return { width, height };
}

/**
 * Read `"stage": { "width": 1920, "height": 1080 }` from embedded JSON (player manifests).
 */
export function parseStageJson(html: string): ViewportSize | null {
  const stageMatch = html.match(
    /"stage"\s*:\s*\{([^{}]{0,400})\}/i
  );
  if (!stageMatch) return null;
  const body = stageMatch[1]!;
  const widthMatch = body.match(/"width"\s*:\s*(\d+(?:\.\d+)?)/i);
  const heightMatch = body.match(/"height"\s*:\s*(\d+(?:\.\d+)?)/i);
  if (!widthMatch || !heightMatch) return null;
  const width = Math.round(parseFloat(widthMatch[1]!));
  const height = Math.round(parseFloat(heightMatch[1]!));
  return isPositiveSize(width, height) ? { width, height } : null;
}

/** Detect declared slide size from HTML source (meta → CSS vars → stage JSON). */
export function detectViewportFromHtml(html: string): ViewportSize | null {
  return (
    parseDeckSizeMeta(html) ??
    parseDeckCssVariables(html) ??
    parseStageJson(html)
  );
}

/** Read SVG viewBox / width+height for viewport auto-sizing. */
export function detectViewportFromSvg(svg: string): ViewportSize | null {
  const viewBoxMatch = svg.match(/\bviewBox=["']([^"']+)["']/i);
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1]!.trim().split(/[\s,]+/).map(Number);
    if (
      parts.length >= 4 &&
      parts[2]! > 0 &&
      parts[3]! > 0
    ) {
      return {
        width: Math.round(parts[2]!),
        height: Math.round(parts[3]!),
      };
    }
  }
  const wMatch = svg.match(/\bwidth=["']([\d.]+)/i);
  const hMatch = svg.match(/\bheight=["']([\d.]+)/i);
  const w = wMatch ? parseFloat(wMatch[1]!) : 0;
  const h = hMatch ? parseFloat(hMatch[1]!) : 0;
  if (w > 0 && h > 0) return { width: Math.round(w), height: Math.round(h) };
  return null;
}

/**
 * Detect viewport from a file on disk. HTML uses deck-size / CSS vars / stage;
 * SVG uses viewBox or width/height attributes.
 */
export function detectViewportFromFile(inputPath: string): ViewportSize | null {
  try {
    const content = readFileSync(inputPath, 'utf8');
    if (inputPath.toLowerCase().endsWith('.svg')) {
      return detectViewportFromSvg(content);
    }
    return detectViewportFromHtml(content);
  } catch {
    return null;
  }
}

/**
 * Resolve Playwright viewport for one input.
 * Explicit options win; otherwise auto-detect from source; else 1280×720.
 */
export function resolveConversionViewport(
  inputPath: string,
  options: { viewportWidth?: number; viewportHeight?: number } = {}
): ViewportSize {
  let width = options.viewportWidth;
  let height = options.viewportHeight;

  if (width === undefined && height === undefined) {
    const detected = detectViewportFromFile(inputPath);
    if (detected) {
      width = detected.width;
      height = detected.height;
    }
  }

  return {
    width: width ?? DEFAULT_VIEWPORT_WIDTH,
    height: height ?? DEFAULT_VIEWPORT_HEIGHT,
  };
}
