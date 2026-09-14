/**
 * Feixiang / Musk courseware shell: pages live in <template class="page-data">
 * (optional shared head in <template class="page-shared">). The shell JS rebuilds
 * a sidebar + single #cwMainFrame player — we bypass that UI and expand templates
 * into isolated per-page HTML documents for conversion.
 *
 * Cheerio-free so deckhtml stays dependency-light; html2pptx uses the same
 * convention with cheerio in `src/page-data-deck.ts`.
 */

/** Near-full-viewport gate — keep in sync with inspector.SLIDE_HOST_SIZE. */
const SLIDE_HOST_SIZE = {
  heightMinRatio: 0.5,
  heightMaxRatio: 2.0,
  widthMinRatio: 0.8,
} as const;

/** Canvas used by the courseware shell (CW×CH in the player script). */
export const DEFAULT_PAGE_DATA_CANVAS = { width: 960, height: 540 } as const;

const PAGE_DATA_MIN_PAGES = 2;

export interface PageDataPage {
  id: number;
  name: string;
  innerHtml: string;
}

export interface PageDataDeck {
  pages: PageDataPage[];
  sharedHead: string;
  canvas: { width: number; height: number };
  source: 'document' | 'iframe-srcdoc';
}

/**
 * Extract a page-data deck from HTML when ≥2 non-empty templates exist.
 * Returns null for ordinary documents (no regression on other cases).
 */
export function extractPageDataDeck(html: string): PageDataDeck | null {
  if (!html || !/<template\b[^>]*\bpage-data\b/i.test(html)) {
    return null;
  }

  const nodes = extractTemplatesByClass(html, 'page-data');
  if (nodes.length < PAGE_DATA_MIN_PAGES) return null;

  const pages: PageDataPage[] = [];
  nodes.forEach((node, index) => {
    const innerHtml = node.inner.trim();
    if (!innerHtml) return;
    const idAttr = Number(attrValue(node.attrs, 'data-id'));
    const id = Number.isFinite(idAttr) && idAttr > 0 ? idAttr : index + 1;
    const name = (attrValue(node.attrs, 'data-name') || `第${index + 1}页`).trim();
    pages.push({ id, name, innerHtml });
  });

  if (pages.length < PAGE_DATA_MIN_PAGES) return null;
  pages.sort((a, b) => a.id - b.id || a.name.localeCompare(b.name));

  const shared = extractTemplatesByClass(html, 'page-shared')[0];
  const sharedHead = (shared?.inner ?? '').trim();
  const canvas = detectPageDataCanvas(html, pages);

  return {
    pages,
    sharedHead,
    canvas,
    source: 'document',
  };
}

/**
 * Resolve a page-data deck from the document or a near-full-viewport iframe srcdoc.
 * Prefer document-level templates; otherwise scan large iframe srcdocs only
 * (same size gate as iframe deck promotion — small embeds stay untouched).
 */
export function resolvePageDataDeckFromHtml(
  html: string,
  viewport: { width: number; height: number }
): PageDataDeck | null {
  const direct = extractPageDataDeck(html);
  if (direct) return direct;

  for (const iframe of extractIframes(html)) {
    if (!iframe.srcdoc?.trim()) continue;
    if (!isNearFullViewportIframe(iframe.attrs, html, viewport)) continue;
    const deck = extractPageDataDeck(iframe.srcdoc);
    if (deck) {
      return { ...deck, source: 'iframe-srcdoc' };
    }
  }
  return null;
}

/** Number of page-data slides, or 0 when the convention is absent. */
export function countPageDataSlides(html: string): number {
  return extractPageDataDeck(html)?.pages.length ?? 0;
}

/**
 * Count named slide hosts on the top-level document only (no page-data, no
 * iframe srcdoc). Used so an outer multi-slide deck is not stolen by a nested
 * courseware iframe.
 */
export function countTopLevelSlideHosts(html: string): number {
  const outer = stripIframeSrcdocs(html).replace(
    /<template\b[\s\S]*?<\/template>/gi,
    ''
  );
  const counts = [
    countClassToken(outer, 'slide-container'),
    countClassToken(outer, 'slide-wrap'),
    countClassToken(outer, 'slide'),
    countAttr(outer, 'data-slide'),
    countAttr(outer, 'data-page'),
    countClassToken(outer, 'page'),
  ];
  const best = Math.max(...counts);
  return best >= PAGE_DATA_MIN_PAGES ? best : 1;
}

