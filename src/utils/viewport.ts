/**
 * Viewport defaults and HTML/SVG size auto-detection.
 *
 * Explicit ConversionOptions.viewportWidth/Height (or CLI --width) always win.
 * When omitted, we read declared slide size from the source so Playwright
 * loads at the design width (critical for fixed-px decks such as 1920×1080).
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';

export const DEFAULT_VIEWPORT_WIDTH = 1280;
export const DEFAULT_VIEWPORT_HEIGHT = 720;

export type ViewportSize = { width: number; height: number };

/** CSS custom property prefixes used for slide canvas size. */
const SIZE_CSS_VAR_PREFIXES = ['deck', 'page', 'slide', 'canvas'] as const;

/** Selectors that commonly declare a fixed slide/canvas box in px. */
const SLIDE_HOST_SELECTOR_RE =
  /(?:^|[,{\s])(?:html|body|\.slide-page|\.slide-container|\.slide-wrap|\.slide-canvas|\.slide|#slide)(?=[\s,{.#:[>+~]|$)/i;

function isPositiveSize(width: number, height: number): boolean {
  return (
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > 0 &&
    height > 0
  );
}

function size16x9FromWidth(width: number): ViewportSize {
  return {
    width,
    height: Math.round((width * DEFAULT_VIEWPORT_HEIGHT) / DEFAULT_VIEWPORT_WIDTH),
  };
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
 * Read `<meta name="viewport" content="width=1920, …">`.
 * Ignores `width=device-width`. Height defaults to 16:9 when omitted.
 */
export function parseViewportMeta(html: string): ViewportSize | null {
  const metaRe =
    /<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/gi;
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaRe.exec(html)) !== null) {
    const tag = metaMatch[0];
    const contentMatch = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i);
    if (!contentMatch) continue;
    const size = parseViewportMetaContent(contentMatch[1]!);
    if (size) return size;
  }

  const altRe =
    /<meta\b[^>]*\bcontent\s*=\s*["']([^"']+)["'][^>]*\bname\s*=\s*["']viewport["'][^>]*>/gi;
  let altMatch: RegExpExecArray | null;
  while ((altMatch = altRe.exec(html)) !== null) {
    const size = parseViewportMetaContent(altMatch[1]!);
    if (size) return size;
  }

  return null;
}

function parseViewportMetaContent(content: string): ViewportSize | null {
  const widthMatch = content.match(/(?:^|[,;\s])width\s*=\s*([^,;\s]+)/i);
  if (!widthMatch) return null;
  const widthToken = widthMatch[1]!.trim();
  if (/^device-width$/i.test(widthToken)) return null;
  const width = Math.round(parseFloat(widthToken));
  if (!Number.isFinite(width) || width <= 0) return null;

  const heightMatch = content.match(/(?:^|[,;\s])height\s*=\s*([^,;\s]+)/i);
  if (heightMatch) {
    const heightToken = heightMatch[1]!.trim();
    if (!/^device-height$/i.test(heightToken)) {
      const height = Math.round(parseFloat(heightToken));
      if (Number.isFinite(height) && height > 0) {
        return { width, height };
      }
    }
  }

  return size16x9FromWidth(width);
}

/**
 * Read CSS custom properties for slide size.
 * Recognizes `--deck|page|slide|canvas-width` paired with matching `-height` (px).
 */
export function parseDeckCssVariables(cssOrHtml: string): ViewportSize | null {
  for (const prefix of SIZE_CSS_VAR_PREFIXES) {
    const widthMatch = cssOrHtml.match(
      new RegExp(`--${prefix}-width\\s*:\\s*([^;}\\n]+)`, 'i')
    );
    const heightMatch = cssOrHtml.match(
      new RegExp(`--${prefix}-height\\s*:\\s*([^;}\\n]+)`, 'i')
    );
    if (!widthMatch || !heightMatch) continue;
    const width = parseCssPxLength(widthMatch[1]!);
    const height = parseCssPxLength(heightMatch[1]!);
    if (width == null || height == null) continue;
    return { width, height };
  }
  return null;
}

/**
 * Extract text content of `<style>` blocks from HTML.
 * Used so CSS rule scanners never run against markup / data-URI blobs
 * (those can be multi-MB lines without `{`/`}`, which makes `/[^{}@]+\{/` O(n²)).
 */
export function extractInlineStyleBlocks(html: string): string {
  const chunks: string[] = [];
  const styleRe = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = styleRe.exec(html)) !== null) {
    const css = match[1];
    if (css) chunks.push(css);
  }
  return chunks.join('\n');
}