/**
 * Build a standalone HTML document for one courseware page (CSS-isolated).
 * Mirrors the shell's buildPageContent(..., 'main') without injecting the
 * analytics SDK or the player chrome.
 */
export function buildPageDataHtml(
  page: PageDataPage,
  sharedHead: string,
  canvas: { width: number; height: number },
  options?: { baseHref?: string }
): string {
  const { width, height } = canvas;
  const baseTag = options?.baseHref
    ? `<base href="${escapeAttr(options.baseHref)}">`
    : '';
  const modeScript = '<script>window.__CW_MODE__="main";</script>';
  const baseCss =
    `<style>*,*::before,*::after{box-sizing:border-box}` +
    `html,body{margin:0;padding:0;width:${width}px;height:${height}px;` +
    `overflow:hidden!important;overflow-x:hidden!important}` +
    `body>*{min-height:100%!important;height:auto!important}</style>`;

  return (
    `<!DOCTYPE html><html><head><meta charset="UTF-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1.0">` +
    `${baseTag}${modeScript}${baseCss}${sharedHead}</head>` +
    `<body>${page.innerHtml}</body></html>`
  );
}

function detectPageDataCanvas(
  html: string,
  pages: PageDataPage[]
): { width: number; height: number } {
  const samples = [html, ...pages.slice(0, 3).map((p) => p.innerHtml)];
  for (const sample of samples) {
    const stage = sample.match(
      /\.pcopy-stage\s*\{[^}]*width\s*:\s*(\d+)px[^}]*height\s*:\s*(\d+)px/i
    );
    if (stage) {
      return {
        width: parseInt(stage[1]!, 10),
        height: parseInt(stage[2]!, 10),
      };
    }
    const wh = sample.match(
      /(?:^|[;{\s])width\s*:\s*(\d+)px\s*;\s*height\s*:\s*(\d+)px/i
    );
    if (wh) {
      const width = parseInt(wh[1]!, 10);
      const height = parseInt(wh[2]!, 10);
      if (width >= 640 && height >= 360 && width <= 1920 && height <= 1080) {
        const ratio = width / height;
        if (Math.abs(ratio - 16 / 9) / (16 / 9) <= 0.08) {
          return { width, height };
        }
      }
    }
  }
  return {
    width: DEFAULT_PAGE_DATA_CANVAS.width,
    height: DEFAULT_PAGE_DATA_CANVAS.height,
  };
}

function extractTemplatesByClass(
  html: string,
  className: string
): Array<{ attrs: string; inner: string }> {
  const results: Array<{ attrs: string; inner: string }> = [];
  const openRe = /<template\b/gi;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(html)) !== null) {
    const start = match.index;
    const tagEnd = html.indexOf('>', start);
    if (tagEnd < 0) break;
    const attrs = html.slice(start + '<template'.length, tagEnd);
    if (!hasClassToken(attrs, className)) continue;
    const innerStart = tagEnd + 1;
    const close = findMatchingClose(html, innerStart, 'template');
    if (close < 0) continue;
    results.push({ attrs, inner: html.slice(innerStart, close) });
    openRe.lastIndex = close + '</template>'.length;
  }
  return results;
}

function findMatchingClose(html: string, from: number, tag: string): number {
  const open = new RegExp(`<${tag}\\b`, 'gi');
  const close = new RegExp(`</${tag}\\s*>`, 'gi');
  open.lastIndex = from;
  close.lastIndex = from;
  let depth = 1;
  while (depth > 0) {
    const nextOpen = open.exec(html);
    const nextClose = close.exec(html);
    if (!nextClose) return -1;
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      close.lastIndex = open.lastIndex;
    } else {
      depth -= 1;
      if (depth === 0) return nextClose.index;
      open.lastIndex = close.lastIndex;
    }
  }
  return -1;
}

function extractIframes(
  html: string
): Array<{ attrs: string; srcdoc?: string }> {
  const results: Array<{ attrs: string; srcdoc?: string }> = [];
  const re = /<iframe\b/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const parsed = parseStartTag(html, match.index);
    if (!parsed) continue;
    const srcdocRaw = attrValue(parsed.attrs, 'srcdoc');
    results.push({
      attrs: parsed.attrs,
      srcdoc: srcdocRaw ? decodeHtmlEntities(srcdocRaw) : undefined,
    });
    re.lastIndex = parsed.end;
  }
  return results;
}