/**
 * CSS chunks safe to scan with the CSS-rule regex.
 * Prefer `<style>` contents when present; skip HTML markup (no style tags);
 * otherwise treat the whole string as CSS (linked stylesheets / pure CSS).
 */
function cssChunksForRuleScan(cssOrHtml: string): string[] {
  const inline = extractInlineStyleBlocks(cssOrHtml);
  if (inline) return [inline];
  // HTML without <style> — do not scan body / base64 blobs.
  if (/<[a-zA-Z!/?]/.test(cssOrHtml)) return [];
  return [cssOrHtml];
}

/**
 * Read fixed `width`/`height` px on common slide host / root selectors.
 * Scans only CSS (inline `<style>` blocks or pure stylesheet text), never raw HTML.
 */
export function parseFixedSlideHostSize(cssOrHtml: string): ViewportSize | null {
  for (const css of cssChunksForRuleScan(cssOrHtml)) {
    // Match CSS rule blocks; keep it simple (no nested @rules required for our cases).
    const ruleRe = /([^{}@]+)\{([^{}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = ruleRe.exec(css)) !== null) {
      const selectors = match[1]!;
      const body = match[2]!;
      if (!SLIDE_HOST_SELECTOR_RE.test(selectors)) continue;

      const widthMatch = body.match(/(?:^|[;\s])width\s*:\s*([^;}\n]+)/i);
      const heightMatch = body.match(/(?:^|[;\s])height\s*:\s*([^;}\n]+)/i);
      if (!widthMatch || !heightMatch) continue;
      const width = parseCssPxLength(widthMatch[1]!);
      const height = parseCssPxLength(heightMatch[1]!);
      if (width == null || height == null) continue;
      // Ignore tiny decorative boxes accidentally matching a host selector.
      if (width < 320 || height < 180) continue;
      return { width, height };
    }
  }
  return null;
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

/** Collect relative/local stylesheet hrefs from HTML link tags. */
export function collectLocalStylesheetHrefs(html: string): string[] {
  const hrefs: string[] = [];
  const linkRe = /<link\b[^>]*>/gi;
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = linkRe.exec(html)) !== null) {
    const tag = linkMatch[0];
    if (!/\brel\s*=\s*["'][^"']*stylesheet[^"']*["']/i.test(tag)) continue;
    const hrefMatch = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1]!.trim();
    if (!href || /^(https?:|data:|\/\/)/i.test(href)) continue;
    hrefs.push(href);
  }
  return hrefs;
}

function readLocalStylesheets(html: string, baseDir: string): string {
  const chunks: string[] = [];
  for (const href of collectLocalStylesheetHrefs(html)) {
    const filePath = isAbsolute(href) ? href : resolve(baseDir, href);
    if (!existsSync(filePath)) continue;
    try {
      chunks.push(readFileSync(filePath, 'utf8'));
    } catch {
      // ignore unreadable stylesheets
    }
  }
  return chunks.join('\n');
}

function detectFromCssSources(...sources: string[]): ViewportSize | null {
  for (const source of sources) {
    if (!source) continue;
    const fromVars = parseDeckCssVariables(source);
    if (fromVars) return fromVars;
  }
  for (const source of sources) {
    if (!source) continue;
    const fromHost = parseFixedSlideHostSize(source);
    if (fromHost) return fromHost;
  }
  return null;
}

/**
 * Detect declared slide size from HTML source.
 * Order: deck-size meta → CSS size vars → viewport meta → stage JSON → fixed host px.
 * When `baseDir` is set, also reads local linked stylesheets for CSS signals.
 * CSS detectors only see `<style>` contents + linked stylesheets (not HTML body / data URIs).
 */
export function detectViewportFromHtml(
  html: string,
  options: { baseDir?: string } = {}
): ViewportSize | null {
  const linkedCss =
    options.baseDir != null ? readLocalStylesheets(html, options.baseDir) : '';
  const inlineCss = extractInlineStyleBlocks(html);

  return (
    parseDeckSizeMeta(html) ??
    detectFromCssSources(inlineCss, linkedCss) ??
    parseViewportMeta(html) ??
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
 * Detect viewport from a file on disk. HTML uses deck-size / CSS vars / viewport
 * meta / stage / linked stylesheets; SVG uses viewBox or width/height attributes.
 */
export function detectViewportFromFile(inputPath: string): ViewportSize | null {
  try {
    const content = readFileSync(inputPath, 'utf8');
    if (inputPath.toLowerCase().endsWith('.svg')) {
      return detectViewportFromSvg(content);
    }
    return detectViewportFromHtml(content, { baseDir: dirname(inputPath) });
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