function parseStartTag(
  html: string,
  start: number
): { attrs: string; end: number } | null {
  let i = start;
  let quote: '"' | "'" | null = null;
  while (i < html.length) {
    const ch = html[i]!;
    if (quote) {
      if (ch === quote) quote = null;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i += 1;
      continue;
    }
    if (ch === '>') {
      const attrs = html.slice(html.indexOf(' ', start) >= 0 ? html.indexOf(' ', start) : start, i);
      return { attrs, end: i + 1 };
    }
    i += 1;
  }
  return null;
}

function isNearFullViewportIframe(
  attrs: string,
  html: string,
  viewport: { width: number; height: number }
): boolean {
  const size = declaredOrFillIframeSize(attrs, html, viewport);
  if (!size) return false;
  const minW = viewport.width * SLIDE_HOST_SIZE.widthMinRatio;
  const minH = viewport.height * SLIDE_HOST_SIZE.heightMinRatio;
  const maxH = viewport.height * SLIDE_HOST_SIZE.heightMaxRatio;
  return size.width >= minW && size.height >= minH && size.height <= maxH;
}

function declaredOrFillIframeSize(
  attrs: string,
  html: string,
  viewport: { width: number; height: number }
): { width: number; height: number } | null {
  const style = attrValue(attrs, 'style') ?? '';
  const widthPx = parseCssPx(style.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i)?.[1]);
  const heightPx = parseCssPx(style.match(/(?:^|;)\s*height\s*:\s*([^;]+)/i)?.[1]);
  if (widthPx && heightPx) return { width: widthPx, height: heightPx };

  let fillW = isCssFillDimension(style.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i)?.[1]);
  let fillH = isCssFillDimension(style.match(/(?:^|;)\s*height\s*:\s*([^;]+)/i)?.[1]);

  const classAttr = attrValue(attrs, 'class') ?? '';
  if (classAttr && (!fillW || !fillH)) {
    for (const cls of classAttr.split(/\s+/).filter(Boolean)) {
      const re = new RegExp(
        `\\.${escapeRegExp(cls)}\\s*\\{([^}]+)\\}`,
        'gi'
      );
      let m: RegExpExecArray | null;
      while ((m = re.exec(html)) !== null) {
        const body = m[1]!;
        if (!fillW) {
          fillW = isCssFillDimension(
            body.match(/(?:^|[;\s])width\s*:\s*([^;}\n]+)/i)?.[1]
          );
        }
        if (!fillH) {
          fillH = isCssFillDimension(
            body.match(/(?:^|[;\s])height\s*:\s*([^;}\n]+)/i)?.[1]
          );
        }
      }
    }
  }

  if (fillW && fillH) {
    return { width: viewport.width, height: viewport.height };
  }
  return null;
}

function isCssFillDimension(value: string | undefined | null): boolean {
  if (!value) return false;
  return /^\s*100\s*%\s*$/i.test(value.trim());
}

function parseCssPx(value: string | undefined): number | null {
  if (!value) return null;
  const m = value.trim().match(/^(-?[\d.]+)\s*px$/i);
  if (!m) return null;
  const n = parseFloat(m[1]!);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function stripIframeSrcdocs(html: string): string {
  return html.replace(/\ssrcdoc\s*=\s*("[\s\S]*?"|'[\s\S]*?')/gi, '');
}

function countClassToken(html: string, token: string): number {
  const re = new RegExp(
    `\\bclass\\s*=\\s*(["'])([^"']*)\\1`,
    'gi'
  );
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tokens = m[2]!.split(/\s+/);
    if (tokens.includes(token)) count += 1;
  }
  return count;
}

function countAttr(html: string, name: string): number {
  const re = new RegExp(`\\b${escapeRegExp(name)}\\s*=`, 'gi');
  return html.match(re)?.length ?? 0;
}

function hasClassToken(attrs: string, token: string): boolean {
  const value = attrValue(attrs, 'class');
  if (!value) return false;
  return value.split(/\s+/).includes(token);
}

function attrValue(attrs: string, name: string): string | undefined {
  const re = new RegExp(
    `\\b${escapeRegExp(name)}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,
    'i'
  );
  const m = attrs.match(re);
  return m?.[2];
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}
