/**
 * Element Inspector Module
 * Traverses DOM tree and extracts element information
 */

import { Page } from 'playwright';
import { ElementInfo, ElementType, ComputedStyles, TableData } from './types';
import { getSlideHeightPx, getSlideWidthPx } from './utils/coordinate';
import { convertMathmlToOmml } from './utils/mathml-to-omml';
import { isLightTextColor } from './utils/omml-style';

/** Declarative rule for auto-detecting multi-page slide hosts. */
export interface SlideProbeRule {
  /** Human-readable label for logging. */
  label: string;
  /** CSS selector for candidate slide hosts. */
  selector: string;
  /**
   * When set, only candidates without an ancestor matching this selector are kept
   * (e.g. top-level `section` only).
   */
  topLevelAncestorSelector?: string;
}

export interface SlideContainerDiscovery {
  selector: string;
  count: number;
  /** Matched probe rule label, or `explicit` / `none`. */
  rule?: string;
}

export interface InspectElementsOptions {
  inputIsSvg?: boolean;
}

const SLIDE_INDEX_ATTR = 'data-deckhtml-slide-index';
const SLIDE_ISOLATION_ATTR = 'data-deckhtml-slide-hidden';
const SLIDE_CANDIDATE_ATTR = 'data-deckhtml-slide-candidate';
/** Pause after isolating a slide so CSS/JS entrance animations can finish. */
const SLIDE_ISOLATION_ANIMATION_SETTLE_MS = 3000;
/** Qualified slide host height must be within [min, max] × viewport slide height. */
const SLIDE_HEIGHT_MIN_RATIO = 0.5;
const SLIDE_HEIGHT_MAX_RATIO = 2.0;
const SLIDE_MIN_MATCHES = 2;

/**
 * Ordered probe rules for multi-page HTML. First rule with enough qualified
 * candidates wins; all matches share the same height check, isolation, and inspect pipeline.
 */
export const SLIDE_PROBE_RULES: SlideProbeRule[] = [
  { label: '.slide-container', selector: '.slide-container' },
  { label: '.slide', selector: '.slide' },
  { label: '[data-slide]', selector: '[data-slide]' },
  { label: 'section.slide', selector: 'section.slide' },
  {
    label: 'section',
    selector: 'section',
    topLevelAncestorSelector: 'section',
  },
];

export class ElementInspector {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Measure the effective content width of the current page (matches configured viewport width).
   */
  async getPageContentWidth(): Promise<number> {
    return getSlideWidthPx();
  }

  /**
   * Extract font URLs from @font-face rules in the page
   */
  async extractFontUrls(): Promise<Map<string, Array<{ url: string; weight?: number }>>> {
    // First, extract Google Fonts and other external font stylesheet URLs
    const externalFontStylesheets = await this.page.evaluate(() => {
      const links: Array<{ href: string; isFontStylesheet: boolean }> = [];

      document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
        const href = (link as HTMLLinkElement).href;
        if (href) {
          // Detect Google Fonts and other font services
          const isFontStylesheet =
            href.includes('fonts.googleapis.com') ||
            href.includes('fonts.gstatic.com') ||
            href.includes('use.typekit.net') ||
            href.includes('cloud.typography.com') ||
            href.toLowerCase().includes('font');

          links.push({ href, isFontStylesheet });
        }
      });

      return links;
    });

    const fontUrls = new Map<string, Array<{ url: string; weight?: number }>>();

    // Fetch and parse external font stylesheets (bypass CORS)
    for (const { href, isFontStylesheet } of externalFontStylesheets) {
      if (isFontStylesheet) {
        try {
          console.log(`📥 Fetching font stylesheet: ${href}`);

          // Navigate to the CSS URL to get its content
          const response = await this.page.context().request.get(href, {
            headers: {
              // Google Fonts needs proper User-Agent to return font URLs
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
          });

          if (response.ok()) {
            const cssContent = await response.text();
            const extracted = this.parseFontFaceRules(cssContent, href);

            // Merge with existing font URLs
            extracted.forEach((urlsWithWeight, fontName) => {
              if (!fontUrls.has(fontName)) {
                fontUrls.set(fontName, []);
              }
              fontUrls.get(fontName)!.push(...urlsWithWeight);
            });
          }
        } catch (error) {
          console.warn(`⚠️  Failed to fetch font stylesheet ${href}:`, error instanceof Error ? error.message : error);
        }
      }
    }

    // Also extract from inline @font-face rules
    const inlineFontUrls = await this.page.evaluate(() => {
      const fonts = new Map<string, Array<{ url: string; weight?: number }>>();

      // Extract from @font-face rules in stylesheets
      for (const styleSheet of Array.from(document.styleSheets)) {
        try {
          const rules = Array.from(styleSheet.cssRules || styleSheet.rules || []);

          for (const rule of rules) {
            if (rule instanceof CSSFontFaceRule) {
              const fontFamily = rule.style.getPropertyValue('font-family')
                .replace(/['"]/g, '')
                .trim();
              const src = rule.style.getPropertyValue('src');
              const fontWeight = rule.style.getPropertyValue('font-weight');
              const weight = fontWeight ? parseInt(fontWeight, 10) : undefined;

              if (fontFamily && src) {
                // Extract URLs from src (url(...))
                const urlMatches = src.matchAll(/url\(['"]?([^'"()]+)['"]?\)/g);
                const urlsWithWeight: Array<{ url: string; weight?: number }> = [];

                for (const match of urlMatches) {
                  let url = match[1];
                  // Convert relative URLs to absolute
                  if (url && !url.startsWith('data:')) {
                    if (!url.startsWith('http')) {
                      url = new URL(url, window.location.href).href;
                    }
                    urlsWithWeight.push({ url, weight });
                  }
                }

                if (urlsWithWeight.length > 0) {
                  if (!fonts.has(fontFamily)) {
                    fonts.set(fontFamily, []);
                  }
                  fonts.get(fontFamily)!.push(...urlsWithWeight);
                }
              }
            }
          }
        } catch (e) {
          // Skip inaccessible stylesheets (CORS)
        }
      }

      // Convert Map to Object for serialization
      const result: Record<string, Array<{ url: string; weight?: number }>> = {};
      fonts.forEach((urlsWithWeight, name) => {
        result[name] = urlsWithWeight;
      });
      return result;
    });

    // Merge inline font URLs
    for (const [name, urls] of Object.entries(inlineFontUrls)) {
      if (!fontUrls.has(name)) {
        fontUrls.set(name, []);
      }
      fontUrls.get(name)!.push(...urls);
    }

    return fontUrls;
  }

  /**
   * Parse @font-face rules from CSS content
   */
  private parseFontFaceRules(cssContent: string, baseUrl: string): Map<string, Array<{ url: string; weight?: number }>> {
    const fonts = new Map<string, Array<{ url: string; weight?: number }>>();

    // Match @font-face blocks
    const fontFaceRegex = /@font-face\s*{([^}]+)}/g;
    let match;

    while ((match = fontFaceRegex.exec(cssContent)) !== null) {
      const block = match[1];

      // Extract font-family
      const familyMatch = block.match(/font-family\s*:\s*['"]?([^'";]+)['"]?/);
      if (!familyMatch) continue;

      const fontFamily = familyMatch[1].trim();

      // Extract font-weight (optional)
      const weightMatch = block.match(/font-weight\s*:\s*(\d+)/);
      const fontWeight = weightMatch ? parseInt(weightMatch[1], 10) : undefined;

      // Extract src URLs
      const srcMatch = block.match(/src\s*:\s*([^;]+);/);
      if (!srcMatch) continue;

      const srcValue = srcMatch[1];

      // Extract all URLs from src
      const urlMatches = srcValue.matchAll(/url\(['"]?([^'"()]+)['"]?\)/g);
      const urlsWithWeight: Array<{ url: string; weight?: number }> = [];

      for (const urlMatch of urlMatches) {
        let url = urlMatch[1];

        // Skip data URLs
        if (url.startsWith('data:')) continue;

        // Convert relative URLs to absolute
        if (!url.startsWith('http')) {
          try {
            url = new URL(url, baseUrl).href;
          } catch (e) {
            continue;
          }
        }

        // Prefer TTF and OTF formats for conversion
        if (url.includes('.ttf') || url.includes('.otf') || url.includes('.woff2')) {
          urlsWithWeight.push({ url, weight: fontWeight });
        }
      }

      if (urlsWithWeight.length > 0) {
        if (!fonts.has(fontFamily)) {
          fonts.set(fontFamily, []);
        }
        fonts.get(fontFamily)!.push(...urlsWithWeight);
      }
    }

    return fonts;
  }

  /**
   * Discover slide container elements in the page.
   * Tags each match with data-deckhtml-slide-index for stable isolation.
   */
  async discoverSlideContainers(
    selector?: string,
    autoDetect: boolean = true
  ): Promise<SlideContainerDiscovery> {
    const explicit = selector?.trim() || '';
    if (explicit) {
      return this.page.evaluate(
        ({ explicitSelector, indexAttr }) => {
          const nodes = Array.from(document.querySelectorAll(explicitSelector));
          nodes.forEach((node, i) => node.setAttribute(indexAttr, String(i)));
          return {
            selector: explicitSelector,
            count: nodes.length,
            rule: 'explicit',
          };
        },
        { explicitSelector: explicit, indexAttr: SLIDE_INDEX_ATTR }
      );
    }

    if (autoDetect) {
      return this.discoverByProbeRules();
    }

    return this.emptySlideDiscovery();
  }

  private emptySlideDiscovery(): SlideContainerDiscovery {
    return { selector: '', count: 0, rule: 'none' };
  }

  /**
   * Try each {@link SLIDE_PROBE_RULES} entry in order; tag qualified hosts and
   * return a selector that matches only those tagged nodes.
   */
  private async discoverByProbeRules(): Promise<SlideContainerDiscovery> {
    const slideHeight = getSlideHeightPx();

    for (const rule of SLIDE_PROBE_RULES) {
      const candidateCount = await this.page.evaluate(
        ({ probeRule, candidateAttr }) => {
          document.querySelectorAll(`[${candidateAttr}]`).forEach((node) => {
            node.removeAttribute(candidateAttr);
          });
          let nodes = Array.from(document.querySelectorAll(probeRule.selector));
          if (probeRule.topLevelAncestorSelector) {
            nodes = nodes.filter(
              (node) =>
                !node.parentElement?.closest(probeRule.topLevelAncestorSelector!)
            );
          }
          nodes.forEach((node, i) => node.setAttribute(candidateAttr, String(i)));
          return nodes.length;
        },
        { probeRule: rule, candidateAttr: SLIDE_CANDIDATE_ATTR }
      );

      if (candidateCount < SLIDE_MIN_MATCHES) {
        await this.cleanupSlideCandidates();
        continue;
      }

      const discovery = await this.finalizeSlidesFromProbeParents(
        rule.label,
        slideHeight
      );

      if (discovery.count >= SLIDE_MIN_MATCHES) {
        return discovery;
      }

      await this.cleanupSlideCandidates();
    }

    return this.emptySlideDiscovery();
  }

  /**
   * Probe matches locate slide parent(s); qualify every direct child whose height
   * is within [50%, 200%] × slide height (includes siblings not matched by probe,
   * e.g. header.hero next to section).
   */
  private async finalizeSlidesFromProbeParents(
    ruleLabel: string,
    slideHeight: number
  ): Promise<SlideContainerDiscovery> {
    const minH = slideHeight * SLIDE_HEIGHT_MIN_RATIO;
    const maxH = slideHeight * SLIDE_HEIGHT_MAX_RATIO;

    return this.page.evaluate(
      ({ candidateAttr, indexAttr, ruleLabel, minH, maxH }) => {
        const candidates = Array.from(
          document.querySelectorAll(`[${candidateAttr}]`)
        );
        const seenParents = new Set<Element>();
        const parents: Element[] = [];
        for (const candidate of candidates) {
          const parent = candidate.parentElement;
          if (!parent || seenParents.has(parent)) continue;
          seenParents.add(parent);
          parents.push(parent);
        }
        parents.sort((a, b) => {
          const pos = a.compareDocumentPosition(b);
          if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
          if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
          return 0;
        });

        const qualified: Element[] = [];
        for (const parent of parents) {
          for (const child of Array.from(parent.children)) {
            const h = child.getBoundingClientRect().height;
            if (h >= minH && h <= maxH) qualified.push(child);
          }
        }

        document.querySelectorAll(`[${indexAttr}]`).forEach((node) => {
          node.removeAttribute(indexAttr);
        });
        qualified.forEach((node, slideIdx) => {
          node.setAttribute(indexAttr, String(slideIdx));
        });
        document.querySelectorAll(`[${candidateAttr}]`).forEach((node) => {
          node.removeAttribute(candidateAttr);
        });

        return {
          selector: `[${indexAttr}]`,
          count: qualified.length,
          rule: ruleLabel,
        };
      },
      {
        candidateAttr: SLIDE_CANDIDATE_ATTR,
        indexAttr: SLIDE_INDEX_ATTR,
        ruleLabel,
        minH,
        maxH,
      }
    );
  }

  private async cleanupSlideCandidates(): Promise<void> {
    await this.page.evaluate(
      (candidateAttr) => {
        document.querySelectorAll(`[${candidateAttr}]`).forEach((node) => {
          node.removeAttribute(candidateAttr);
        });
      },
      SLIDE_CANDIDATE_ATTR
    );
  }

  private async waitForLayoutSettle(): Promise<void> {
    await this.page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        })
    );
    await this.page.waitForTimeout(50);
  }

  /** Wait for slide-local animations after isolation before element inspect. */
  private async waitForSlideAnimationSettle(): Promise<void> {
    await this.page.waitForTimeout(SLIDE_ISOLATION_ANIMATION_SETTLE_MS);
  }

  /**
   * Multi-slide preprocessing: hide every node outside the slide container
   * (keep the container, its descendants, and ancestor chain visible).
   */
  private async isolateOutsideSlideContainer(
    slideSelector: string
  ): Promise<void> {
    await this.page.evaluate(
      ({ slideSelector, hiddenAttr }) => {
        const host = document.querySelector(slideSelector);
        if (!host) return;

        const hideNode = (node: Element) => {
          if (!(node instanceof HTMLElement || node instanceof SVGElement)) return;
          node.setAttribute(hiddenAttr, '1');
          (node as HTMLElement).style.setProperty('display', 'none', 'important');
        };

        const shouldKeepVisible = (node: Element): boolean => {
          if (node === host || host.contains(node)) return true;
          if (node.contains(host)) return true;
          return false;
        };

        const roots: Element[] = [];
        if (document.body) roots.push(document.body);
        if (document.documentElement && document.documentElement !== document.body) {
          roots.push(document.documentElement);
        }

        for (const root of roots) {
          for (const node of Array.from(root.querySelectorAll('*'))) {
            if (shouldKeepVisible(node)) continue;
            hideNode(node);
          }
        }

        if (document.body) {
          for (const child of Array.from(document.body.children)) {
            if (shouldKeepVisible(child)) continue;
            hideNode(child);
          }
        }

        window.scrollTo(0, 0);
      },
      { slideSelector, hiddenAttr: SLIDE_ISOLATION_ATTR }
    );
    await this.prepareSlideContainerForInspect(slideSelector);
    await this.waitForLayoutSettle();
    await this.waitForSlideAnimationSettle();
  }

  /** Scroll-reveal hooks leave `.reveal` at opacity:0 until scrolled; fix before inspect. */
  private async prepareSlideContainerForInspect(
    slideSelector: string
  ): Promise<void> {
    await this.page.evaluate((sel) => {
      const host = document.querySelector(sel);
      if (!(host instanceof HTMLElement)) return;
      host.scrollIntoView({ block: 'start', inline: 'nearest' });
      const nodes = [
        host,
        ...Array.from(host.querySelectorAll('.reveal')),
      ].filter((n): n is HTMLElement => n instanceof HTMLElement);
      for (const node of nodes) {
        node.classList.add('show');
        node.style.setProperty('transition', 'none', 'important');
        node.style.setProperty('animation', 'none', 'important');
        node.style.setProperty('opacity', '1', 'important');
        node.style.setProperty('transform', 'none', 'important');
      }
    }, slideSelector);
  }

  private async clearPptxMappedAttributes(): Promise<void> {
    await this.page.evaluate((mappedAttr) => {
      document.querySelectorAll(`[${mappedAttr}]`).forEach((node) => {
        node.removeAttribute(mappedAttr);
      });
    }, 'data-html2pptx-mapped');
  }

  private async restoreSlideIsolation(): Promise<void> {
    await this.page.evaluate(
      (hiddenAttr) => {
        document.querySelectorAll(`[${hiddenAttr}]`).forEach((node) => {
          if (!(node instanceof HTMLElement || node instanceof SVGElement)) return;
          (node as HTMLElement).style.removeProperty('display');
          node.removeAttribute(hiddenAttr);
        });
      },
      SLIDE_ISOLATION_ATTR
    );
  }

  private async cleanupSlideContainerTags(): Promise<void> {
    await this.page.evaluate(
      (indexAttr) => {
        document.querySelectorAll(`[${indexAttr}]`).forEach((node) => {
          node.removeAttribute(indexAttr);
        });
      },
      SLIDE_INDEX_ATTR
    );
  }

  private async getSlideContainerOrigin(
    slideIndex: number,
    selector: string
  ): Promise<{ x: number; y: number }> {
    return this.page.evaluate(
      ({ slideIndex, selector, indexAttr }) => {
        const node = document.querySelector(
          `${selector}[${indexAttr}="${slideIndex}"]`
        ) ?? document.querySelectorAll(selector)[slideIndex];
        if (!node) return { x: 0, y: 0 };
        const rect = node.getBoundingClientRect();
        return { x: 0, y: rect.top };
      },
      { slideIndex, selector, indexAttr: SLIDE_INDEX_ATTR }
    );
  }

  private normalizeElementCoords(
    elements: ElementInfo[],
    origin: { x: number; y: number }
  ): void {
    if (origin.y === 0) return;
    for (const el of elements) {
      el.y -= origin.y;
    }
  }

  /**
   * Body page-bg is emitted at the viewport origin (0,0). After subtracting the
   * slide container origin it drifts off-slide and PowerPoint prompts for repair.
   */
  private anchorFullSlidePageBg(elements: ElementInfo[]): void {
    const w = getSlideWidthPx();
    const h = getSlideHeightPx();
    for (const el of elements) {
      if (el.tag !== 'body.page-bg') continue;
      el.x = 0;
      el.y = 0;
      el.width = w;
      el.height = h;
    }
  }

  /**
   * Inspect one slide after isolation (multi-slide path).
   */
  async inspectOneSlideIsolated(
    slideIndex: number,
    discovery: SlideContainerDiscovery,
    options?: InspectElementsOptions
  ): Promise<ElementInfo[]> {
    const slideSelector = `[${SLIDE_INDEX_ATTR}="${slideIndex}"]`;
    await this.clearPptxMappedAttributes();
    await this.isolateOutsideSlideContainer(slideSelector);
    const origin = await this.getSlideContainerOrigin(slideIndex, discovery.selector);
    const elements = await this.inspectElements(undefined, options);
    this.normalizeElementCoords(elements, origin);
    this.anchorFullSlidePageBg(elements);

    if (elements.length === 0) {
      elements.push({
        type: 'text',
        tag: 'p',
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        styles: {},
        content: '',
      });
    }

    return elements;
  }

  /**
   * Inspect each slide container in isolation and return per-slide element maps.
   */
  async inspectSlidesIsolated(
    discovery: SlideContainerDiscovery,
    options?: InspectElementsOptions
  ): Promise<Map<number, ElementInfo[]>> {
    const slidesMap = new Map<number, ElementInfo[]>();

    for (let i = 0; i < discovery.count; i++) {
      try {
        const elements = await this.inspectOneSlideIsolated(i, discovery, options);
        slidesMap.set(i, elements);
      } finally {
        await this.restoreSlideIsolation();
      }
    }

    await this.cleanupSlideContainerTags();
    return slidesMap;
  }

  /**
   * Inspect all visible elements in the page
   */
  async inspectElements(
    slideSelector?: string,
    options?: InspectElementsOptions
  ): Promise<ElementInfo[]> {
    const inputIsSvg = options?.inputIsSvg ?? false;
    const elements = await this.page.evaluate(
      async ({ slideSelector, slideHeight, inputIsSvg }) => {
        const result: any[] = [];
        const _debugInfo: string[] = [];
        /**
         * Check if element is a Font Awesome icon (helper for visibility check)
         */
        function isFAIcon(element: Element): boolean {
          if (!(element instanceof HTMLElement)) return false;
          const classList = element.classList;
          return (
            element.tagName.toLowerCase() === 'i' &&
            (classList.contains('fa') ||
              classList.contains('fas') ||
              classList.contains('far') ||
              classList.contains('fab') ||
              classList.contains('fal') ||
              classList.contains('fad') ||
              classList.contains('fa-solid') ||
              classList.contains('fa-regular') ||
              classList.contains('fa-brands'))
          );
        }

        function isSvgNamespace(el: Element): boolean {
          return el.namespaceURI === 'http://www.w3.org/2000/svg';
        }

        /** Serialize SVG as inline SVG image (data URL). */
        function emitSvgAsImage(svgEl: SVGElement, rect: DOMRect): void {
          try {
            const clone = svgEl.cloneNode(true) as SVGElement;
            if (!clone.getAttribute('xmlns')) {
              clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            }
            // Clone loses page CSS — bake currentColor / var() / inherited stroke into attributes.
            const computedColor = window.getComputedStyle(svgEl).color;
            const fallbackColorHex = cssColorToHex(computedColor) || '000000';
            applyStylesToSvgClone(clone, svgEl, fallbackColorHex);
            const svgString = new XMLSerializer().serializeToString(clone);
            const encoded = btoa(unescape(encodeURIComponent(svgString)));
            const isStandaloneRoot = inputIsSvg && svgEl === getStandaloneSvgRoot();
            result.push({
              type: 'image',
              tag: 'svg',
              x: isStandaloneRoot ? 0 : rect.left,
              y: isStandaloneRoot ? 0 : rect.top,
              width: isStandaloneRoot ? window.innerWidth : rect.width,
              height: isStandaloneRoot ? window.innerHeight : rect.height,
              styles: getComputedStyles(svgEl),
              src: `data:image/svg+xml;base64,${encoded}`,
            });
            markDomAsPptxMapped(svgEl);
          } catch (e) {
            console.warn('Failed to serialize SVG as image:', e);
          }
        }

        const SVG_NON_RENDER_TAGS = new Set([
          'defs',
          'symbol',
          'clippath',
          'mask',
          'pattern',
          'lineargradient',
          'radialgradient',
          'stop',
          'filter',
          'metadata',
          'title',
          'desc',
          'style',
          'fedropshadow',
          'fegaussianblur',
          'fecomposite',
          'femerge',
          'femergenode',
          'feoffset',
        ]);

        function isSvgNonRenderElement(el: Element | null | undefined): boolean {
          if (!el || !el.tagName) return true;
          const tag = el.tagName.toLowerCase();
          if (SVG_NON_RENDER_TAGS.has(tag)) return true;
          if (el.closest('defs')) return true;
          return false;
        }

        function isSvgPaintVisible(style: CSSStyleDeclaration): boolean {
          const fill = style.fill;
          const sw = parseFloat(style.getPropertyValue('stroke-width')) || 0;
          const stroke = style.stroke;
          const fillOk =
            !!fill &&
            fill !== 'none' &&
            fill !== 'transparent' &&
            fill !== 'rgba(0, 0, 0, 0)' &&
            fill !== 'rgba(0,0,0,0)';
          const strokeOk =
            sw > 0 && !!stroke && stroke !== 'none' && stroke !== 'transparent';
          return fillOk || strokeOk;
        }

        function getStandaloneSvgRoot(): SVGSVGElement | null {
          const docEl = document.documentElement;
          if (docEl instanceof SVGSVGElement) return docEl;
          const bodySvg = document.querySelector('body > svg');
          return bodySvg instanceof SVGSVGElement ? bodySvg : null;
        }

        /** Transform SVG user-space coordinates to viewport (screen) px. */
        function svgUserToScreen(el: SVGGraphicsElement, ux: number, uy: number): { x: number; y: number } {
          if (!Number.isFinite(ux) || !Number.isFinite(uy)) {
            return { x: Number.isFinite(ux) ? ux : 0, y: Number.isFinite(uy) ? uy : 0 };
          }
          const svg = el.ownerSVGElement;
          if (!svg) return { x: ux, y: uy };
          const pt = svg.createSVGPoint();
          pt.x = ux;
          pt.y = uy;
          const ctm = el.getScreenCTM();
          if (!ctm) return { x: ux, y: uy };
          const sp = pt.matrixTransform(ctm);
          return { x: sp.x, y: sp.y };
        }

        function extractSvgLineEndpoints(lineEl: SVGLineElement): {
          x1: number;
          y1: number;
          x2: number;
          y2: number;
        } {
          const x1 = parseFloat(lineEl.getAttribute('x1') || '0');
          const y1 = parseFloat(lineEl.getAttribute('y1') || '0');
          const x2 = parseFloat(lineEl.getAttribute('x2') || '0');
          const y2 = parseFloat(lineEl.getAttribute('y2') || '0');
          const p1 = svgUserToScreen(lineEl, x1, y1);
          const p2 = svgUserToScreen(lineEl, x2, y2);
          return { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y };
        }

        function parseSvgPointsAttribute(pointsAttr: string): { x: number; y: number }[] {
          const nums = pointsAttr
            .trim()
            .split(/[\s,]+/)
            .map((s) => parseFloat(s))
            .filter((n) => !Number.isNaN(n));
          const pts: { x: number; y: number }[] = [];
          for (let i = 0; i + 1 < nums.length; i += 2) {
            pts.push({ x: nums[i], y: nums[i + 1] });
          }
          return pts;
        }

        function sampleSvgPathScreenPoints(
          pathEl: SVGPathElement,
          maxPoints = 96
        ): { x: number; y: number }[] {
          const len = pathEl.getTotalLength();
          if (!Number.isFinite(len) || len <= 0) return [];
          const steps = Math.min(maxPoints, Math.max(8, Math.ceil(len / 1.5)));
          const pts: { x: number; y: number }[] = [];
          for (let i = 0; i <= steps; i++) {
            const at = (len * i) / steps;
            const p = pathEl.getPointAtLength(at);
            pts.push(svgUserToScreen(pathEl, p.x, p.y));
          }
          return pts;
        }

        function isSvgFillVisible(style: CSSStyleDeclaration): boolean {
          const fill = style.fill;
          return (
            !!fill &&
            fill !== 'none' &&
            fill !== 'transparent' &&
            fill !== 'rgba(0, 0, 0, 0)' &&
            fill !== 'rgba(0,0,0,0)'
          );
        }

        /** Open stroke-only path that is geometrically a straight segment → line endpoints. */
        function extractStraightPathLineEndpoints(pathEl: SVGPathElement): {
          x1: number;
          y1: number;
          x2: number;
          y2: number;
        } | null {
          const d = (pathEl.getAttribute('d') || '').trim();
          if (!d || /[zZ]/.test(d)) return null;
          if ((d.match(/[Mm]/g) || []).length > 1) return null;
          const style = window.getComputedStyle(pathEl);
          if (isSvgFillVisible(style)) return null;

          const len = pathEl.getTotalLength();
          if (!Number.isFinite(len) || len <= 0) return null;

          const p0 = pathEl.getPointAtLength(0);
          const pEnd = pathEl.getPointAtLength(len);
          const dx = pEnd.x - p0.x;
          const dy = pEnd.y - p0.y;
          if (Math.hypot(dx, dy) < 0.5) return null;

          const cross = (px: number, py: number) =>
            (px - p0.x) * dy - (py - p0.y) * dx;

          for (let i = 1; i <= 8; i++) {
            const pt = pathEl.getPointAtLength((len * i) / 9);
            if (Math.abs(cross(pt.x, pt.y)) > 0.75) return null;
          }

          const s0 = svgUserToScreen(pathEl, p0.x, p0.y);
          const s1 = svgUserToScreen(pathEl, pEnd.x, pEnd.y);
          return { x1: s0.x, y1: s0.y, x2: s1.x, y2: s1.y };
        }

        function resolveSvgMarkerAttr(value: string | null | undefined): boolean {
          if (!value || value === 'none') return false;
          return /url\s*\(/i.test(value);
        }

        function getSvgLineEndpointAndAngle(
          el: SVGGraphicsElement,
          atStart: boolean
        ): { x: number; y: number; angle: number } | null {
          const tag = el.tagName.toLowerCase();
          if (tag === 'line') {
            const lineEl = el as SVGLineElement;
            const x1 = parseFloat(lineEl.getAttribute('x1') || '0');
            const y1 = parseFloat(lineEl.getAttribute('y1') || '0');
            const x2 = parseFloat(lineEl.getAttribute('x2') || '0');
            const y2 = parseFloat(lineEl.getAttribute('y2') || '0');
            if (atStart) {
              return { x: x1, y: y1, angle: Math.atan2(y1 - y2, x1 - x2) };
            }
            return { x: x2, y: y2, angle: Math.atan2(y2 - y1, x2 - x1) };
          }
          if (tag === 'path') {
            const pathEl = el as SVGPathElement;
            const len = pathEl.getTotalLength();
            if (!Number.isFinite(len) || len <= 0) return null;
            const eps = Math.min(1, len * 0.05);
            if (atStart) {
              const p0 = pathEl.getPointAtLength(0);
              const p1 = pathEl.getPointAtLength(Math.min(len, eps));
              return { x: p0.x, y: p0.y, angle: Math.atan2(p1.y - p0.y, p1.x - p0.x) };
            }
            const pEnd = pathEl.getPointAtLength(len);
            const pBefore = pathEl.getPointAtLength(Math.max(0, len - eps));
            return {
              x: pEnd.x,
              y: pEnd.y,
              angle: Math.atan2(pEnd.y - pBefore.y, pEnd.x - pBefore.x),
            };
          }
          return null;
        }

        function resolveMarkerOrientAngle(
          orient: string,
          pathAngle: number,
          atStart: boolean
        ): number {
          const o = (orient || 'auto').trim();
          // Marker path tip points +X. At marker-end, align with path tangent (outward);
          // at marker-start, flip 180° (outward away from the segment).
          // SVG2: auto-start-reverse at marker-end matches auto; at marker-start it differs,
          // but our previous end handling (+π) pointed tips into the line — flip to match browser.
          if (o === 'auto' || o === 'auto-start-reverse') {
            return atStart ? pathAngle + Math.PI : pathAngle;
          }
          const deg = parseFloat(o);
          if (!Number.isNaN(deg)) return (deg * Math.PI) / 180;
          return atStart ? pathAngle + Math.PI : pathAngle;
        }

        function parseMarkerViewBox(marker: Element): {
          minX: number;
          minY: number;
          w: number;
          h: number;
        } {
          const vb = marker.getAttribute('viewBox');
          if (vb) {
            const parts = vb.trim().split(/[\s,]+/).map(parseFloat);
            if (parts.length >= 4 && parts.every((n) => !Number.isNaN(n))) {
              return { minX: parts[0], minY: parts[1], w: parts[2], h: parts[3] };
            }
          }
          return { minX: 0, minY: 0, w: 3, h: 3 };
        }

        function getMarkerShapePoints(marker: Element): { x: number; y: number }[] {
          const child = marker.querySelector('path, polygon, polyline');
          if (!child) return [];
          const tag = child.tagName.toLowerCase();
          if (tag === 'polygon' || tag === 'polyline') {
            return parseSvgPointsAttribute(child.getAttribute('points') || '');
          }
          if (tag === 'path') {
            const cmds = parseSvgPathPolylineCommands(child.getAttribute('d') || '');
            if (!cmds) return [];
            return cmds
              .filter((c): c is { type: 'M' | 'L'; x: number; y: number } => c.type !== 'Z')
              .map((c) => ({ x: c.x, y: c.y }));
          }
          return [];
        }

        function decomposeSvgMarkerAt(
          el: SVGGraphicsElement,
          markerUrl: string,
          atStart: boolean
        ): any | null {
          const idMatch = markerUrl.match(/url\(#([^)]+)\)/);
          if (!idMatch) return null;
          const marker = el.ownerSVGElement?.getElementById(idMatch[1]);
          if (!marker || marker.tagName.toLowerCase() !== 'marker') return null;

          const shapeChild = marker.querySelector('path, polygon, polyline');
          if (!shapeChild) return null;

          const endpoint = getSvgLineEndpointAndAngle(el, atStart);
          if (!endpoint) return null;

          const localPts = getMarkerShapePoints(marker);
          if (localPts.length < 3) return null;

          const vb = parseMarkerViewBox(marker);
          const refX = parseFloat(marker.getAttribute('refX') || String(vb.w / 2));
          const refY = parseFloat(marker.getAttribute('refY') || String(vb.h / 2));
          const markerW = parseFloat(marker.getAttribute('markerWidth') || '3');
          const markerH = parseFloat(marker.getAttribute('markerHeight') || '3');
          const sx = vb.w > 0 ? markerW / vb.w : 1;
          const sy = vb.h > 0 ? markerH / vb.h : 1;
          const anchorX = (refX - vb.minX) * sx;
          const anchorY = (refY - vb.minY) * sy;

          const angle = resolveMarkerOrientAngle(
            marker.getAttribute('orient') || 'auto',
            endpoint.angle,
            atStart
          );
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const screenAnchor = svgUserToScreen(el, endpoint.x, endpoint.y);

          const shapeStyle = window.getComputedStyle(shapeChild);
          let fillColor = shapeStyle.fill;
          if (!fillColor || fillColor === 'none' || fillColor === 'transparent') {
            const attrFill = shapeChild.getAttribute('fill');
            if (attrFill && attrFill !== 'none') fillColor = attrFill;
            else fillColor = '#000000';
          }
          let opacity = parseFloat(shapeStyle.opacity || '1');
          const fillOpacityRaw = shapeStyle.getPropertyValue('fill-opacity');
          if (fillOpacityRaw) {
            const fillOpacity = parseFloat(fillOpacityRaw);
            if (!Number.isNaN(fillOpacity)) opacity *= fillOpacity;
          }

          const screenPts = localPts.map((p) => {
            const lx = (p.x - vb.minX) * sx - anchorX;
            const ly = (p.y - vb.minY) * sy - anchorY;
            const rx = lx * cos - ly * sin;
            const ry = lx * sin + ly * cos;
            return { x: screenAnchor.x + rx, y: screenAnchor.y + ry };
          });

          const xs = screenPts.map((p) => p.x);
          const ys = screenPts.map((p) => p.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          const width = Math.max(maxX - minX, 0.5);
          const height = Math.max(maxY - minY, 0.5);

          return {
            x: minX,
            y: minY,
            width,
            height,
            atStart,
            clipPathPolygonPx: screenPts.map((p) => ({ x: p.x - minX, y: p.y - minY })),
            styles: {
              backgroundColor: fillColor,
              opacity,
            },
          };
        }

        function extractSvgMarkers(element: Element, info: any): void {
          const cs = window.getComputedStyle(element);
          const markerStart =
            element.getAttribute('marker-start') ||
            element.getAttribute('markerStart') ||
            cs.getPropertyValue('marker-start') ||
            (cs as any).markerStart ||
            '';
          const markerEnd =
            element.getAttribute('marker-end') ||
            element.getAttribute('markerEnd') ||
            cs.getPropertyValue('marker-end') ||
            (cs as any).markerEnd ||
            '';
          if (resolveSvgMarkerAttr(markerStart)) {
            info.svgMarkerStart = true;
            const startShape = decomposeSvgMarkerAt(
              element as SVGGraphicsElement,
              markerStart,
              true
            );
            if (startShape) {
              info.svgMarkerShapes = info.svgMarkerShapes || [];
              info.svgMarkerShapes.push(startShape);
            }
          }
          if (resolveSvgMarkerAttr(markerEnd)) {
            info.svgMarkerEnd = true;
            const endShape = decomposeSvgMarkerAt(
              element as SVGGraphicsElement,
              markerEnd,
              false
            );
            if (endShape) {
              info.svgMarkerShapes = info.svgMarkerShapes || [];
              info.svgMarkerShapes.push(endShape);
            }
          }
        }

        function parseSvgPathPolylineCommands(
          d: string
        ): Array<{ type: 'M' | 'L' | 'Z'; x?: number; y?: number }> | null {
          const cmds = parseSvgPathCommands(d);
          if (!cmds) return null;
          const hasNonLine = cmds.some((c) => c.type === 'C' || c.type === 'A');
          if (hasNonLine) return null;
          return cmds as Array<{ type: 'M' | 'L' | 'Z'; x?: number; y?: number }>;
        }

        function parseSvgPathCommands(
          d: string
        ): Array<
          | { type: 'M' | 'L'; x: number; y: number }
          | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
          | {
              type: 'A';
              rx: number;
              ry: number;
              rot: number;
              large: boolean;
              sweep: boolean;
              x: number;
              y: number;
            }
          | { type: 'Z' }
        > | null {
          const tokens: string[] = [];
          const re = /([MmLlHhVvCcSsQqTtAaZz])|([-+]?[\d]*\.?[\d]+(?:[eE][-+]?\d+)?)/g;
          let m: RegExpExecArray | null;
          while ((m = re.exec(d)) !== null) {
            if (m[1]) tokens.push(m[1]);
            else if (m[2]) tokens.push(m[2]);
          }
          if (tokens.length === 0) return null;

          let x = 0;
          let y = 0;
          let startX = 0;
          let startY = 0;
          let cmd = '';
          let i = 0;
          let lastCtrlX = x;
          let lastCtrlY = y;
          let lastCmd = '';
          const commands: Array<
            | { type: 'M' | 'L'; x: number; y: number }
            | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
            | {
                type: 'A';
                rx: number;
                ry: number;
                rot: number;
                large: boolean;
                sweep: boolean;
                x: number;
                y: number;
              }
            | { type: 'Z' }
          > = [];

          const readNum = () => parseFloat(tokens[i++]);
          // Arc large/sweep flags are single 0|1 digits and may be glued together or to
          // the next coordinate (e.g. "00-5.356", "019.288"). readNum() mis-parses these.
          let arcTail = '';
          const readArcFlag = (): boolean => {
            if (arcTail.length > 0) {
              const ch = arcTail[0];
              arcTail = arcTail.slice(1);
              return ch === '1';
            }
            const token = tokens[i++];
            if (!token) return false;
            const ch = token[0];
            if (ch !== '0' && ch !== '1') {
              arcTail = token;
              return false;
            }
            arcTail = token.slice(1);
            return ch === '1';
          };
          const readArcCoord = (): number => {
            if (arcTail.length > 0) {
              const num = parseFloat(arcTail);
              arcTail = '';
              return num;
            }
            return readNum();
          };
          const pushM = (px: number, py: number) => {
            x = px;
            y = py;
            commands.push({ type: 'M', x, y });
          };
          const pushL = (px: number, py: number) => {
            x = px;
            y = py;
            commands.push({ type: 'L', x, y });
          };
          const pushC = (
            x1: number,
            y1: number,
            x2: number,
            y2: number,
            px: number,
            py: number
          ) => {
            commands.push({ type: 'C', x1, y1, x2, y2, x: px, y: py });
            lastCtrlX = x2;
            lastCtrlY = y2;
            x = px;
            y = py;
          };
          const quadToCubic = (
            qx: number,
            qy: number,
            px: number,
            py: number
          ) => {
            const c1x = x + (2 / 3) * (qx - x);
            const c1y = y + (2 / 3) * (qy - y);
            const c2x = px + (2 / 3) * (qx - px);
            const c2y = py + (2 / 3) * (qy - py);
            pushC(c1x, c1y, c2x, c2y, px, py);
          };
          const reflectCtrl = () => ({
            x: 2 * x - lastCtrlX,
            y: 2 * y - lastCtrlY,
          });
          const arcAngle = (ux: number, uy: number, vx: number, vy: number) => {
            const dot = ux * vx + uy * vy;
            const det = ux * vy - uy * vx;
            return Math.atan2(det, dot);
          };
          const arcToCubics = (
            x0: number,
            y0: number,
            rx: number,
            ry: number,
            xAxisRotationDeg: number,
            largeArc: boolean,
            sweep: boolean,
            x1: number,
            y1: number
          ): Array<{ x1: number; y1: number; x2: number; y2: number; x: number; y: number }> => {
            if (rx === 0 || ry === 0) {
              return [{ x1: x0, y1: y0, x2: x1, y2: y1, x: x1, y: y1 }];
            }
            const phi = (xAxisRotationDeg * Math.PI) / 180;
            const sinPhi = Math.sin(phi);
            const cosPhi = Math.cos(phi);
            const dx = (x0 - x1) / 2;
            const dy = (y0 - y1) / 2;
            const x1p = cosPhi * dx + sinPhi * dy;
            const y1p = -sinPhi * dx + cosPhi * dy;
            let rxAbs = Math.abs(rx);
            let ryAbs = Math.abs(ry);
            const lambda = (x1p * x1p) / (rxAbs * rxAbs) + (y1p * y1p) / (ryAbs * ryAbs);
            if (lambda > 1) {
              const s = Math.sqrt(lambda);
              rxAbs *= s;
              ryAbs *= s;
            }
            const rxSq = rxAbs * rxAbs;
            const rySq = ryAbs * ryAbs;
            const sign = largeArc === sweep ? -1 : 1;
            const numer = rxSq * rySq - rxSq * y1p * y1p - rySq * x1p * x1p;
            const denom = rxSq * y1p * y1p + rySq * x1p * x1p;
            const coef =
              denom === 0 ? 0 : sign * Math.sqrt(Math.max(0, numer / denom));
            const cxp = coef * ((rxAbs * y1p) / ryAbs);
            const cyp = coef * (-(ryAbs * x1p) / rxAbs);
            const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x1) / 2;
            const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y1) / 2;
            const v1x = (x1p - cxp) / rxAbs;
            const v1y = (y1p - cyp) / ryAbs;
            const v2x = (-x1p - cxp) / rxAbs;
            const v2y = (-y1p - cyp) / ryAbs;
            let theta1 = arcAngle(1, 0, v1x, v1y);
            let deltaTheta = arcAngle(v1x, v1y, v2x, v2y);
            if (!sweep && deltaTheta > 0) deltaTheta -= 2 * Math.PI;
            if (sweep && deltaTheta < 0) deltaTheta += 2 * Math.PI;
            const segments = Math.max(1, Math.ceil(Math.abs(deltaTheta) / (Math.PI / 2)));
            const curves: Array<{
              x1: number;
              y1: number;
              x2: number;
              y2: number;
              x: number;
              y: number;
            }> = [];
            for (let seg = 0; seg < segments; seg++) {
              const t1 = theta1 + (deltaTheta * seg) / segments;
              const t2 = theta1 + (deltaTheta * (seg + 1)) / segments;
              const alpha =
                (Math.sin(t2 - t1) * (Math.sqrt(4 + 3 * Math.tan((t2 - t1) / 2) ** 2) - 1)) / 3;
              const cosT1 = Math.cos(t1);
              const sinT1 = Math.sin(t1);
              const cosT2 = Math.cos(t2);
              const sinT2 = Math.sin(t2);
              const ex = cx + rxAbs * cosT2 * cosPhi - ryAbs * sinT2 * sinPhi;
              const ey = cy + rxAbs * cosT2 * sinPhi + ryAbs * sinT2 * cosPhi;
              const c1x =
                cx +
                rxAbs * cosT1 * cosPhi -
                ryAbs * sinT1 * sinPhi -
                alpha * (rxAbs * sinT1 * cosPhi + ryAbs * cosT1 * sinPhi);
              const c1y =
                cy +
                rxAbs * cosT1 * sinPhi +
                ryAbs * sinT1 * cosPhi +
                alpha * (rxAbs * sinT1 * sinPhi - ryAbs * cosT1 * cosPhi);
              const c2x =
                cx +
                rxAbs * cosT2 * cosPhi -
                ryAbs * sinT2 * sinPhi +
                alpha * (rxAbs * sinT2 * cosPhi + ryAbs * cosT2 * sinPhi);
              const c2y =
                cy +
                rxAbs * cosT2 * sinPhi +
                ryAbs * sinT2 * cosPhi -
                alpha * (rxAbs * sinT2 * sinPhi - ryAbs * cosT2 * cosPhi);
              curves.push({ x1: c1x, y1: c1y, x2: c2x, y2: c2y, x: ex, y: ey });
            }
            return curves;
          };

          while (i < tokens.length) {
            const t = tokens[i];
            if (/^[A-Za-z]$/.test(t)) {
              cmd = t;
              i++;
            }
            switch (cmd) {
              case 'M':
                pushM(readNum(), readNum());
                startX = x;
                startY = y;
                lastCtrlX = x;
                lastCtrlY = y;
                lastCmd = 'M';
                cmd = 'L';
                break;
              case 'm':
                pushM(x + readNum(), y + readNum());
                startX = x;
                startY = y;
                lastCtrlX = x;
                lastCtrlY = y;
                lastCmd = 'm';
                cmd = 'l';
                break;
              case 'L':
                pushL(readNum(), readNum());
                lastCmd = 'L';
                break;
              case 'l':
                pushL(x + readNum(), y + readNum());
                lastCmd = 'l';
                break;
              case 'H':
                pushL(readNum(), y);
                lastCmd = 'H';
                break;
              case 'h':
                pushL(x + readNum(), y);
                lastCmd = 'h';
                break;
              case 'V':
                pushL(x, readNum());
                lastCmd = 'V';
                break;
              case 'v':
                pushL(x, y + readNum());
                lastCmd = 'v';
                break;
              case 'C': {
                const x1 = readNum();
                const y1 = readNum();
                const x2 = readNum();
                const y2 = readNum();
                const px = readNum();
                const py = readNum();
                pushC(x1, y1, x2, y2, px, py);
                lastCmd = 'C';
                break;
              }
              case 'c': {
                const x1 = x + readNum();
                const y1 = y + readNum();
                const x2 = x + readNum();
                const y2 = y + readNum();
                const px = x + readNum();
                const py = y + readNum();
                pushC(x1, y1, x2, y2, px, py);
                lastCmd = 'c';
                break;
              }
              case 'S': {
                const ref = lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's'
                  ? reflectCtrl()
                  : { x, y };
                const x2 = readNum();
                const y2 = readNum();
                const px = readNum();
                const py = readNum();
                pushC(ref.x, ref.y, x2, y2, px, py);
                lastCmd = 'S';
                break;
              }
              case 's': {
                const ref = lastCmd === 'C' || lastCmd === 'c' || lastCmd === 'S' || lastCmd === 's'
                  ? reflectCtrl()
                  : { x, y };
                const x2 = x + readNum();
                const y2 = y + readNum();
                const px = x + readNum();
                const py = y + readNum();
                pushC(ref.x, ref.y, x2, y2, px, py);
                lastCmd = 's';
                break;
              }
              case 'Q': {
                const qx = readNum();
                const qy = readNum();
                const px = readNum();
                const py = readNum();
                quadToCubic(qx, qy, px, py);
                lastCtrlX = qx;
                lastCtrlY = qy;
                lastCmd = 'Q';
                break;
              }
              case 'q': {
                const qx = x + readNum();
                const qy = y + readNum();
                const px = x + readNum();
                const py = y + readNum();
                quadToCubic(qx, qy, px, py);
                lastCtrlX = qx;
                lastCtrlY = qy;
                lastCmd = 'q';
                break;
              }
              case 'T': {
                const ref =
                  lastCmd === 'Q' || lastCmd === 'q' || lastCmd === 'T' || lastCmd === 't'
                    ? reflectCtrl()
                    : { x, y };
                const px = readNum();
                const py = readNum();
                quadToCubic(ref.x, ref.y, px, py);
                lastCtrlX = ref.x;
                lastCtrlY = ref.y;
                lastCmd = 'T';
                break;
              }
              case 't': {
                const ref =
                  lastCmd === 'Q' || lastCmd === 'q' || lastCmd === 'T' || lastCmd === 't'
                    ? reflectCtrl()
                    : { x, y };
                const px = x + readNum();
                const py = y + readNum();
                quadToCubic(ref.x, ref.y, px, py);
                lastCtrlX = ref.x;
                lastCtrlY = ref.y;
                lastCmd = 't';
                break;
              }
              case 'A': {
                arcTail = '';
                const rx = readNum();
                const ry = readNum();
                const rot = readNum();
                const large = readArcFlag();
                const sweep = readArcFlag();
                const px = readArcCoord();
                const py = readArcCoord();
                commands.push({ type: 'A', rx, ry, rot, large, sweep, x: px, y: py });
                x = px;
                y = py;
                lastCmd = 'A';
                break;
              }
              case 'a': {
                arcTail = '';
                const rx = readNum();
                const ry = readNum();
                const rot = readNum();
                const large = readArcFlag();
                const sweep = readArcFlag();
                const px = x + readArcCoord();
                const py = y + readArcCoord();
                commands.push({ type: 'A', rx, ry, rot, large, sweep, x: px, y: py });
                x = px;
                y = py;
                lastCmd = 'a';
                break;
              }
              case 'Z':
              case 'z':
                commands.push({ type: 'Z' });
                x = startX;
                y = startY;
                lastCmd = cmd;
                break;
              default:
                return null;
            }
          }
          if (commands.length < 2) return null;
          const coordsFinite = commands.every((c) => {
            if (c.type === 'Z') return true;
            if (c.type === 'M' || c.type === 'L') {
              return Number.isFinite(c.x) && Number.isFinite(c.y);
            }
            if (c.type === 'C') {
              return [c.x1, c.y1, c.x2, c.y2, c.x, c.y].every(Number.isFinite);
            }
            if (c.type === 'A') {
              return [c.rx, c.ry, c.rot, c.x, c.y].every(Number.isFinite);
            }
            return true;
          });
          return coordsFinite ? commands : null;
        }

        function extractSvgPathGeometry(el: SVGGraphicsElement): {
          screenPoints: { x: number; y: number }[];
          closed: boolean;
        } {
          const tag = el.tagName.toLowerCase();
          if (tag === 'line') {
            const ep = extractSvgLineEndpoints(el as SVGLineElement);
            return {
              screenPoints: [
                { x: ep.x1, y: ep.y1 },
                { x: ep.x2, y: ep.y2 },
              ],
              closed: false,
            };
          }
          if (tag === 'polygon' || tag === 'polyline') {
            const raw = parseSvgPointsAttribute(el.getAttribute('points') || '');
            const screenPoints = raw.map((p) => svgUserToScreen(el, p.x, p.y));
            return { screenPoints, closed: tag === 'polygon' };
          }
          if (tag === 'path') {
            const pathEl = el as SVGPathElement;
            const d = pathEl.getAttribute('d') || '';
            const pathCmds = parseSvgPathCommands(d);
            if (pathCmds) {
              const screenPoints = pathCmds
                .filter(
                  (c): c is { type: 'M' | 'L'; x: number; y: number } | {
                    type: 'C';
                    x1: number;
                    y1: number;
                    x2: number;
                    y2: number;
                    x: number;
                    y: number;
                  } => c.type !== 'Z'
                )
                .map((c) =>
                  c.type === 'C'
                    ? svgUserToScreen(pathEl, c.x, c.y)
                    : svgUserToScreen(pathEl, c.x, c.y)
                );
              return { screenPoints, closed: /[zZ]/.test(d) };
            }
            const closed = /[zZ]\s*$/.test(d.trim()) || /[zZ]/.test(d);
            return { screenPoints: sampleSvgPathScreenPoints(pathEl), closed };
          }
          return { screenPoints: [], closed: false };
        }

        /** Resolve url(#linearGradient) / url(#radialGradient) paint servers into CSS-like gradient strings. */
        function resolveSvgGradientPaint(el: SVGElement, styles: Record<string, unknown>): void {
          const fillAttr = el.getAttribute('fill') || '';
          const fillComputed = window.getComputedStyle(el).fill || '';
          const paintRef = [fillAttr, fillComputed].find((v) => v.includes('url(#'));
          if (!paintRef) return;
          const idMatch = paintRef.match(/url\(#([^)]+)\)/);
          if (!idMatch) return;
          const ref =
            el.ownerSVGElement?.getElementById(idMatch[1]) ||
            document.getElementById(idMatch[1]);
          if (!ref) return;
          const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
            const m = hex.match(/^#?([0-9a-fA-F]{6})$/);
            if (!m) return null;
            const v = m[1];
            const r = parseInt(v.slice(0, 2), 16);
            const g = parseInt(v.slice(2, 4), 16);
            const b = parseInt(v.slice(4, 6), 16);
            return { r, g, b };
          };
          const refTag = ref.tagName.toLowerCase();
          if (refTag === 'lineargradient') {
            const stops = Array.from(ref.querySelectorAll('stop'))
              .map((s) => {
                const offset = s.getAttribute('offset') || '0%';
                let color =
                  s.getAttribute('stop-color') ||
                  window.getComputedStyle(s).stopColor ||
                  '#000000';
                if (color.startsWith('var(')) {
                  color = resolveCssVarFromRoot(color) || color;
                }
                const stopOpacityRaw =
                  s.getAttribute('stop-opacity') || window.getComputedStyle(s).stopOpacity || '1';
                const stopOpacity = Math.max(0, Math.min(1, parseFloat(stopOpacityRaw) || 1));
                const rgbaAlpha = parseColorAlpha(color);
                const hex = cssColorToHex(color);
                const rgb = hex ? hexToRgb('#' + hex) : null;
                const a = Math.max(0, Math.min(1, rgbaAlpha * stopOpacity));
                if (rgb && a < 1 - 1e-6) {
                  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a}) ${offset}`;
                }
                return `${hex ? '#' + hex : color} ${offset}`;
              })
              .filter(Boolean);
            if (stops.length < 2) return;
            const x1 = parseFloat(ref.getAttribute('x1') || '0');
            const y1 = parseFloat(ref.getAttribute('y1') || '0');
            const x2 = parseFloat(ref.getAttribute('x2') || '100');
            const y2 = parseFloat(ref.getAttribute('y2') || '0');
            const angleRad = Math.atan2(y2 - y1, x2 - x1);
            const angleDeg = Math.round((angleRad * 180) / Math.PI + 90);
            styles.backgroundImage = `linear-gradient(${angleDeg}deg, ${stops.join(', ')})`;
          }
        }

        function applySvgShapeMetadata(info: any, element: Element): void {
          if (!isSvgNamespace(element)) return;
          const svgTag = element.tagName.toLowerCase();
          info.svgTag = svgTag;
          const cs = window.getComputedStyle(element);
          let dash =
            cs.getPropertyValue('stroke-dasharray') || (cs as any).strokeDasharray || '';
          if (!dash || dash === 'none') {
            const dashAttr = element.getAttribute('stroke-dasharray');
            if (dashAttr && dashAttr !== 'none') dash = dashAttr;
          }
          if (dash && dash !== 'none') info.svgStrokeDasharray = dash.trim();

          extractSvgMarkers(element, info);
          resolveSvgGradientPaint(element as SVGElement, info.styles);

          // Preserve solid SVG fill + fill-opacity as backgroundColor so converter can emit a fill with transparency.
          // (Gradients are handled via resolveSvgGradientPaint -> styles.backgroundImage.)
          if (!info.styles.backgroundImage || info.styles.backgroundImage === 'none') {
            const fillRaw = cs.fill || '';
            const hasFill =
              !!fillRaw &&
              fillRaw !== 'none' &&
              fillRaw !== 'transparent' &&
              fillRaw !== 'rgba(0, 0, 0, 0)' &&
              fillRaw !== 'rgba(0,0,0,0)';
            if (hasFill) {
              const fillOpacityRaw =
                cs.getPropertyValue('fill-opacity') || (cs as any).fillOpacity || '1';
              const fo = Math.max(0, Math.min(1, parseFloat(fillOpacityRaw) || 1));
              const a = Math.max(0, Math.min(1, parseColorAlpha(fillRaw) * fo));
              const hex = cssColorToHex(fillRaw);
              if (hex) {
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                info.styles.backgroundColor =
                  a < 1 - 1e-6 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
                info.styles.backgroundImage = 'none';
              }
            }
          }

          if (svgTag === 'line') {
            info.svgLineEndpoints = extractSvgLineEndpoints(element as SVGLineElement);
            return;
          }
          if (svgTag === 'path') {
            const pathEl = element as SVGPathElement;
            const d = pathEl.getAttribute('d') || '';
            const pathCmds = parseSvgPathCommands(d);
            if (pathCmds) {
              const bboxLeft = info.x;
              const bboxTop = info.y;
              const hasArc = pathCmds.some((c) => c.type === 'A');
              // PowerPoint custGeom arcTo does not reliably fill elliptical-arc regions
              // (cylinder DB icons show white gaps between bands). Sample the browser path instead.
              if (hasArc && isSvgFillVisible(cs)) {
                const len = pathEl.getTotalLength();
                const maxPts = Math.min(
                  160,
                  Math.max(32, Math.ceil(Number.isFinite(len) ? len / 1.2 : 48))
                );
                const screenPoints = sampleSvgPathScreenPoints(pathEl, maxPts);
                if (screenPoints.length >= 3) {
                  info.clipPathPolygonPx = screenPoints.map((p) => ({
                    x: p.x - bboxLeft,
                    y: p.y - bboxTop,
                  }));
                  info.svgPathClosed = /[zZ]/.test(d);
                  return;
                }
              }
              info.svgPathCommandsPx = pathCmds.map((cmd) => {
                if (cmd.type === 'Z') return { type: 'Z' as const };
                const ctm = pathEl.getScreenCTM();
                const scaleX = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
                const scaleY = ctm ? Math.hypot(ctm.c, ctm.d) : 1;
                if (cmd.type === 'A') {
                  const end = svgUserToScreen(pathEl, cmd.x, cmd.y);
                  return {
                    type: 'A' as const,
                    rx: cmd.rx * scaleX,
                    ry: cmd.ry * scaleY,
                    rot: cmd.rot,
                    large: cmd.large,
                    sweep: cmd.sweep,
                    x: end.x - bboxLeft,
                    y: end.y - bboxTop,
                  };
                }
                if (cmd.type === 'C') {
                  const s1 = svgUserToScreen(pathEl, cmd.x1, cmd.y1);
                  const s2 = svgUserToScreen(pathEl, cmd.x2, cmd.y2);
                  const s = svgUserToScreen(pathEl, cmd.x, cmd.y);
                  return {
                    type: 'C' as const,
                    x1: s1.x - bboxLeft,
                    y1: s1.y - bboxTop,
                    x2: s2.x - bboxLeft,
                    y2: s2.y - bboxTop,
                    x: s.x - bboxLeft,
                    y: s.y - bboxTop,
                  };
                }
                const s = svgUserToScreen(pathEl, cmd.x, cmd.y);
                return { type: cmd.type, x: s.x - bboxLeft, y: s.y - bboxTop };
              });
              info.svgPathClosed = /[zZ]/.test(d);
              return;
            }
            const straight = extractStraightPathLineEndpoints(pathEl);
            if (straight) {
              info.svgLineEndpoints = straight;
              return;
            }
          }
          const geomTags = new Set(['path', 'polygon', 'polyline']);
          if (!geomTags.has(svgTag)) return;
          const { screenPoints, closed } = extractSvgPathGeometry(element as SVGGraphicsElement);
          if (screenPoints.length < 2) return;
          const bboxLeft = info.x;
          const bboxTop = info.y;
          info.clipPathPolygonPx = screenPoints.map((p) => ({
            x: p.x - bboxLeft,
            y: p.y - bboxTop,
          }));
          info.svgPathClosed = closed;
        }

        /**
         * Check if element is visible
         */
        function getElementSelector(element: Element): string {
          if (!(element instanceof HTMLElement)) return element.tagName;
          const parts: string[] = [];
          let current: HTMLElement | null = element;
          while (current && current.tagName !== 'BODY') {
            let part = current.tagName;
            if (current.id) part += `#${current.id}`;
            if (current.className) {
              part += `.${Array.from(current.classList).join('.')}`;
            }
            parts.unshift(part);
            current = current.parentElement;
          }
          return `BODY > ${parts.join(' > ')}`;
        }

        /**
         * Check if element is visible
         */
        function isVisible(element: Element): boolean {
          // SVG elements (svg, path, etc.) are not HTMLElement but are Element
          if (!(element instanceof Element) || typeof element.getBoundingClientRect !== 'function') return false;

          const style = window.getComputedStyle(element);
          const rect = element.getBoundingClientRect();

          // For debugging specific element (disabled)
          // if (element instanceof HTMLElement && element.matches('body > div > header > div')) {
          //   _debugInfo.push(`[DEBUG] isVisible for element: ${element.tagName}.${element.className}`);
          //   _debugInfo.push(`[DEBUG]   display: ${style.display}, visibility: ${style.visibility}, opacity: ${style.opacity}`);
          //   _debugInfo.push(`[DEBUG]   rect: w=${rect.width}, h=${rect.height}`);
          //   _debugInfo.push(`[DEBUG]   textContent: '${element.textContent?.trim()}'`);
          //   _debugInfo.push(`[DEBUG]   fontSize: ${parseFloat(style.fontSize)}`);
          // }

          // Special case: Font Awesome icons should be included even with opacity: 0
          // because they often have CSS animations that start with opacity: 0
          const isFontAwesome = isFAIcon(element);

          // Basic visibility checks
          if (style.display === 'none' || style.visibility === 'hidden') return false;
          if (!isFontAwesome && style.opacity === '0') return false;

          // SVG stroke-only shapes may have zero width or height in getBoundingClientRect().
          if (isSvgNamespace(element)) {
            const svgTag = element.tagName.toLowerCase();
            if (svgTag === 'line' && isSvgPaintVisible(style)) return true;
            if (isSvgPaintVisible(style) && (rect.width > 0 || rect.height > 0)) return true;
          }

          if (rect.width <= 0) return false;

          // Special case: Elements with text content and font size > 0 are visible
          // even if height is 0 (e.g., line-height: 0 with large font-size)
          if (rect.height <= 0) {
            const hasTextContent = element.textContent && element.textContent.trim().length > 0;
            const fontSize = parseFloat(style.fontSize);
            if (hasTextContent && fontSize > 0) {
              return true; // Visible text with zero line-height
            }
            return false; // No text or zero font size with zero height
          }

          return true;
        }

        /**
         * Returns true if the element has a rotation in its computed transform
         * (rotate(...), matrix(...), or matrix3d(...)). Used to pass unrotated
         * size/position so PPTX doesn't double-apply rotation to AABB.
         */
        function hasTransformRotation(element: Element): boolean {
          const t = window.getComputedStyle(element).transform;
          if (!t || t === 'none') return false;
          return /rotate\s*\(/i.test(t) || /^matrix\s*\(/i.test(t) || /^matrix3d\s*\(/i.test(t);
        }

        /**
         * CSS hard color stops use the same % twice (e.g. `transparent 45%, orange 45%`).
         * PowerPoint/OOXML smears these; tiled radial dot grids (e.g. `gold 15%, transparent 15%`
         * with small background-size) cannot be expressed as one shape gradFill — raster fallback.
         */
        function gradientInnerHasAdjacentDuplicatePercentHardStop(inner: string): boolean {
          const pairRe = /\b(\d+(?:\.\d+)?)%\s*,([\s\S]+?)\s+\1%/g;
          pairRe.lastIndex = 0;
          return pairRe.test(inner);
        }

        function hasAdjacentDuplicatePercentHardStopInGradients(bg: string): boolean {
          const needles = ['linear-gradient(', 'radial-gradient(', 'repeating-radial-gradient('];
          for (const needle of needles) {
            let from = 0;
            while (true) {
              const start = bg.indexOf(needle, from);
              if (start === -1) break;
              let depth = 0;
              let i = start + needle.length;
              let end = -1;
              for (; i < bg.length; i++) {
                const c = bg[i];
                if (c === '(') depth++;
                else if (c === ')') {
                  if (depth === 0) {
                    end = i;
                    break;
                  }
                  depth--;
                }
              }
              if (end === -1) break;
              const inner = bg.slice(start + needle.length, end);
              if (gradientInnerHasAdjacentDuplicatePercentHardStop(inner)) return true;
              from = end + 1;
            }
          }
          return false;
        }

        function hasTiledRadialGradientBackground(bgImg: string, bgSize: string): boolean {
          if (!/radial-gradient\(|repeating-radial-gradient\(/i.test(bgImg)) return false;
          const isDefaultSize =
            !bgSize || bgSize === 'auto' || bgSize === 'auto auto' || bgSize === '100% 100%';
          return !isDefaultSize;
        }

        const CLIP_EPS = 1e-5;

        interface ClipPoint {
          x: number;
          y: number;
        }

        function parseLengthForClip(token: string, refSize: number): number {
          const t = token.trim();
          if (t.endsWith('%')) return (parseFloat(t) / 100) * refSize;
          return parseFloat(t);
        }

        function parsePolygonClipPath(
          cssValue: string,
          refW: number,
          refH: number,
          refLeft: number,
          refTop: number
        ): ClipPoint[] | null {
          const m = cssValue.match(/polygon\s*\(\s*([\s\S]*?)\s*\)/i);
          if (!m) return null;
          const raw = m[1].trim();
          const parts = raw.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
          const pts: ClipPoint[] = [];
          for (const part of parts) {
            const tokens = part.split(/\s+/).filter(Boolean);
            if (tokens.length < 2) continue;
            const x = parseLengthForClip(tokens[0], refW);
            const y = parseLengthForClip(tokens[1], refH);
            pts.push({ x: refLeft + x, y: refTop + y });
          }
          return pts.length >= 3 ? pts : null;
        }

        function intersectSegVertical(a: ClipPoint, b: ClipPoint, x: number): ClipPoint | null {
          const dx = b.x - a.x;
          if (Math.abs(dx) < CLIP_EPS) return null;
          const t = (x - a.x) / dx;
          if (t < -CLIP_EPS || t > 1 + CLIP_EPS) return null;
          return { x, y: a.y + t * (b.y - a.y) };
        }

        function intersectSegHorizontal(a: ClipPoint, b: ClipPoint, y: number): ClipPoint | null {
          const dy = b.y - a.y;
          if (Math.abs(dy) < CLIP_EPS) return null;
          const t = (y - a.y) / dy;
          if (t < -CLIP_EPS || t > 1 + CLIP_EPS) return null;
          return { x: a.x + t * (b.x - a.x), y };
        }

        function clipPolygonHalfPlane(
          poly: ClipPoint[],
          inside: (p: ClipPoint) => boolean,
          intersect: (a: ClipPoint, b: ClipPoint) => ClipPoint | null
        ): ClipPoint[] {
          const n = poly.length;
          if (n === 0) return [];
          const out: ClipPoint[] = [];
          for (let i = 0; i < n; i++) {
            const a = poly[i];
            const b = poly[(i + 1) % n];
            const aIn = inside(a);
            const bIn = inside(b);
            if (aIn && bIn) {
              out.push(b);
            } else if (aIn && !bIn) {
              const p = intersect(a, b);
              if (p) out.push(p);
            } else if (!aIn && bIn) {
              const p = intersect(a, b);
              if (p) out.push(p);
              out.push(b);
            }
          }
          return out;
        }

        function intersectConvexPolygonWithRect(
          poly: ClipPoint[],
          left: number,
          top: number,
          right: number,
          bottom: number
        ): ClipPoint[] | null {
          if (poly.length < 3) return null;
          let out = poly;
          out = clipPolygonHalfPlane(
            out,
            (p) => p.x >= left - CLIP_EPS,
            (a, b) => intersectSegVertical(a, b, left)
          );
          out = clipPolygonHalfPlane(
            out,
            (p) => p.x <= right + CLIP_EPS,
            (a, b) => intersectSegVertical(a, b, right)
          );
          out = clipPolygonHalfPlane(
            out,
            (p) => p.y >= top - CLIP_EPS,
            (a, b) => intersectSegHorizontal(a, b, top)
          );
          out = clipPolygonHalfPlane(
            out,
            (p) => p.y <= bottom + CLIP_EPS,
            (a, b) => intersectSegHorizontal(a, b, bottom)
          );
          return out.length >= 3 ? out : null;
        }

        function sortConvexPolygonVertices(pts: ClipPoint[]): ClipPoint[] {
          const cx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
          const cy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
          return [...pts].sort(
            (a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)
          );
        }

        function dedupePolygonVertices(pts: ClipPoint[]): ClipPoint[] {
          const out: ClipPoint[] = [];
          for (const p of pts) {
            const last = out[out.length - 1];
            if (!last || Math.hypot(p.x - last.x, p.y - last.y) > CLIP_EPS) out.push(p);
          }
          if (out.length >= 2) {
            const first = out[0];
            const last = out[out.length - 1];
            if (Math.hypot(first.x - last.x, first.y - last.y) < CLIP_EPS) out.pop();
          }
          return out;
        }

        function findPolygonClipPathOwner(
          element: Element
        ): { owner: Element; cssValue: string } | null {
          let node: Element | null = element;
          while (node) {
            const style = window.getComputedStyle(node) as CSSStyleDeclaration & { webkitClipPath?: string };
            const cp = style.clipPath && style.clipPath !== 'none'
              ? style.clipPath
              : style.webkitClipPath || '';
            if (cp && cp !== 'none' && /polygon\s*\(/i.test(cp)) {
              return { owner: node, cssValue: cp };
            }
            node = node.parentElement;
          }
          return null;
        }

        /** Map clip-path polygon from owner's local border box to viewport coordinates. */
        function clipPolygonLocalToViewport(
          owner: Element,
          localPoly: ClipPoint[],
          localW: number,
          localH: number
        ): ClipPoint[] | null {
          const rect = owner.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          const style = window.getComputedStyle(owner);
          const t = style.transform;
          if (!t || t === 'none') {
            return localPoly.map((p) => ({ x: rect.left + p.x, y: rect.top + p.y }));
          }
          const matrixMatch = t.match(
            /matrix(?:3d)?\s*\(\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)\s*,\s*([-\d.e]+)/
          );
          let a = 1;
          let b = 0;
          let c = 0;
          let d = 1;
          if (matrixMatch) {
            a = parseFloat(matrixMatch[1]);
            b = parseFloat(matrixMatch[2]);
            c = parseFloat(matrixMatch[3]);
            d = parseFloat(matrixMatch[4]);
          } else {
            const rotMatch = t.match(/rotate\s*\(\s*([-\d.]+)\s*(deg|turn|rad)?\s*\)/i);
            if (rotMatch) {
              let deg = parseFloat(rotMatch[1]);
              const unit = (rotMatch[2] || 'deg').toLowerCase();
              if (unit === 'turn') deg *= 360;
              else if (unit === 'rad') deg = (deg * 180) / Math.PI;
              const rad = (deg * Math.PI) / 180;
              a = Math.cos(rad);
              b = Math.sin(rad);
              c = -b;
              d = a;
            }
          }
          const origin = (style.transformOrigin || '50% 50%').trim().split(/\s+/);
          const ox = parseLengthForClip(origin[0] || '50%', localW);
          const oy = parseLengthForClip(origin[1] || origin[0] || '50%', localH);
          const layoutLeft = cx - localW / 2;
          const layoutTop = cy - localH / 2;
          return localPoly.map((p) => {
            const lx = p.x - ox;
            const ly = p.y - oy;
            return {
              x: layoutLeft + ox + a * lx + c * ly,
              y: layoutTop + oy + b * lx + d * ly,
            };
          });
        }

        function computeClipPathIntersection(
          element: Element,
          box: { x: number; y: number; width: number; height: number }
        ): {
          bbox: { left: number; top: number; width: number; height: number };
          pointsRelative: ClipPoint[];
          preserveLayoutBox?: boolean;
        } | null {
          const found = findPolygonClipPathOwner(element);
          if (!found) return null;
          const { owner, cssValue } = found;
          const isSelf = owner === element;

          // clip-path % are relative to the owner's border box (pre-transform). For a rotated
          // owner, getBoundingClientRect() is the axis-aligned bounding box — wrong for % refs.
          if (isSelf) {
            const w = box.width;
            const h = box.height;
            if (w <= 0 || h <= 0) return null;
            const localPoly = parsePolygonClipPath(cssValue, w, h, 0, 0);
            if (!localPoly || localPoly.length < 3) return null;
            let inter = intersectConvexPolygonWithRect(localPoly, 0, 0, w, h);
            if (!inter || inter.length < 3) return null;
            inter = dedupePolygonVertices(sortConvexPolygonVertices(inter));
            if (inter.length < 3) return null;
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const p of inter) {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            }
            const width = maxX - minX;
            const height = maxY - minY;
            if (width < 0.5 || height < 0.5) return null;
            if (hasTransformRotation(element)) {
              return {
                bbox: { left: box.x, top: box.y, width: w, height: h },
                pointsRelative: inter.map((p) => ({ x: p.x, y: p.y })),
                preserveLayoutBox: true,
              };
            }
            const pointsRelative = inter.map((p) => ({ x: p.x - minX, y: p.y - minY }));
            return {
              bbox: { left: box.x + minX, top: box.y + minY, width, height },
              pointsRelative,
            };
          }

          let clipPoly: ClipPoint[] | null = null;
          if (owner instanceof HTMLElement && hasTransformRotation(owner)) {
            const ow = owner.offsetWidth;
            const oh = owner.offsetHeight;
            if (ow > 0 && oh > 0) {
              const local = parsePolygonClipPath(cssValue, ow, oh, 0, 0);
              if (local && local.length >= 3) {
                clipPoly = clipPolygonLocalToViewport(owner, local, ow, oh);
              }
            }
          }
          if (!clipPoly) {
            const r = owner.getBoundingClientRect();
            clipPoly = parsePolygonClipPath(cssValue, r.width, r.height, r.left, r.top);
          }
          if (!clipPoly || clipPoly.length < 3) return null;

          const left = box.x;
          const top = box.y;
          const right = box.x + box.width;
          const bottom = box.y + box.height;
          let inter = intersectConvexPolygonWithRect(clipPoly, left, top, right, bottom);
          if (!inter || inter.length < 3) return null;
          inter = dedupePolygonVertices(sortConvexPolygonVertices(inter));
          if (inter.length < 3) return null;
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const p of inter) {
            minX = Math.min(minX, p.x);
            minY = Math.min(minY, p.y);
            maxX = Math.max(maxX, p.x);
            maxY = Math.max(maxY, p.y);
          }
          const width = maxX - minX;
          const height = maxY - minY;
          if (width < 0.5 || height < 0.5) return null;
          const pointsRelative = inter.map((p) => ({ x: p.x - minX, y: p.y - minY }));
          return {
            bbox: { left: minX, top: minY, width, height },
            pointsRelative,
          };
        }

        function parseRadiusPair(value: string, width: number, height: number): { rx: number; ry: number } {
          const txt = (value || '').trim();
          if (!txt) return { rx: 0, ry: 0 };
          const parts = txt.split(/\s+/).filter(Boolean);
          const parseToken = (token: string, base: number): number => {
            const t = token.trim();
            if (!t) return 0;
            if (t.endsWith('%')) {
              const n = parseFloat(t);
              return Number.isFinite(n) ? (n / 100) * base : 0;
            }
            const n = parseFloat(t);
            return Number.isFinite(n) ? n : 0;
          };
          const rx = Math.max(0, parseToken(parts[0], width));
          const ry = Math.max(0, parseToken(parts[1] || parts[0], height));
          return { rx, ry };
        }

        function sampleRoundedRectPolygon(element: Element, width: number, height: number): ClipPoint[] | null {
          if (!(element instanceof HTMLElement)) return null;
          if (width <= 0 || height <= 0) return null;
          const s = window.getComputedStyle(element);
          const tl = parseRadiusPair(s.borderTopLeftRadius, width, height);
          const tr = parseRadiusPair(s.borderTopRightRadius, width, height);
          const br = parseRadiusPair(s.borderBottomRightRadius, width, height);
          const bl = parseRadiusPair(s.borderBottomLeftRadius, width, height);

          // CSS border-radius normalization (avoid corner overlap).
          const topSum = tl.rx + tr.rx;
          const bottomSum = bl.rx + br.rx;
          const leftSum = tl.ry + bl.ry;
          const rightSum = tr.ry + br.ry;
          const scale = Math.min(
            1,
            topSum > 0 ? width / topSum : 1,
            bottomSum > 0 ? width / bottomSum : 1,
            leftSum > 0 ? height / leftSum : 1,
            rightSum > 0 ? height / rightSum : 1
          );
          if (scale < 1) {
            tl.rx *= scale; tl.ry *= scale;
            tr.rx *= scale; tr.ry *= scale;
            br.rx *= scale; br.ry *= scale;
            bl.rx *= scale; bl.ry *= scale;
          }

          const hasComplexRadius =
            Math.abs(tl.rx - tr.rx) > 0.1 ||
            Math.abs(tr.rx - br.rx) > 0.1 ||
            Math.abs(br.rx - bl.rx) > 0.1 ||
            Math.abs(tl.ry - tr.ry) > 0.1 ||
            Math.abs(tr.ry - br.ry) > 0.1 ||
            Math.abs(br.ry - bl.ry) > 0.1 ||
            Math.abs(tl.rx - tl.ry) > 0.1 ||
            Math.abs(tr.rx - tr.ry) > 0.1 ||
            Math.abs(br.rx - br.ry) > 0.1 ||
            Math.abs(bl.rx - bl.ry) > 0.1;

          if (!hasComplexRadius) return null;

          const points: ClipPoint[] = [];
          const arc = (
            cx: number,
            cy: number,
            rx: number,
            ry: number,
            start: number,
            end: number,
            segments: number
          ) => {
            if (rx <= 0 || ry <= 0) {
              points.push({ x: cx + rx * Math.cos(end), y: cy + ry * Math.sin(end) });
              return;
            }
            for (let i = 1; i <= segments; i++) {
              const t = start + ((end - start) * i) / segments;
              points.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
            }
          };

          points.push({ x: tl.rx, y: 0 });
          points.push({ x: width - tr.rx, y: 0 });
          arc(width - tr.rx, tr.ry, tr.rx, tr.ry, -Math.PI / 2, 0, 8);
          points.push({ x: width, y: height - br.ry });
          arc(width - br.rx, height - br.ry, br.rx, br.ry, 0, Math.PI / 2, 8);
          points.push({ x: bl.rx, y: height });
          arc(bl.rx, height - bl.ry, bl.rx, bl.ry, Math.PI / 2, Math.PI, 8);
          points.push({ x: 0, y: tl.ry });
          arc(tl.rx, tl.ry, tl.rx, tl.ry, Math.PI, (3 * Math.PI) / 2, 8);

          return dedupePolygonVertices(points);
        }

        /**
         * Serialize any valid CSS background-color to rgb()/rgba() so Node-side parseColor
         * can read it (e.g. rgb(30 64 175 / 1), lab(), hsl() from Tailwind v4).
         */
        function canonicalizeComputedBackgroundColor(cssColor: string): string {
          if (!cssColor) return cssColor;
          const t = cssColor.trim().toLowerCase();
          if (t === 'transparent' || t === 'rgba(0, 0, 0, 0)' || t === 'rgba(0,0,0,0)') {
            return cssColor;
          }
          try {
            const probe = document.createElement('div');
            probe.style.cssText =
              'position:absolute;left:-9999px;visibility:hidden;background-color:' + cssColor;
            document.documentElement.appendChild(probe);
            const resolved = window.getComputedStyle(probe).backgroundColor;
            document.documentElement.removeChild(probe);
            return resolved && resolved !== 'rgba(0, 0, 0, 0)' ? resolved : cssColor;
          } catch {
            return cssColor;
          }
        }

        /**
         * Read cascaded specified font-family (may still contain sans-serif/serif generics).
         * Walks ancestors for inherited stylesheet rules; falls back to computed font-family.
         */
        function getStylesheetFontFamily(el: Element): string | undefined {
          const matches: { ff: string; order: number }[] = [];
          let order = 0;
          try {
            for (const sheet of Array.from(document.styleSheets)) {
              let rules: CSSRuleList;
              try {
                rules = sheet.cssRules;
              } catch {
                continue;
              }
              for (let i = 0; i < rules.length; i++) {
                const rule = rules[i];
                if (rule instanceof CSSStyleRule) {
                  try {
                    if (el.matches(rule.selectorText)) {
                      const ff = rule.style.getPropertyValue('font-family');
                      if (ff) matches.push({ ff, order: order++ });
                    }
                  } catch {
                    /* invalid selector */
                  }
                }
              }
            }
          } catch {
            /* ignore */
          }
          return matches.length ? matches[matches.length - 1]!.ff : undefined;
        }

        function getSpecifiedFontFamily(element: Element): string | undefined {
          let el: Element | null = element;
          while (el) {
            const htmlEl = el as HTMLElement;
            const inline = htmlEl.style?.fontFamily;
            if (inline) return inline;

            const fromSheet = getStylesheetFontFamily(el);
            if (fromSheet) return fromSheet;

            el = el.parentElement;
          }

          try {
            const computed = window.getComputedStyle(element).fontFamily;
            if (computed) return computed;
          } catch {
            /* ignore */
          }
          return undefined;
        }

        /**
         * Get computed styles for an element
         */
        function getComputedStyles(element: Element): any {
          const style = window.getComputedStyle(element);

          const base: any = {
            color: style.color,
            fontSize: style.fontSize,
            fontFamily: style.fontFamily,
            fontFamilySpecified: getSpecifiedFontFamily(element),
            fontWeight: style.fontWeight,
            fontStyle: style.fontStyle,
            textDecoration: style.textDecoration,
            textAlign: style.textAlign,
            writingMode: style.writingMode,
            lineHeight: style.lineHeight,
            letterSpacing: style.letterSpacing,
            backgroundColor: canonicalizeComputedBackgroundColor(style.backgroundColor),
            backgroundImage: style.backgroundImage,
            filter: style.filter,
            backgroundClip: style.backgroundClip,
            webkitBackgroundClip: (style as any).webkitBackgroundClip,
            webkitTextFillColor: (style as any).webkitTextFillColor,
            webkitTextStroke: style.getPropertyValue('-webkit-text-stroke'),
            webkitTextStrokeWidth: style.getPropertyValue('-webkit-text-stroke-width'),
            webkitTextStrokeColor: style.getPropertyValue('-webkit-text-stroke-color'),
            opacity: parseFloat(style.opacity),
            borderColor: style.borderColor,
            borderWidth: style.borderWidth,
            borderStyle: style.borderStyle,
            borderRadius: style.borderRadius,
            // Individual border sides
            borderLeftWidth: style.borderLeftWidth,
            borderRightWidth: style.borderRightWidth,
            borderTopWidth: style.borderTopWidth,
            borderBottomWidth: style.borderBottomWidth,
            borderLeftColor: style.borderLeftColor,
            borderRightColor: style.borderRightColor,
            borderTopColor: style.borderTopColor,
            borderBottomColor: style.borderBottomColor,
            borderLeftStyle: style.borderLeftStyle,
            borderRightStyle: style.borderRightStyle,
            borderTopStyle: style.borderTopStyle,
            borderBottomStyle: style.borderBottomStyle,
            boxShadow: style.boxShadow,
            textShadow: style.textShadow,
            display: style.display,
            visibility: style.visibility,
            zIndex: style.zIndex,
            transform: style.transform,
            // Flexbox properties
            flexDirection: style.flexDirection,
            justifyContent: style.justifyContent,
            alignItems: style.alignItems,
            justifyItems: (style as any).justifyItems,
            placeItems: (style as any).placeItems,
            paddingTop: style.paddingTop,
            paddingRight: style.paddingRight,
            paddingBottom: style.paddingBottom,
            paddingLeft: style.paddingLeft,
            // Margins
            marginTop: style.marginTop,
            marginRight: style.marginRight,
            marginBottom: style.marginBottom,
            marginLeft: style.marginLeft,
            listStyleType: style.listStyleType,
            objectFit: style.objectFit,
            textTransform: style.textTransform,
          };

          if (!isSvgNamespace(element)) return base;

          const tag = element.tagName.toLowerCase();
          if (tag === 'text' || tag === 'tspan') {
            // SVG text paint comes from fill, not CSS color (which stays rgb(0,0,0) in Chromium).
            const fill = style.fill;
            if (
              fill &&
              fill !== 'none' &&
              fill !== 'transparent' &&
              fill !== 'rgba(0, 0, 0, 0)' &&
              fill !== 'rgba(0,0,0,0)'
            ) {
              base.color = fill;
            }
            const fillOpacityRaw = style.getPropertyValue('fill-opacity');
            if (fillOpacityRaw) {
              const fillOpacity = parseFloat(fillOpacityRaw);
              if (!Number.isNaN(fillOpacity) && fillOpacity < 1) {
                base.opacity = (base.opacity ?? 1) * fillOpacity;
              }
            }
            const anchor = style.getPropertyValue('text-anchor');
            if (anchor === 'middle') base.textAlign = 'center';
            else if (anchor === 'end') base.textAlign = 'right';
            else if (anchor === 'start') base.textAlign = base.textAlign || 'left';
          }

          const svgShapeTags = new Set([
            'rect',
            'circle',
            'ellipse',
            'path',
            'polygon',
            'polyline',
            'line',
            'use',
            'image',
          ]);
          if (svgShapeTags.has(tag)) {
            const fill = style.fill;
            if (fill && fill !== 'none' && fill !== 'transparent') {
              base.backgroundColor = fill;
            }
            const stroke = style.stroke;
            const sw = style.getPropertyValue('stroke-width');
            const swNum = parseFloat(sw) || 0;
            if (stroke && stroke !== 'none' && swNum > 0) {
              base.borderColor = stroke;
              base.borderWidth = swNum;
              base.borderTopWidth = sw;
              base.borderRightWidth = sw;
              base.borderBottomWidth = sw;
              base.borderLeftWidth = sw;
              base.borderTopColor = stroke;
              base.borderRightColor = stroke;
              base.borderBottomColor = stroke;
              base.borderLeftColor = stroke;
              base.borderTopStyle = 'solid';
              base.borderRightStyle = 'solid';
              base.borderBottomStyle = 'solid';
              base.borderLeftStyle = 'solid';
              const strokeOpacityRaw = style.getPropertyValue('stroke-opacity');
              if (strokeOpacityRaw) {
                const strokeOpacity = parseFloat(strokeOpacityRaw);
                if (!Number.isNaN(strokeOpacity) && strokeOpacity < 1) {
                  base.opacity = (base.opacity ?? 1) * strokeOpacity;
                }
              }
            }
            const rxAttr = element.getAttribute('rx');
            if (rxAttr) {
              base.borderRadius = `${rxAttr}px`;
            } else {
              const rxComputed = style.getPropertyValue('rx');
              if (rxComputed) base.borderRadius = rxComputed;
            }
            if (tag === 'circle') {
              const r = parseFloat(element.getAttribute('r') || '0');
              if (r > 0) base.borderRadius = `${r}px`;
            } else if (tag === 'ellipse') {
              const rx = parseFloat(element.getAttribute('rx') || '0');
              const ry = parseFloat(element.getAttribute('ry') || String(rx) || '0');
              if (rx > 0 || ry > 0) base.borderRadius = `${Math.max(rx, ry)}px`;
            }
          }

          return base;
        }

        /**
         * Check if element is a Font Awesome icon
         */
        function isFontAwesomeIcon(element: HTMLElement): boolean {
          const classList = element.classList;
          return (
            element.tagName.toLowerCase() === 'i' &&
            (classList.contains('fa') ||
              classList.contains('fas') ||
              classList.contains('far') ||
              classList.contains('fab') ||
              classList.contains('fal') ||
              classList.contains('fad') ||
              classList.contains('fa-solid') ||
              classList.contains('fa-regular') ||
              classList.contains('fa-brands'))
          );
        }

        /**
         * True when every visible element child participates in inline flow (no block/flex/grid layout).
         * Used for bordered wrappers like .sub-item that hold inline title + body divs.
         */
        function hasOnlyInlineFlowChildren(element: Element): boolean {
          let hasElementChild = false;
          for (const ch of Array.from(element.children)) {
            if (!(ch instanceof Element) || !isVisible(ch)) continue;
            hasElementChild = true;
            const d = window.getComputedStyle(ch).display;
            if (
              d === 'block' ||
              d === 'flex' ||
              d === 'inline-flex' ||
              d === 'grid' ||
              d === 'flow-root' ||
              d === 'list-item' ||
              d === 'table'
            ) {
              return false;
            }
          }
          return hasElementChild;
        }

        /**
         * Determine element type
         */
        function getElementType(element: Element): string {
          const tag = element.tagName.toLowerCase();

          if (tag === 'img') return 'image';
          if (tag === 'video') return 'video';
          if (tag === 'audio') return 'audio';
          if (tag === 'canvas') return 'canvas';
          if (tag === 'math') return 'math';
          if (tag === 'svg') return 'svg';
          if (tag === 'table') return 'table';

          // SVG child elements (decomposed standalone SVG or large HTML-embedded SVG)
          if (isSvgNamespace(element)) {
            if (tag === 'text' || tag === 'tspan') {
              if (element.textContent?.trim()) return 'text';
              return 'container';
            }
            if (
              tag === 'use' ||
              tag === 'rect' ||
              tag === 'circle' ||
              tag === 'ellipse' ||
              tag === 'path' ||
              tag === 'polygon' ||
              tag === 'polyline' ||
              tag === 'line' ||
              tag === 'image'
            ) {
              if (isSvgPaintVisible(window.getComputedStyle(element))) return 'shape';
              const r = element.getBoundingClientRect();
              if (r.width > 0 && r.height > 0) return 'shape';
              return 'container';
            }
            if (tag === 'g' || tag === 'switch' || tag === 'a') return 'container';
            return 'container';
          }

          // KaTeX: only <math> inside .katex-mathml is converted; .katex-html is visual-only.
          if (element.closest('.katex')) {
            if (element.closest('.katex-html')) return 'container';
            if (
              element instanceof HTMLElement &&
              (element.classList.contains('katex') || element.classList.contains('katex-mathml'))
            ) {
              return 'container';
            }
            if (element.closest('.katex-mathml')) return 'container';
          }

          // Check for Font Awesome icons
          if (isFontAwesomeIcon(element as HTMLElement)) {
            return 'icon';
          }

          // Heading elements (h1-h6) should always be treated as text,
          // even if they contain child elements (spans, icons, etc.)
          if (/^h[1-6]$/.test(tag)) {
            const textContent = element.textContent?.trim();
            if (textContent) {
              return 'text';
            }
          }

          // Strong, em, b, i (non-icon), u, etc. should be text if they have content
          const inlineTextTags = ['strong', 'em', 'b', 'u', 'span', 'a', 'label', 'p'];
          if (inlineTextTags.includes(tag)) {
            const textContent = element.textContent?.trim();
            if (textContent && !isFontAwesomeIcon(element as HTMLElement)) {
              return 'text';
            }
          }

          // Check if element has direct text content (text nodes)
          const hasText = element.childNodes.length > 0 &&
            Array.from(element.childNodes).some(
              (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()
            );

          // Check if it's a container with background/border
          const style = window.getComputedStyle(element);

          // Helper: check if color is visible (not transparent)
          const isColorVisible = (color: string): boolean => {
            return color !== 'rgba(0, 0, 0, 0)' &&
                   color !== 'transparent' &&
                   color !== 'none';
          };

          // Check for visible background
          const hasVisibleBackground =
            isColorVisible(style.backgroundColor) ||
            style.backgroundImage !== 'none';

          // Check for visible border (must have both width AND non-transparent color)
          const hasVisibleBorder =
            (parseFloat(style.borderLeftWidth) > 0 && isColorVisible(style.borderLeftColor)) ||
            (parseFloat(style.borderRightWidth) > 0 && isColorVisible(style.borderRightColor)) ||
            (parseFloat(style.borderTopWidth) > 0 && isColorVisible(style.borderTopColor)) ||
            (parseFloat(style.borderBottomWidth) > 0 && isColorVisible(style.borderBottomColor));

          // KaTeX wrappers (.formula etc.): editable math comes from .katex-mathml only.
          const hostsKatex =
            element instanceof HTMLElement && element.querySelector('.katex') !== null;
          if (hostsKatex && (hasVisibleBackground || hasVisibleBorder)) {
            return 'shape';
          }

          // Determine type based on visual properties and content
          // If element has both background/border AND text, treat as text (with fill) to preserve content
          if ((hasVisibleBackground || hasVisibleBorder) && hasText) {
            return 'text';
          }
          // Bordered wrapper with only inline-level text children (e.g. .sub-item > title + body divs)
          const hasDescendantText = !!(element.textContent?.trim());
          if (
            hasVisibleBorder &&
            !hasText &&
            hasDescendantText &&
            hasOnlyInlineFlowChildren(element) &&
            !hostsKatex
          ) {
            return 'text';
          }
          if (hasVisibleBackground || hasVisibleBorder) {
            return 'shape';
          }

          // If element has direct text content, treat as text (even if it has child elements)
          if (hasText) {
            return 'text';
          }

          return 'container';
        }

        /**
         * Get text content from element
         * Manually traverses text nodes and converts <br> to \n, avoiding pseudo-element content
         * (Since we extract ::before/::after separately, we must not include their content here)
         * @param excludeSubtrees - if provided, text inside these elements is omitted (used when those children are emitted as separate elements)
         */
        function getTextContent(element: Element, excludeSubtrees?: Set<Element>): string {
          const parts: string[] = [];

          function traverse(node: Node): void {
            if (node.nodeType === Node.TEXT_NODE) {
              const text = node.textContent || '';
              if (text.trim()) {
                parts.push(text);
              }
            } else if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as Element;
              if (excludeSubtrees && excludeSubtrees.has(el)) {
                return; // Skip this subtree (child is emitted as separate element)
              }
              if (isKatexSubtreeForTextOmit(el as HTMLElement)) return;
              // <br> becomes line break
              if (el.tagName.toLowerCase() === 'br') {
                parts.push('\n');
              } else {
                // Traverse children
                node.childNodes.forEach(traverse);
              }
            }
          }

          traverse(element);
          let text = parts.join('').replace(/ +/g, ' ').trim();
          const style = window.getComputedStyle(element);
          if (style.textTransform === 'uppercase') {
            text = text.toUpperCase();
          }
          return text;
        }

        /**
         * Extract rich text structure from element with styled children
         * Returns array of text runs with individual styles
         * @param excludeSubtrees - same as getTextContent: omit children emitted as separate ElementInfo (e.g. badge span)
         */
        function getTextHighlightBackdrop(element: HTMLElement): string | undefined {
          let el: HTMLElement | null = element.parentElement;
          while (el) {
            const bg = canonicalizeComputedBackgroundColor(window.getComputedStyle(el).backgroundColor);
            if (
              bg &&
              bg !== 'rgba(0, 0, 0, 0)' &&
              bg !== 'rgba(0,0,0,0)' &&
              bg !== 'transparent' &&
              bg !== 'none'
            ) {
              return bg;
            }
            el = el.parentElement;
          }
          return undefined;
        }

        function extractRichText(element: HTMLElement, excludeSubtrees?: Set<Element>): any[] | null {
          const runs: any[] = [];
          let hasMultipleStyles = false;
          /** Next text run follows an HTML &lt;br&gt; — use OOXML soft break, not a new a:p */
          let softBreakBeforeNextRun = false;

          /**
           * Block-level DOM children inside a flex row are often computed as display:block but still
           * sit on one line with siblings (e.g. footer-horizontal). Those must not become separate
           * a:p paragraphs in PPTX. Walk up past display:contents to the nearest non-contents ancestor
           * before `root`; if we hit the root, use its flex state.
           */
          function laysOutChildrenInHorizontalFlexRow(node: HTMLElement, root: HTMLElement): boolean {
            let p: HTMLElement | null = node.parentElement;
            while (p) {
              if (p === root) {
                const ps = window.getComputedStyle(p);
                const d = ps.display;
                if (d === 'contents') return false;
                const fd = ps.flexDirection || 'row';
                return (
                  (d === 'flex' || d === 'inline-flex') &&
                  (fd === 'row' || fd === 'row-reverse')
                );
              }
              const ps = window.getComputedStyle(p);
              const d = ps.display;
              if (d === 'contents') {
                p = p.parentElement;
                continue;
              }
              if (d === 'flex' || d === 'inline-flex') {
                const fd = ps.flexDirection || 'row';
                return fd === 'row' || fd === 'row-reverse';
              }
              return false;
            }
            return false;
          }

          function isExcludedElement(el: Element): boolean {
            if (!excludeSubtrees?.size) return false;
            if (excludeSubtrees.has(el)) return true;
            let p: Node | null = el.parentNode;
            while (p && p !== element) {
              if (p.nodeType === Node.ELEMENT_NODE && excludeSubtrees.has(p as Element)) return true;
              p = p.parentNode;
            }
            return false;
          }

          /** True when this node's own box paints a non-transparent background (color or image). */
          function hasOwnVisibleBackgroundFill(s: any): boolean {
            const bc = s?.backgroundColor;
            if (
              bc &&
              bc !== 'rgba(0, 0, 0, 0)' &&
              bc !== 'rgba(0,0,0,0)' &&
              bc !== 'transparent' &&
              bc !== 'none'
            ) {
              return true;
            }
            const bi = s?.backgroundImage;
            return !!(bi && bi !== 'none');
          }

          /**
           * OOXML a:highlight comes from pptxgen run `options.highlight` → getTextOptions(backgroundColor).
           * Descendants (e.g. <sub>) have transparent computed background while the paint comes from an
           * ancestor (e.g. <span class="equation">); propagate that color onto styles passed to child runs.
           */
          function mergeAncestorHighlightForRichTextRuns(nodeStyles: any, parentInherited: any): any {
            if (hasOwnVisibleBackgroundFill(nodeStyles)) {
              return nodeStyles;
            }
            const pb = parentInherited?.backgroundColor;
            if (
              !pb ||
              pb === 'rgba(0, 0, 0, 0)' ||
              pb === 'rgba(0,0,0,0)' ||
              pb === 'transparent' ||
              pb === 'none'
            ) {
              return nodeStyles;
            }
            return {
              ...nodeStyles,
              backgroundColor: pb,
              ...(parentInherited.highlightBackdropColor != null
                ? { highlightBackdropColor: parentInherited.highlightBackdropColor }
                : {}),
              ...(parentInherited.glyphHighlightColor
                ? { glyphHighlightColor: parentInherited.glyphHighlightColor }
                : {}),
            };
          }

          function processNode(node: Node, inheritedStyles: any): void {
            if (node.nodeType === Node.TEXT_NODE) {
              // Replace newlines with space: HTML source newlines display as space, but pptxgenjs
              // interprets \n as paragraph break (would split one <p> into many). Only replace \n/\r,
              // preserve other whitespace to minimize layout impact.
              const raw = node.textContent || '';
              let text = raw.replace(/[\r\n]+/g, ' ').replace(/ +/g, ' ');
              if (inheritedStyles.textTransform === 'uppercase') {
                text = text.toUpperCase();
              } //.replace(/ +/g, ' ');
              if (text) {
                runs.push({
                  text: text,
                  styles: inheritedStyles,
                  ...(softBreakBeforeNextRun ? { softBreakBefore: true } : {}),
                });
                softBreakBeforeNextRun = false;
              }
            } else if (node.nodeType === Node.ELEMENT_NODE && node instanceof HTMLElement) {
              if (isExcludedElement(node)) return;
              if (isKatexSubtreeForTextOmit(node)) return;
              // <br> — soft line within one paragraph (pptxgen softBreakBefore), not \n → multiple a:p
              if (node.tagName.toLowerCase() === 'br') {
                if (softBreakBeforeNextRun) {
                  // <br><br>: blank line — carrier run must carry host font metrics (pptxgen otherwise
                  // uses default ~18pt for line height on <a:br/> lines → oversized paragraph gap).
                  runs.push({
                    text: '\u200b',
                    styles: elementStyles,
                    softBreakBefore: true,
                  });
                } else {
                  softBreakBeforeNextRun = true;
                }
                return;
              }
              // Skip decorative elements with no text
              if (!node.textContent?.trim()) return;

              const childStyles = getComputedStyles(node);
              const isBlock = childStyles.display === 'block';

              if (node instanceof HTMLElement) {
                const markerBg = markerHighlightAfterBackground(node);
                if (markerBg) {
                  childStyles.backgroundColor = markerBg;
                }
              }

              if (
                childStyles.backgroundColor &&
                childStyles.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                childStyles.backgroundColor !== 'transparent'
              ) {
                const backdrop = getTextHighlightBackdrop(node);
                if (backdrop) childStyles.highlightBackdropColor = backdrop;
              }

              // Check if this child has different style than parent.
              // Include font-size so smaller/larger inline spans are preserved as rich text runs.
              if (inheritedStyles.color !== childStyles.color) hasMultipleStyles = true;
              if (inheritedStyles.opacity !== childStyles.opacity) hasMultipleStyles = true;
              if (inheritedStyles.fontWeight !== childStyles.fontWeight) hasMultipleStyles = true;
              if (inheritedStyles.fontStyle !== childStyles.fontStyle) hasMultipleStyles = true;
              if (inheritedStyles.fontSize !== childStyles.fontSize) hasMultipleStyles = true;
              if (inheritedStyles.textDecoration !== childStyles.textDecoration) hasMultipleStyles = true;
              if (inheritedStyles.backgroundColor !== childStyles.backgroundColor) hasMultipleStyles = true;

              const runCountBefore = runs.length;
              const mergedForChildren = mergeAncestorHighlightForRichTextRuns(
                childStyles,
                inheritedStyles
              );
              // Inline "pill" (inline-block + border-radius + fill): getTextOptions skips a:highlight
              // when isPillBox. Rich-text runs still need the same a:highlight on every a:r (text + sub).
              function richTextParentNeedsGlyphHighlightField(s: any): boolean {
                const d = s?.display;
                if (d !== 'inline' && d !== 'inline-block') return false;
                const bc = s?.backgroundColor;
                if (
                  !bc ||
                  bc === 'rgba(0, 0, 0, 0)' ||
                  bc === 'rgba(0,0,0,0)' ||
                  bc === 'transparent'
                ) {
                  return false;
                }
                const br = s?.borderRadius;
                return !!(br && br !== '0' && br !== '0px');
              }
              let stylesPassedToChildRuns = mergedForChildren;
              if (richTextParentNeedsGlyphHighlightField(childStyles)) {
                const bc = childStyles.backgroundColor;
                stylesPassedToChildRuns = {
                  ...mergedForChildren,
                  glyphHighlightColor: bc,
                };
              }
              node.childNodes.forEach((child) => processNode(child, stylesPassedToChildRuns));

              // display:block elements = new paragraph (a:p), add breakLine after last run
              if (
                isBlock &&
                runs.length > runCountBefore &&
                !laysOutChildrenInHorizontalFlexRow(node, element)
              ) {
                runs[runs.length - 1].breakLine = true;
              }
            }
          }

          const elementStyles = getComputedStyles(element);
          element.childNodes.forEach((child) => processNode(child, elementStyles));

          // Trim only at element boundaries; per-node trim() drops spaces between inline siblings.
          if (runs.length > 0) {
            runs[0].text = runs[0].text.replace(/^\s+/, '');
            runs[runs.length - 1].text = runs[runs.length - 1].text.replace(/\s+$/, '');
          }

          // Only return rich text if there are multiple styles
          return hasMultipleStyles && runs.length > 0 ? runs : null;
        }

        /**
         * Get only direct text nodes (used for specific cases)
         */
        function getDirectTextContent(element: HTMLElement): string {
          let text = '';
          element.childNodes.forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              text += node.textContent || '';
            }
          });
          return text.trim();
        }

        /**
         * Get Font Awesome icon content from ::before pseudo-element
         */
        function getFontAwesomeContent(element: HTMLElement): string {
          const beforeStyle = window.getComputedStyle(element, '::before');
          let content = beforeStyle.getPropertyValue('content');

          // Content might be empty string, 'none', or actual unicode
          if (!content || content === 'none' || content === '""' || content === "''") {
            // Fallback: try to get text content directly
            // Font Awesome 6 might render the icon as actual text content
            const textContent = element.textContent || '';
            if (textContent.trim()) {
              return textContent.trim();
            }
            // If still empty, return a placeholder (FA icons use unicode in Private Use Area)
            // We'll return a generic icon character
            return '\uf111'; // fa-circle as fallback
          }

          // Remove quotes and convert escaped unicode to actual characters
          content = content.replace(/^["']|["']$/g, '');

          // Handle escaped unicode like "\f123"
          if (content.includes('\\')) {
            content = content.replace(/\\([0-9a-fA-F]+)/g, (_, hex) => {
              return String.fromCharCode(parseInt(hex, 16));
            });
          }

          return content;
        }

        /**
         * Extract table data including column widths and row heights from rendered layout
         */
        function extractTableData(table: HTMLTableElement): any {
          const rows: any[] = [];
          const trs = Array.from(table.querySelectorAll('tr'));

          // Compute column count from first row
          let colCount = 0;
          const firstRowCells = trs[0]?.querySelectorAll('td, th');
          if (firstRowCells?.length) {
            firstRowCells.forEach((c) => {
              colCount += (c as HTMLTableCellElement).colSpan || 1;
            });
          }
          const colWidths: number[] = new Array(colCount).fill(0);
          const rowHeights: number[] = [];

          trs.forEach((tr) => {
            const cells: any[] = [];
            const trRect = tr.getBoundingClientRect();
            rowHeights.push(trRect.height);

            let colIdx = 0;
            tr.querySelectorAll('td, th').forEach((cell) => {
              if (cell instanceof HTMLElement) {
                const style = window.getComputedStyle(cell);
                const cSpan = (cell as HTMLTableCellElement).colSpan || 1;
                const cellRect = cell.getBoundingClientRect();
                const wPerCol = cSpan > 0 ? cellRect.width / cSpan : 0;
                for (let k = 0; k < cSpan && colIdx + k < colCount; k++) {
                  colWidths[colIdx + k] = Math.max(colWidths[colIdx + k] || 0, wPerCol);
                }
                colIdx += cSpan;

                cells.push({
                  text: cell.textContent?.trim() || '',
                  colSpan: cSpan,
                  rowSpan: (cell as HTMLTableCellElement).rowSpan || 1,
                  styles: {
                    color: style.color,
                    fontSize: style.fontSize,
                    fontFamily: style.fontFamily,
                    fontWeight: style.fontWeight,
                    backgroundColor: style.backgroundColor,
                    textAlign: style.textAlign,
                    borderTopWidth: style.borderTopWidth,
                    borderRightWidth: style.borderRightWidth,
                    borderBottomWidth: style.borderBottomWidth,
                    borderLeftWidth: style.borderLeftWidth,
                    borderTopColor: style.borderTopColor,
                    borderRightColor: style.borderRightColor,
                    borderBottomColor: style.borderBottomColor,
                    borderLeftColor: style.borderLeftColor,
                    borderTopStyle: style.borderTopStyle,
                    borderRightStyle: style.borderRightStyle,
                    borderBottomStyle: style.borderBottomStyle,
                    borderLeftStyle: style.borderLeftStyle,
                  },
                });
              }
            });

            if (cells.length > 0) {
              rows.push({ cells });
            }
          });

          const style = window.getComputedStyle(table);
          return {
            rows,
            colW: colCount > 0 ? colWidths : undefined,
            rowH: rowHeights.length > 0 ? rowHeights : undefined,
            borderColor: style.borderColor,
            borderWidth: style.borderWidth,
          };
        }

        /**
         * Convert CSS color string to hex for SVG (handles rgb, rgba, hex; oklch/oklab via canvas)
         */
        function cssColorToHex(color: string): string | null {
          if (!color || color === 'transparent' || color === 'none') return null;
          const rgb = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
          if (rgb) {
            const r = parseInt(rgb[1]).toString(16).padStart(2, '0');
            const g = parseInt(rgb[2]).toString(16).padStart(2, '0');
            const b = parseInt(rgb[3]).toString(16).padStart(2, '0');
            return (r + g + b).toUpperCase();
          }
          const hex8 = color.match(/^#([0-9A-Fa-f]{8})$/);
          if (hex8) return hex8[1].slice(0, 6).toUpperCase();
          if (/^#[0-9A-Fa-f]{6}$/.test(color)) return color.slice(1).toUpperCase();
          if (color.startsWith('oklch') || color.startsWith('oklab')) {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
            return [r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase();
          }
          return null;
        }

        /** Alpha (0–1) from rgba / #RRGGBBAA / oklch; opaque colors return 1 */
        function parseColorAlpha(color: string): number {
          if (!color || color === 'transparent' || color === 'none') return 1;
          const rgbaComma = color.match(/rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/i);
          if (rgbaComma) return parseFloat(rgbaComma[4]);
          const rgbSlash = color.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/i);
          if (rgbSlash) return rgbSlash[4] !== undefined ? parseFloat(rgbSlash[4]) : 1;
          const hex8 = color.match(/^#([0-9A-Fa-f]{8})$/i);
          if (hex8) return parseInt(hex8[1].slice(6, 8), 16) / 255;
          if (color.startsWith('oklch') || color.startsWith('oklab')) {
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const ctx = canvas.getContext('2d');
            if (!ctx) return 1;
            ctx.fillStyle = color;
            ctx.fillRect(0, 0, 1, 1);
            return ctx.getImageData(0, 0, 1, 1).data[3] / 255;
          }
          return 1;
        }

        /**
         * Resolve `var(--name)` using :root (variables live in page CSS, not in blob SVG).
         * Use this for SVG paint attrs — element getComputedStyle can be wrong during animation
         * (e.g. .dot pulse) or conflate stroke with fill.
         */
        function resolveCssVarFromRoot(attr: string): string | null {
          const m = attr.match(/var\s*\(\s*([^)]+)\s*\)/);
          if (!m) return null;
          const inner = m[1].trim();
          const parts = inner.split(',');
          const varName = parts[0].trim();
          const root = document.documentElement;
          let resolved = getComputedStyle(root).getPropertyValue(varName).trim();
          if (!resolved && parts.length > 1) {
            resolved = parts.slice(1).join(',').trim();
          }
          return resolved || null;
        }

        /**
         * Apply computed styles to SVG clone (replace currentColor, set fill/stroke/opacity from computed styles)
         * When cloning, stylesheet is lost so elements with CSS styling need their computed styles baked in.
         * We must resolve currentColor and copy computed fill/stroke/opacity to attributes.
         * IMPORTANT: Respect fill="none" — stroke-only SVGs must remain hollow.
         */
        function applyStylesToSvgClone(clone: SVGElement, originalSvg: SVGElement, fallbackColorHex: string): void {
          const colorVal = '#' + fallbackColorHex;
          // Set color attribute so 'currentColor' references resolve
          clone.setAttribute('color', colorVal);

          // Build a map from original elements to clone elements
          const originalToClone = new Map<Element, Element>();
          const mapElements = (orig: Element, cloned: Element) => {
            originalToClone.set(orig, cloned);
            const origChildren = Array.from(orig.children);
            const clonedChildren = Array.from(cloned.children);
            for (let i = 0; i < origChildren.length; i++) {
              if (i < clonedChildren.length) {
                mapElements(origChildren[i], clonedChildren[i]);
              }
            }
          };
          mapElements(originalSvg, clone);

          const walk = (origEl: Element, clonedEl: Element) => {
            const s = clonedEl.getAttribute('stroke');
            const f = clonedEl.getAttribute('fill');
            const c = clonedEl.getAttribute('color');
            const o = clonedEl.getAttribute('opacity');

            // Get computed styles from original element (before cloning, while CSS is still active)
            const computedStyle = window.getComputedStyle(origEl);

            // Blob SVG has no stylesheet — bake text-anchor so x/y anchor matches browser (e.g. middle-centered labels).
            const svgTextTag = origEl.localName?.toLowerCase();
            if (svgTextTag === 'text' || svgTextTag === 'tspan') {
              const textAnchor = computedStyle.getPropertyValue('text-anchor');
              if (textAnchor && textAnchor !== 'auto' && textAnchor !== 'inherit') {
                clonedEl.setAttribute('text-anchor', textAnchor);
              }
            }

            /**
             * Blob-loaded SVG has no document styles — `stroke="var(--c1)"` / `fill="var(--c1)"` won't resolve.
             * Bake getComputedStyle() results into attributes.
             */
            const resolvePaintAttr = (attrVal: string | null, computedPaint: string): string | null => {
              if (!attrVal || attrVal === 'none' || attrVal === 'transparent') return null;
              if (attrVal === 'currentColor') return colorVal;
              if (!attrVal.includes('var(')) {
                const h = cssColorToHex(attrVal);
                if (h) return '#' + h;
              } else {
                const fromRoot = resolveCssVarFromRoot(attrVal);
                if (fromRoot) {
                  const h = cssColorToHex(fromRoot);
                  if (h) return '#' + h;
                }
              }
              const fromComputed = cssColorToHex(computedPaint);
              return fromComputed ? '#' + fromComputed : null;
            };

            if (s === 'currentColor') {
              clonedEl.setAttribute('stroke', colorVal);
            } else if (s === 'none' || s === 'transparent') {
              clonedEl.setAttribute('stroke', 'none');
            } else {
              const resolvedStroke = resolvePaintAttr(s, computedStyle.stroke);
              if (resolvedStroke) {
                clonedEl.setAttribute('stroke', resolvedStroke);
              } else if (!s || s === 'inherit') {
                const computedStroke = cssColorToHex(computedStyle.stroke);
                if (computedStroke && computedStroke !== '000000') {
                  clonedEl.setAttribute('stroke', '#' + computedStroke);
                }
              }
            }

            // Bake stroke presentation attributes from CSS (clone loses stylesheet)
            const strokeWidth = computedStyle.getPropertyValue('stroke-width') || (computedStyle as any).strokeWidth;
            if (strokeWidth && strokeWidth !== 'none') clonedEl.setAttribute('stroke-width', strokeWidth);
            const strokeOpacity = computedStyle.getPropertyValue('stroke-opacity') || (computedStyle as any).strokeOpacity;
            if (strokeOpacity) clonedEl.setAttribute('stroke-opacity', strokeOpacity);
            const strokeDasharray = computedStyle.getPropertyValue('stroke-dasharray') || (computedStyle as any).strokeDasharray;
            if (strokeDasharray && strokeDasharray !== 'none') clonedEl.setAttribute('stroke-dasharray', strokeDasharray);
            const strokeDashoffset = computedStyle.getPropertyValue('stroke-dashoffset') || (computedStyle as any).strokeDashoffset;
            if (strokeDashoffset) clonedEl.setAttribute('stroke-dashoffset', strokeDashoffset);
            const strokeLinecap = computedStyle.getPropertyValue('stroke-linecap') || (computedStyle as any).strokeLinecap;
            if (strokeLinecap && strokeLinecap !== 'butt' && strokeLinecap !== 'inherit') {
              clonedEl.setAttribute('stroke-linecap', strokeLinecap);
            }
            const strokeLinejoin = computedStyle.getPropertyValue('stroke-linejoin') || (computedStyle as any).strokeLinejoin;
            if (strokeLinejoin && strokeLinejoin !== 'miter' && strokeLinejoin !== 'inherit') {
              clonedEl.setAttribute('stroke-linejoin', strokeLinejoin);
            }

            // Handle fill carefully to preserve fill="none" (stroke-only paths like .curve)
            const computedFillRaw = computedStyle.fill;
            const isFillNone = !computedFillRaw || computedFillRaw === 'none' || computedFillRaw === 'transparent' || computedFillRaw === 'rgba(0, 0, 0, 0)';
            const hasVarFill = !!(f && f.includes('var('));
            // Do not clear fill when a presentation fill is present: e.g. <use fill="#FFFFFF"> often
            // reports computed fill as transparent in Chromium; forcing "none" drops the paint and the
            // referenced <polygon> falls back to baked #000000 / color — wrong vs on-screen SVG.
            const noPresentationFill = !f || f === 'inherit';
            if (f === 'none' || (isFillNone && !hasVarFill && noPresentationFill)) {
              clonedEl.setAttribute('fill', 'none');
            } else if (hasVarFill) {
              const resolvedFill = resolvePaintAttr(f, computedStyle.fill);
              if (resolvedFill) {
                clonedEl.setAttribute('fill', resolvedFill);
              }
            } else if (f === 'currentColor') {
              clonedEl.setAttribute('fill', colorVal);
            } else if (!f || f === 'inherit') {
              const computedFill = cssColorToHex(computedStyle.fill);
              if (computedFill && computedFill !== '000000') {
                clonedEl.setAttribute('fill', '#' + computedFill);
              } else {
                let ancestor = clonedEl.parentElement;
                let inheritedNone = false;
                while (ancestor) {
                  const af = ancestor.getAttribute('fill');
                  if (af === 'none') { inheritedNone = true; break; }
                  if (af && af !== 'inherit') break;
                  ancestor = ancestor.parentElement;
                }
                if (!inheritedNone) {
                  // Geometry inside <defs> (e.g. <polygon id="hex">) is instanced via <use>.
                  // Baking fallback fill here sets a *definition* fill that wins over each
                  // <use fill="#FFFFFF"> in the shadow tree — all instances turn dark/black.
                  if (!origEl.closest('defs')) {
                    clonedEl.setAttribute('fill', colorVal);
                  }
                }
              }
            } else {
              const resolvedFill = resolvePaintAttr(f, computedStyle.fill);
              if (resolvedFill) {
                clonedEl.setAttribute('fill', resolvedFill);
              }
            }

            // Bake fill-opacity: rgba alpha is stripped when fill is written as opaque #hex
            if (!isFillNone && clonedEl.getAttribute('fill') !== 'none') {
              let fillAlpha = parseColorAlpha(computedFillRaw);
              const cssFillOpacity =
                computedStyle.getPropertyValue('fill-opacity') || (computedStyle as any).fillOpacity;
              if (cssFillOpacity && cssFillOpacity !== '1') {
                const fo = parseFloat(cssFillOpacity);
                if (!isNaN(fo)) fillAlpha *= fo;
              }
              if (fillAlpha < 1 - 1e-6) {
                clonedEl.setAttribute('fill-opacity', String(fillAlpha));
              }
            }

            // Preserve opacity if not already set
            if (!o && computedStyle.opacity && computedStyle.opacity !== '1') {
              clonedEl.setAttribute('opacity', computedStyle.opacity);
            }

            // Resolve currentColor for color attribute
            if (c === 'currentColor') clonedEl.setAttribute('color', colorVal);

            // Recursively process children
            const origChildren = Array.from(origEl.children);
            const clonedChildren = Array.from(clonedEl.children);
            for (let i = 0; i < origChildren.length; i++) {
              if (i < clonedChildren.length) {
                walk(origChildren[i], clonedChildren[i]);
              }
            }
          };
          walk(originalSvg, clone);
        }

        const MATHML_NS = 'http://www.w3.org/1998/Math/MathML';

        /**
         * Serialize <math> to MathML string, stripping MathJax preview annotations.
         */
        function serializeMathMl(mathEl: Element): string {
          const clone = mathEl.cloneNode(true) as Element;
          clone.querySelectorAll('annotation, annotation-xml').forEach((el) => el.remove());
          if (!clone.getAttribute('xmlns')) {
            clone.setAttribute('xmlns', MATHML_NS);
          }
          return new XMLSerializer().serializeToString(clone);
        }

        /**
         * KaTeX/MathJax hide <math> (often ~1px wide); use the visible renderer box for layout.
         */
        function resolveMathLayoutHost(mathEl: Element): Element {
          // MathJax v3 (tex-svg) renders visible output in <mjx-container> (SVG),
          // while the sibling/descendant <math> inside <mjx-assistive-mml> is visually hidden.
          // Screenshooting <math> leads to clipped/partial text (e.g. only '/n').
          const mjx = mathEl.closest('mjx-container');
          if (mjx) {
            const r = mjx.getBoundingClientRect();
            if (r.width > 4 && r.height > 4) return mjx;
          }
          const katex = mathEl.closest('.katex');
          if (katex) {
            const r = katex.getBoundingClientRect();
            if (r.width > 4 && r.height > 4) return katex;
          }
          const display = mathEl.closest('.katex-display, .MathJax_Display, .math-display');
          if (display) {
            const r = display.getBoundingClientRect();
            if (r.width > 4 && r.height > 4) return display;
          }
          return mathEl;
        }

        function getMathLayoutRect(mathEl: Element): DOMRect {
          return resolveMathLayoutHost(mathEl).getBoundingClientRect();
        }

        function getMathDisplayMode(mathEl: Element): 'block' | 'inline' {
          if (mathEl.closest('.katex-display, .MathJax_Display, .math-display')) return 'block';
          if (mathEl.getAttribute('display') === 'block') return 'block';
          const host = resolveMathLayoutHost(mathEl);
          const d = window.getComputedStyle(host).display;
          if (d === 'block' || d === 'flex' || d === 'grid' || d === 'table' || d === 'list-item') {
            return 'block';
          }
          return 'inline';
        }

        /**
         * MathJax v3 CHTML (tex-mml-chtml): visible formula is in mjx-math (often via ::before
         * per glyph). Editable MathML lives in mjx-assistive-mml > math only.
         */
        function isMathJaxVisualSubtree(element: Element): boolean {
          if (!(element instanceof Element)) return false;
          const tag = element.tagName.toLowerCase();
          // closest() only walks ancestors — mjx-container is not inside its descendant assistive-mml.
          if (tag === 'mjx-container' || tag === 'mjx-assistive-mml') return false;
          if (!element.closest('mjx-container')) return false;
          return element.closest('mjx-assistive-mml') === null;
        }

        function isMathJaxStructuralWrapper(element: Element): boolean {
          return (
            element instanceof HTMLElement && element.tagName.toLowerCase() === 'mjx-container'
          );
        }

        function isKatexSubtreeForTextOmit(element: Element): boolean {
          if (!(element instanceof HTMLElement)) return false;
          if (
            element.classList.contains('katex') ||
            element.classList.contains('katex-mathml') ||
            element.classList.contains('katex-html')
          ) {
            return true;
          }
          if (element.closest('.katex')) return true;
          return isMathJaxVisualSubtree(element);
        }

        function isKatexHtmlSubtree(element: Element): boolean {
          return (
            element instanceof HTMLElement &&
            (element.classList.contains('katex-html') || element.closest('.katex-html') !== null)
          );
        }

        function isKatexStructuralWrapper(element: Element): boolean {
          return (
            element instanceof HTMLElement &&
            (element.classList.contains('katex') || element.classList.contains('katex-mathml'))
          );
        }

        /** Native <math>, MathJax assistive MathML, or KaTeX .katex-mathml only — not CHTML/visual layers. */
        function isEditableMathElement(element: Element): boolean {
          if (element.tagName.toLowerCase() !== 'math') return false;
          if (element.closest('mjx-container')) {
            return element.closest('mjx-assistive-mml') !== null;
          }
          if (!element.closest('.katex')) return true;
          return element.closest('.katex-mathml') !== null;
        }

        function markMathHostMapped(mathEl: Element): void {
          markDomAsPptxMapped(mathEl);
          const mjx = mathEl.closest('mjx-container');
          if (mjx) markDomAsPptxMapped(mjx);
          const katexMathml = mathEl.closest('.katex-mathml');
          if (katexMathml) markDomAsPptxMapped(katexMathml);
          const katex = mathEl.closest('.katex');
          if (katex) {
            markDomAsPptxMapped(katex);
            const katexHtml = katex.querySelector('.katex-html');
            if (katexHtml) markDomAsPptxMapped(katexHtml);
          }
          const display = mathEl.closest('.katex-display, .MathJax_Display, .math-display');
          if (display) markDomAsPptxMapped(display);
        }

        /**
         * Decorative SVGs are rasterized via Playwright element screenshot (see needsScreenshot
         * backfill in inspectElements). PNG avoids pptxgenjs corrupt dual-media SVG packaging.
         */

        /**
         * True when ::after is a thin absolute bar used as a custom underline (content:'' + bg/border).
         * Such hosts must not stay merged into a wide parent text box — PPT lays out runs inside the
         * parent width and the bar's x no longer lines up with the child text.
         */
        /** ::after bar behind inline text (e.g. .highlight { position:relative } + ::after marker). */
        function isMarkerHighlightAfterPseudo(anchor: Element): boolean {
          if (!(anchor instanceof HTMLElement)) return false;
          const pa = window.getComputedStyle(anchor, '::after');
          const raw = pa.content;
          if (!raw || raw === 'none' || raw === 'normal') return false;
          const textContent = raw.replace(/^["']|["']$/g, '');
          if (textContent.length > 0) return false;
          const hasBg =
            pa.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
            pa.backgroundColor !== 'rgba(0,0,0,0)' &&
            pa.backgroundColor !== 'transparent';
          const hasBgImg = pa.backgroundImage !== 'none';
          if (!hasBg && !hasBgImg) return false;
          if (pa.position !== 'absolute' && pa.position !== 'fixed') return false;
          const ph = parseFloat(pa.height) || 0;
          if (ph <= 0 || ph > 16) return false;
          const z = parseInt(pa.zIndex, 10);
          if (!isNaN(z) && z < 0) return true;
          const bottom = parseFloat(pa.bottom);
          if (!isNaN(bottom) && bottom >= 0 && bottom <= 12) return true;
          return false;
        }

        function markerHighlightAfterBackground(anchor: HTMLElement): string | undefined {
          if (!isMarkerHighlightAfterPseudo(anchor)) return undefined;
          const pa = window.getComputedStyle(anchor, '::after');
          let bg = canonicalizeComputedBackgroundColor(pa.backgroundColor);
          if (!bg || bg === 'transparent' || bg === 'rgba(0, 0, 0, 0)' || bg === 'rgba(0,0,0,0)') {
            return undefined;
          }
          const pseudoAlpha = parseColorAlpha(bg);
          const paOpacity = parseFloat(pa.opacity) || 1;
          const a = Math.max(0, Math.min(1, pseudoAlpha * paOpacity));
          const hex = cssColorToHex(bg);
          if (hex && a < 1 - 1e-6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            return `rgba(${r}, ${g}, ${b}, ${a})`;
          }
          return bg;
        }

        function hasUnderlineBarAfter(anchor: Element): boolean {
          if (isMarkerHighlightAfterPseudo(anchor)) return false;
          if (!(anchor instanceof HTMLElement)) return false;
          const pa = window.getComputedStyle(anchor, '::after');
          const raw = pa.content;
          if (!raw || raw === 'none' || raw === 'normal') return false;
          const hasBg =
            pa.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
            pa.backgroundColor !== 'rgba(0,0,0,0)' &&
            pa.backgroundColor !== 'transparent';
          const hasBgImg = pa.backgroundImage !== 'none';
          const hasBdr =
            parseFloat(pa.borderTopWidth) > 0 ||
            parseFloat(pa.borderRightWidth) > 0 ||
            parseFloat(pa.borderBottomWidth) > 0 ||
            parseFloat(pa.borderLeftWidth) > 0;
          if (!hasBg && !hasBgImg && !hasBdr) return false;
          if (pa.position !== 'absolute' && pa.position !== 'fixed') return false;
          const ph = parseFloat(pa.height) || 0;
          const bh = parseFloat(pa.borderBottomWidth) || 0;
          const barH = Math.max(ph, bh);
          if (barH <= 0 || barH > 12) return false;
          return true;
        }

        /**
         * ::before/::after that only set typographic properties (color, font-size, …) — merge as rich-text
         * runs on the host instead of a separate text box (avoids rotation / contrast issues).
         */
        function isTypographyOnlyTextPseudo(pStyle: CSSStyleDeclaration): boolean {
          const rawContent = pStyle.content;
          if (!rawContent || rawContent === 'none' || rawContent === 'normal') return false;
          const textContent = rawContent.replace(/^["']|["']$/g, '');
          if (!textContent.length) return false;

          const hasBg =
            pStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
            pStyle.backgroundColor !== 'transparent';
          const hasBgImage = pStyle.backgroundImage !== 'none';
          const hasBorder =
            parseFloat(pStyle.borderTopWidth) > 0 ||
            parseFloat(pStyle.borderRightWidth) > 0 ||
            parseFloat(pStyle.borderBottomWidth) > 0 ||
            parseFloat(pStyle.borderLeftWidth) > 0;
          if (hasBg || hasBgImage || hasBorder) return false;

          const bs = pStyle.boxShadow;
          if (bs && bs !== 'none') return false;
          const filter = pStyle.filter;
          if (filter && filter !== 'none') return false;

          const bgClip = (pStyle as any).webkitBackgroundClip || pStyle.backgroundClip;
          if (bgClip === 'text') return false;

          const t = pStyle.transform;
          if (t && t !== 'none') {
            const identity =
              /^matrix\s*\(\s*1\s*,\s*0\s*,\s*0\s*,\s*1\s*,/.test(t) ||
              /^matrix3d\s*\(\s*1\s*,/.test(t);
            if (!identity) return false;
          }

          return true;
        }

        function shouldMergeTypographyPseudo(host: Element, pseudo: '::before' | '::after'): boolean {
          if (!(host instanceof HTMLElement)) return false;
          if (host.tagName.toLowerCase() === 'li') return false;
          if (pseudo === '::before' && isFontAwesomeIcon(host)) return false;
          if (getElementType(host) !== 'text') return false;
          return isTypographyOnlyTextPseudo(window.getComputedStyle(host, pseudo));
        }

        function buildTypographyPseudoRunStyles(host: HTMLElement, pseudo: '::before' | '::after'): any {
          const pStyle = window.getComputedStyle(host, pseudo);
          let effectiveOpacity = parseFloat(pStyle.opacity) || 1;
          let ancestor: HTMLElement | null = host;
          while (ancestor && ancestor !== document.body) {
            effectiveOpacity *= parseFloat(window.getComputedStyle(ancestor).opacity) || 1;
            ancestor = ancestor.parentElement;
          }
          return {
            color: pStyle.color,
            fontSize: pStyle.fontSize,
            fontFamily: pStyle.fontFamily,
            fontWeight: pStyle.fontWeight,
            fontStyle: pStyle.fontStyle,
            textDecoration: pStyle.textDecoration,
            letterSpacing: pStyle.letterSpacing,
            opacity: effectiveOpacity,
            display: 'inline',
          };
        }

        /** Box padding/border belong on the text frame (host getTextOptions), not per-run a:highlight padding. */
        function stripTextBoxChromeFromRunStyles(styles: any): any {
          const s = { ...styles };
          s.paddingTop = '0px';
          s.paddingRight = '0px';
          s.paddingBottom = '0px';
          s.paddingLeft = '0px';
          s.marginTop = '0px';
          s.marginRight = '0px';
          s.marginBottom = '0px';
          s.marginLeft = '0px';
          s.borderWidth = '0px';
          s.borderStyle = 'none';
          s.borderColor = 'transparent';
          for (const side of ['Left', 'Right', 'Top', 'Bottom'] as const) {
            s['border' + side + 'Width'] = '0px';
            s['border' + side + 'Color'] = 'transparent';
            s['border' + side + 'Style'] = 'none';
          }
          delete s.glyphHighlightColor;
          delete s.highlightBackdropColor;
          return s;
        }

        function mergeTypographyPseudoRichText(
          host: HTMLElement,
          runs: any[] | null,
          excludeSubtrees: Set<Element> | undefined,
          pseudo: '::before' | '::after'
        ): any[] | null {
          if (!shouldMergeTypographyPseudo(host, pseudo)) return runs;

          const pStyle = window.getComputedStyle(host, pseudo);
          const pseudoText = pStyle.content.replace(/^["']|["']$/g, '');
          if (!pseudoText) return runs;

          const pseudoRun = {
            text: pseudoText,
            styles: buildTypographyPseudoRunStyles(host, pseudo),
          };

          let merged = runs ? [...runs] : null;
          if (!merged || merged.length === 0) {
            const hostText = getTextContent(host, excludeSubtrees);
            merged = hostText
              ? [{ text: hostText, styles: stripTextBoxChromeFromRunStyles(getComputedStyles(host)) }]
              : [];
          }

          const hostStyle = window.getComputedStyle(host);
          const flexGap =
            parseFloat(hostStyle.gap) || parseFloat(hostStyle.columnGap) || 0;
          // One ASCII space between pseudo and sibling text (HTML whitespace collapse); do not
          // emulate flex gap with marginLeft → multiple spaces in PPTX.
          const gapSuffix = flexGap > 0.5 ? ' ' : '';

          if (pseudo === '::before') {
            merged = [{ ...pseudoRun, text: pseudoRun.text + gapSuffix }, ...merged];
          } else {
            const gapPrefix = flexGap > 0.5 ? ' ' : '';
            merged = [...merged, { ...pseudoRun, text: gapPrefix + pseudoRun.text }];
          }

          return merged;
        }

        /**
         * Extract visual ::before / ::after pseudo-elements as separate ElementInfo entries.
         * Uses a temporary real element to measure the pseudo-element's position via the browser layout engine.
         */
        function extractPseudoElements(element: Element): any[] {
          if (isMathJaxVisualSubtree(element)) return [];

          const items: any[] = [];

          for (const pseudo of ['::before', '::after'] as const) {
            // Skip ::before for Font Awesome icons (already handled separately)
            if (pseudo === '::before' && element instanceof HTMLElement && isFontAwesomeIcon(element)) continue;

            if (shouldMergeTypographyPseudo(element, pseudo)) continue;
            if (pseudo === '::after' && isMarkerHighlightAfterPseudo(element)) continue;

            const pStyle = window.getComputedStyle(element, pseudo);
            const rawContent = pStyle.content;

            // Skip if pseudo-element doesn't exist
            if (!rawContent || rawContent === 'none' || rawContent === 'normal') continue;

            // Do not require explicit width/height from computed style here.
            // Many decorative pseudos rely on auto sizing or left/right anchors
            // (e.g. gradient bars), where width can be reported as "auto".
            // We validate actual rendered size later via tempRect.

            // Check if visually meaningful
            const hasBg =
              pStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
              pStyle.backgroundColor !== 'transparent';
            const hasBgImage = pStyle.backgroundImage !== 'none';
            const hasBorder =
              parseFloat(pStyle.borderTopWidth) > 0 ||
              parseFloat(pStyle.borderRightWidth) > 0 ||
              parseFloat(pStyle.borderBottomWidth) > 0 ||
              parseFloat(pStyle.borderLeftWidth) > 0;
            // rawContent is e.g. '""' (empty string literal) or '"Hello"'
            const textContent = rawContent.replace(/^["']|["']$/g, '');
            const hasText = textContent.length > 0;

            if (!hasBg && !hasBgImage && !hasBorder && !hasText) continue;

            // --- Measure position via temporary real element ---
            const temp = document.createElement('span');
            const posProps = [
              'position', 'display', 'width', 'height',
              'top', 'right', 'bottom', 'left',
              'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
              'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
              'boxSizing', 'transform',
              'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
              'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
            ];
            for (const prop of posProps) {
              (temp.style as any)[prop] = (pStyle as any)[prop];
            }
            temp.style.visibility = 'hidden';
            temp.style.pointerEvents = 'none';

            if (pseudo === '::after') {
              element.appendChild(temp);
            } else {
              element.insertBefore(temp, element.firstChild);
            }
            const tempRect = temp.getBoundingClientRect();
            element.removeChild(temp);

            if (tempRect.width <= 0 || tempRect.height <= 0) continue;

            // --- Compute effective opacity (pseudo × ancestor chain) ---
            let effectiveOpacity = parseFloat(pStyle.opacity) || 1;
            let ancestor: HTMLElement | null = element as HTMLElement;
            while (ancestor && ancestor !== document.body) {
              effectiveOpacity *= parseFloat(window.getComputedStyle(ancestor).opacity) || 1;
              ancestor = ancestor.parentElement;
            }

            const elType = hasText ? 'text' : 'shape';

            // Calculate x position based on pseudo-element positioning
            const elRect = element.getBoundingClientRect();
            const elStyle = window.getComputedStyle(element);

            let pseudoX = tempRect.left;

            const borderLeft = parseFloat(elStyle.borderLeftWidth) || 0;
            const paddingLeft = parseFloat(elStyle.paddingLeft) || 0;
            const borderRight = parseFloat(elStyle.borderRightWidth) || 0;
            const paddingRight = parseFloat(elStyle.paddingRight) || 0;
            const contentWidth = elRect.width - borderLeft - paddingLeft - borderRight - paddingRight;

            if (pseudo === '::before') {
              // For absolutely positioned ::before with left: 0
              if (pStyle.position === 'absolute' || pStyle.position === 'fixed') {
                const leftVal = parseFloat(pStyle.left);
                if (!isNaN(leftVal) && leftVal === 0) {
                  // CSS spec: left: 0 is relative to padding box (border inner edge)
                  // But for visual decorative elements like border bars, we want them
                  // to align with the parent's visual edge (border box), not inside the border.
                  // So we use the parent's border box left edge directly.
                  pseudoX = elRect.left;
                } else {
                  // Use measured position from temp element
                  pseudoX = tempRect.left;
                }
              } else {
                // Normal flow: first line box starts after border+padding. Do not use tempRect.left
                // here — inserting a temp sibling while ::before still exists skews flex layout.
                pseudoX = elRect.left + borderLeft + paddingLeft;
              }
            } else if (pseudo === '::after') {
              // Symmetric to ::before: appending a temp sibling while the real ::after still exists
              // can skew measured x in flex/grid (temp ends up after in-flow content).
              if (pStyle.position === 'absolute' || pStyle.position === 'fixed') {
                const leftVal = parseFloat(pStyle.left);
                const rightVal = parseFloat(pStyle.right);
                if (!isNaN(leftVal) && leftVal === 0) {
                  pseudoX = elRect.left;
                } else if (
                  (pStyle.left === 'auto' || isNaN(leftVal)) &&
                  !isNaN(rightVal) &&
                  rightVal === 0
                ) {
                  pseudoX = elRect.right - tempRect.width;
                } else if (String(pStyle.left).includes('%')) {
                  const pct = parseFloat(pStyle.left);
                  if (!isNaN(pct) && contentWidth > 0) {
                    pseudoX = elRect.left + borderLeft + paddingLeft + (contentWidth * pct) / 100;
                  }
                } else {
                  pseudoX = tempRect.left;
                }
              } else {
                pseudoX = tempRect.left;
              }
            }

            let pseudoWidth = tempRect.width;
            if (
              pseudo === '::after' &&
              (pStyle.position === 'absolute' || pStyle.position === 'fixed') &&
              String(pStyle.width).includes('%') &&
              contentWidth > 0
            ) {
              const widthPct = parseFloat(pStyle.width);
              if (!isNaN(widthPct)) {
                pseudoWidth = (contentWidth * widthPct) / 100;
              }
            }

            const info: any = {
              type: elType,
              tag: pseudo === '::after' ? 'after' : 'before',
              x: pseudoX,
              y: tempRect.top,
              width: pseudoWidth,
              height: tempRect.height,
              styles: {
                color: pStyle.color,
                fontSize: pStyle.fontSize,
                fontFamily: pStyle.fontFamily,
                fontWeight: pStyle.fontWeight,
                fontStyle: pStyle.fontStyle,
                textDecoration: pStyle.textDecoration,
                textAlign: pStyle.textAlign,
                backgroundColor: pStyle.backgroundColor,
                backgroundImage: pStyle.backgroundImage,
                opacity: effectiveOpacity,
                borderColor: pStyle.borderColor,
                borderWidth: pStyle.borderWidth,
                borderStyle: pStyle.borderStyle,
                borderRadius: pStyle.borderRadius,
                borderLeftWidth: pStyle.borderLeftWidth,
                borderRightWidth: pStyle.borderRightWidth,
                borderTopWidth: pStyle.borderTopWidth,
                borderBottomWidth: pStyle.borderBottomWidth,
                borderLeftColor: pStyle.borderLeftColor,
                borderRightColor: pStyle.borderRightColor,
                borderTopColor: pStyle.borderTopColor,
                borderBottomColor: pStyle.borderBottomColor,
                borderLeftStyle: pStyle.borderLeftStyle,
                borderRightStyle: pStyle.borderRightStyle,
                borderTopStyle: pStyle.borderTopStyle,
                borderBottomStyle: pStyle.borderBottomStyle,
                boxShadow: pStyle.boxShadow,
                display: pStyle.display,
                visibility: pStyle.visibility,
                zIndex: pStyle.zIndex,
              },
            };

            if (hasText) {
              info.content = textContent;
            }

            // Pseudo is measured as a full box (e.g. absolute inset on .slice); ancestor clip-path
            // still clips it visually — apply same polygon ∩ box as real shapes so PPTX has no
            // full-width ghost rectangles behind trapezoids.
            if (elType === 'shape') {
              const clip = computeClipPathIntersection(element, {
                x: info.x,
                y: info.y,
                width: info.width,
                height: info.height,
              });
              if (clip) {
                if (!clip.preserveLayoutBox) {
                  info.x = clip.bbox.left;
                  info.y = clip.bbox.top;
                  info.width = clip.bbox.width;
                  info.height = clip.bbox.height;
                }
                info.clipPathPolygonPx = clip.pointsRelative;
              }
            }

            items.push(info);
          }

          return items;
        }

        function parseElementZIndex(el: Element): number {
          const z = window.getComputedStyle(el).zIndex;
          const parsed = Number.parseInt(z, 10);
          return Number.isNaN(parsed) ? 0 : parsed;
        }

        function compareElementsDomOrder(a: Element, b: Element): number {
          const pos = a.compareDocumentPosition(b);
          if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
          if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
          return 0;
        }

        /** Sibling paint order: lower z-index first, DOM order for ties. */
        function getChildrenInPaintOrder(parent: Element): Element[] {
          const children = Array.from(parent.children).filter(
            (child): child is Element => child instanceof Element
          );
          return children
            .map((child, index) => ({ child, index, zIndex: parseElementZIndex(child) }))
            .sort((a, b) => a.zIndex - b.zIndex || a.index - b.index)
            .map((x) => x.child);
        }

        /** DOM nodes that become separate PPTX objects — hidden during needsScreenshot capture. */
        const PPTX_MAPPED_ATTR = 'data-html2pptx-mapped';

        function markDomAsPptxMapped(el: Element, skip = false): void {
          if (skip) return;
          if (el instanceof HTMLElement || el instanceof SVGElement) {
            el.setAttribute(PPTX_MAPPED_ATTR, '');
          }
        }


        /**
         * Process element and its children
         */
        async function processElement(element: Element | null | undefined, depth: number = 0): Promise<void> {
          if (!element || !element.tagName) return;
          if (isSvgNonRenderElement(element)) return;

          // const elementSelector = getElementSelector(element);
          // if (elementSelector === 'BODY > DIV.slide-container > HEADER > DIV.tag') {
          //   _debugInfo.push(`[DEBUG] Processing target element: ${elementSelector}`);
          //   _debugInfo.push(`[DEBUG]   isVisible: ${isVisible(element)}`);
          //   _debugInfo.push(`[DEBUG]   getElementType: ${getElementType(element)}`);
          //   _debugInfo.push(`[DEBUG]   Computed Styles: ${JSON.stringify(getComputedStyles(element))}`);
          // }
          // display:contents has no box (0×0 rect) but children participate in ancestor layout
          if (element instanceof HTMLElement && window.getComputedStyle(element).display === 'contents') {
            for (const child of Array.from(element.children)) {
              if (child instanceof Element) {
                await processElement(child, depth + 1);
              }
            }
            return;
          }

          if (element instanceof HTMLElement && element.hasAttribute(PPTX_MAPPED_ATTR)) {
            return;
          }
          if (element instanceof SVGElement && element.hasAttribute(PPTX_MAPPED_ATTR)) {
            return;
          }

          // KaTeX visible HTML layer — OMML comes from sibling .katex-mathml <math>
          if (isKatexHtmlSubtree(element)) return;

          // MathJax CHTML visual layer (mjx-math, glyph ::before, etc.) — OMML from assistive <math>
          if (isMathJaxVisualSubtree(element)) return;

          // KaTeX wrappers: recurse to <math> only, never emit as text
          if (isKatexStructuralWrapper(element)) {
            for (const child of getChildrenInPaintOrder(element)) {
              await processElement(child, depth + 1);
            }
            return;
          }

          // MathJax wrapper: recurse to mjx-assistive-mml > <math>, never emit mjx-math as text
          if (isMathJaxStructuralWrapper(element)) {
            for (const child of getChildrenInPaintOrder(element)) {
              await processElement(child, depth + 1);
            }
            return;
          }

          // Skip if not visible
          if (!isVisible(element)) return;

          const rect = element.getBoundingClientRect();
          const type = getElementType(element);

          // Debug: background fill vs background image layering
          // (prints once per matched element; safe in production, low volume)
          if (element instanceof HTMLElement && element.classList.contains('bg-primary-pattern')) {
            const style = window.getComputedStyle(element);
            const elementSelector = getElementSelector(element);
            _debugInfo.push(`[DEBUG_BG] element: ${elementSelector}`);
            _debugInfo.push(`[DEBUG_BG]   type=${type} w=${rect.width} h=${rect.height} zIndex=${style.zIndex}`);
            _debugInfo.push(`[DEBUG_BG]   backgroundColor(raw)=${style.backgroundColor}`);
            _debugInfo.push(
              `[DEBUG_BG]   backgroundColor(canon)=${canonicalizeComputedBackgroundColor(style.backgroundColor)}`
            );
            _debugInfo.push(`[DEBUG_BG]   backgroundImage=${style.backgroundImage}`);
            _debugInfo.push(`[DEBUG_BG]   opacity=${style.opacity}`);
          }

          // Skip purely decorative shape elements that sit behind content (z-index < 0)
          // e.g. <div class="border-2 rounded-lg -z-10"> - border-only frame behind image
          if (type === 'shape') {
            const style = window.getComputedStyle(element);
            const zIndex = parseInt(style.zIndex, 10);
            const hasBg =
              (style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') ||
              style.backgroundImage !== 'none';
            const hasBorder = parseFloat(style.borderWidth) > 0;
            if (!isNaN(zIndex) && zIndex < 0 && hasBorder && !hasBg) {
              return; // Skip decorative border-only background elements
            }
          }

          // MathML → OMML in Node; screenshot fallback if conversion fails
          if (type === 'math') {
            if (!isEditableMathElement(element)) return;
            const layoutHost = resolveMathLayoutHost(element);
            const layoutRect = getMathLayoutRect(element);
            const mathml = serializeMathMl(element);
            const screenshotId = `screenshot-math-${Math.random().toString(36).slice(2, 10)}`;
            (layoutHost as HTMLElement).setAttribute('data-screenshot', screenshotId);
            const styles = getComputedStyles(layoutHost as HTMLElement);
            let effectiveOpacity =
              parseFloat(window.getComputedStyle(layoutHost as HTMLElement).opacity) || 1;
            for (
              let parent = layoutHost.parentElement;
              parent && parent !== document.body;
              parent = parent.parentElement
            ) {
              effectiveOpacity *= parseFloat(window.getComputedStyle(parent).opacity) || 1;
            }
            styles.opacity = effectiveOpacity;

            const mathFallbackText = (element.textContent ?? '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 500);

            result.push({
              type: 'math',
              tag: 'math',
              x: layoutRect.left,
              y: layoutRect.top,
              width: layoutRect.width,
              height: layoutRect.height,
              styles,
              mathml,
              mathDisplayMode: getMathDisplayMode(element),
              mathFallbackText: mathFallbackText || undefined,
              screenshotSelector: `[data-screenshot="${screenshotId}"]`,
            });
            markMathHostMapped(element);
            return;
          }

          // SVG elements are saved as SVG images (not decomposed into shapes).
          if (type === 'svg') {
            if ((element as any).closest?.('mjx-container')) {
              return;
            }
            emitSvgAsImage(element as unknown as SVGElement, rect);
            return;
          }

          // Skip containers unless they have visual properties.
          // But container pseudo-elements (::before/::after) can still be visual and
          // must be extracted before the early return (e.g. decorative gradient lines).
          if (type === 'container' && depth > 0) {
            const pseudoItems = extractPseudoElements(element);
            for (const pi of pseudoItems) {
              result.push(pi);
            }

            // Process children in z-index paint order (not raw DOM order)
            for (const child of getChildrenInPaintOrder(element)) {
              await processElement(child, depth + 1);
            }
            return;
          }

          // For shape elements with children, extract both the container shape
          // and the text children separately
          const shouldExtractChildrenSeparately = type === 'shape' && element.children.length > 0;

          // For text elements with decorative children (e.g. legend: <span><span class="dot"></span> 文本</span>),
          // use text node position so text doesn't overlap with preceding shapes/icons
          // Only truly visual element types count as "decorative".
          // Structural tags like <br> ('container') must NOT trigger textRect shrinking.
          const decorativeTypes = new Set(['icon', 'image', 'shape', 'canvas', 'svg', 'math']);

          /**
           * Text hosts (e.g. h1) do not recurse into merged inline children, and textExcludeSubtrees
           * only lists direct children. A positioned underline <div> nested under
           * <span><span>…</span></span> would never be visited by processElement otherwise.
           * Skip subtrees rooted at direct excluded children — those get a full processElement pass.
           */
          function collectNestedVisualDecorationsFromTextHost(
            host: Element,
            excludedDirectChildren: Set<Element> | undefined
          ): Element[] {
            const acc: Element[] = [];
            function walk(parent: Element): void {
              for (const child of Array.from(parent.children)) {
                if (!(child instanceof Element)) continue;
                if (excludedDirectChildren?.has(child)) continue;
                if (!isVisible(child)) continue;
                const ct = getElementType(child);
                if (decorativeTypes.has(ct)) {
                  acc.push(child);
                }
                walk(child);
              }
            }
            walk(host);
            return acc;
          }

          /**
           * ::before / ::after on descendants merged into a text host (e.g. <p><span class="x">…</span></p>)
           * are never seen: only the host gets extractPseudoElements. Collect pseudos from non-decorative
           * descendants; skip decorative subtrees (they get their own processElement + extractPseudo).
           */
          function collectMergedTextSubtreePseudoElements(
            host: Element,
            excludedDirectChildren: Set<Element> | undefined
          ): any[] {
            const acc: any[] = [];
            function walk(parent: Element): void {
              for (const child of Array.from(parent.children)) {
                if (!(child instanceof Element)) continue;
                if (excludedDirectChildren?.has(child)) continue;
                if (!isVisible(child)) continue;
                const ct = getElementType(child);
                if (decorativeTypes.has(ct)) {
                  continue;
                }
                acc.push(...extractPseudoElements(child));
                walk(child);
              }
            }
            walk(host);
            return acc;
          }

          const hasDecorativeChildren =
            type === 'text' &&
            element.children.length > 0 &&
            Array.from(element.children).some(
              // SVG lives under SVGElement, not HTMLElement — must still count as in-flow decoration
              (child) => child instanceof Element && decorativeTypes.has(getElementType(child))
            );

          // Check for in-flow ::before pseudo-element that occupies layout space
          // (e.g. .subtitle::before { content:''; width:40px; height:3px; background:#2d3436; }
          //  or .subtitle::before { content:'•'; color:… } in flex with gap)
          // When present, text content is pushed to the right in flex/block layout,
          // so we need to measure actual text position via Range.
          const hasInFlowPseudoBefore = type === 'text' && (() => {
            if (element instanceof HTMLElement && shouldMergeTypographyPseudo(element, '::before')) {
              return false;
            }
            const bs = window.getComputedStyle(element, '::before');
            if (!bs.content || bs.content === 'none' || bs.content === 'normal') return false;
            if (bs.position === 'absolute' || bs.position === 'fixed') return false;
            const hasBg = bs.backgroundColor !== 'rgba(0, 0, 0, 0)' && bs.backgroundColor !== 'transparent';
            const hasBgImg = bs.backgroundImage !== 'none';
            const hasBdr = parseFloat(bs.borderTopWidth) > 0 || parseFloat(bs.borderRightWidth) > 0 ||
                           parseFloat(bs.borderBottomWidth) > 0 || parseFloat(bs.borderLeftWidth) > 0;
            const pseudoText = bs.content.replace(/^["']|["']$/g, '');
            const hasPseudoText = pseudoText.length > 0;
            if (!hasBg && !hasBgImg && !hasBdr && !hasPseudoText) return false;
            const bw = parseFloat(bs.width), bh = parseFloat(bs.height);
            if (!isNaN(bw) && bw > 0 && !isNaN(bh) && bh > 0) return true;
            // Text bullets (e.g. content:'•') may report auto size — measure like li bullets
            if (hasPseudoText) {
              const temp = document.createElement('span');
              temp.style.visibility = 'hidden';
              temp.style.pointerEvents = 'none';
              temp.style.display = 'inline';
              temp.style.fontSize = bs.fontSize;
              temp.style.fontFamily = bs.fontFamily;
              temp.style.fontWeight = bs.fontWeight;
              temp.style.fontStyle = bs.fontStyle;
              temp.style.letterSpacing = bs.letterSpacing;
              temp.textContent = pseudoText;
              element.insertBefore(temp, element.firstChild);
              const tr = temp.getBoundingClientRect();
              element.removeChild(temp);
              return tr.width > 0 && tr.height > 0;
            }
            return false;
          })();

          // Children merged into the parent's text box only when they participate in the same inline
          // flow as preceding siblings. Non-inline-level (CSS block / flow-root / list-item) text
          // subtrees must be separate ElementInfo so they are not flattened into the parent shape.
          // Previously, "preceding text" skipped all later children — that incorrectly merged
          // display:block boxes (e.g. .quote-block) into the parent paragraph.
          // Exception: flex + justify-content space-* distributes items to opposite ends — preceding
          // text is intentional (e.g. .ill-header: label left, badge span right).
          let textExcludeSubtrees: Set<Element> | undefined;
          if (type === 'text' && element.children.length > 0) {
            function hasPrecedingText(parent: Element, beforeChild: Element): boolean {
              for (const node of Array.from(parent.childNodes)) {
                if (node === beforeChild) break;
                if (node.nodeType === Node.TEXT_NODE && (node.textContent?.trim() ?? '').length > 0)
                  return true;
                if (node.nodeType === Node.ELEMENT_NODE && ((node as Element).textContent?.trim() ?? '').length > 0)
                  return true;
              }
              return false;
            }
            const parentFlowStyle = window.getComputedStyle(element);
            const flexDistributesSpace =
              (parentFlowStyle.display === 'flex' || parentFlowStyle.display === 'inline-flex') &&
              /space-(between|around|evenly)/.test(parentFlowStyle.justifyContent || '');
            textExcludeSubtrees = new Set<Element>();
            if (element instanceof HTMLElement) {
              element.querySelectorAll('.katex').forEach((katexEl) => {
                textExcludeSubtrees!.add(katexEl);
              });
              element.querySelectorAll('mjx-container').forEach((mjxEl) => {
                textExcludeSubtrees!.add(mjxEl);
              });
            }
            const separateInlineChildTypes = new Set([
              'icon',
              'image',
              'shape',
              'canvas',
              'svg',
              'math',
            ]);
            for (const ch of Array.from(element.children)) {
              if (!(ch instanceof Element)) continue;
              const childStyle = window.getComputedStyle(ch);
              const childDisplay = childStyle.display || '';
              const childType = getElementType(ch);
              const isFlowBreakingBlockTextChild =
                childDisplay === 'block' ||
                childDisplay === 'flow-root' ||
                childDisplay === 'list-item';
              const isFlexColumnChild =
                (childDisplay === 'flex' || childDisplay === 'inline-flex') &&
                (childStyle.flexDirection === 'column' || childStyle.flexDirection === 'column-reverse');
              // Flex column / structural containers after intro text (e.g. .step-desc > .sub-list)
              // are separate layout regions — must not merge into the parent text box.
              // <br> is typed as container but must stay in the parent text flow for soft line breaks.
              const isBrLineBreak = ch.tagName.toLowerCase() === 'br';
              if (hasPrecedingText(element, ch) && !flexDistributesSpace && !isFlowBreakingBlockTextChild) {
                if (
                  hasUnderlineBarAfter(ch) ||
                  isFlexColumnChild ||
                  (childType === 'container' && !isBrLineBreak) ||
                  separateInlineChildTypes.has(childType)
                ) {
                  textExcludeSubtrees.add(ch);
                }
                continue;
              }
              const childBg =
                (childStyle.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                  childStyle.backgroundColor !== 'transparent') ||
                childStyle.backgroundImage !== 'none';
              const childBorder =
                parseFloat(childStyle.borderLeftWidth) > 0 ||
                parseFloat(childStyle.borderRightWidth) > 0 ||
                parseFloat(childStyle.borderTopWidth) > 0 ||
                parseFloat(childStyle.borderBottomWidth) > 0;
              const textWithFill = childType === 'text' && (childBg || childBorder);
              if (childType !== 'text' && !isBrLineBreak) {
                textExcludeSubtrees.add(ch);
              } else if (textWithFill && childBg) {
                // Only treat "text with fill" as separate when it has background (not just border/radius)
                textExcludeSubtrees.add(ch);
              } else if (isFlowBreakingBlockTextChild) {
                textExcludeSubtrees.add(ch);
              }
            }
            if (textExcludeSubtrees.size === 0) textExcludeSubtrees = undefined;
          }
          const hasExcludedTextSubtrees = type === 'text' && !!textExcludeSubtrees?.size;

          function isInsideExcluded(node: Node, excludeSet: Set<Element>, container: Element): boolean {
            let p: Node | null = node.parentNode;
            while (p && p !== container) {
              if (p.nodeType === Node.ELEMENT_NODE && excludeSet.has(p as Element)) return true;
              p = p.parentNode;
            }
            return false;
          }

          let textRect = rect;
          let textFlowExtraMarginLeftPx: number | undefined;
          /** Text+fill+border box with excluded SVG/img/etc.: emit full-rect shape for box, caption uses Range geometry */
          let emitSplitCaptionFrameShape = false;

          if (
            (hasDecorativeChildren || hasInFlowPseudoBefore || hasExcludedTextSubtrees) &&
            type === 'text' &&
            element.childNodes.length > 0
          ) {
            const range = document.createRange();
            let firstTextNode: Node | null = null;
            let lastTextNode: Node | null = null;

            if (textExcludeSubtrees?.size) {
              for (const node of Array.from(element.childNodes)) {
                if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
                if (isInsideExcluded(node, textExcludeSubtrees, element)) continue;
                if (!firstTextNode) firstTextNode = node;
                lastTextNode = node;
              }
              if (!firstTextNode) {
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
                  acceptNode: (node) => {
                    if (!node.textContent?.trim()) return NodeFilter.FILTER_SKIP;
                    return isInsideExcluded(node, textExcludeSubtrees!, element)
                      ? NodeFilter.FILTER_SKIP
                      : NodeFilter.FILTER_ACCEPT;
                  }
                });
                firstTextNode = walker.nextNode();
                if (firstTextNode) {
                  lastTextNode = firstTextNode;
                  let next: Node | null;
                  while ((next = walker.nextNode())) lastTextNode = next;
                }
              }
            } else {
              for (const node of Array.from(element.childNodes)) {
                if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
                  if (!firstTextNode) firstTextNode = node;
                  lastTextNode = node;
                }
              }
              if (!firstTextNode) {
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
                  acceptNode: (node) =>
                    node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
                });
                firstTextNode = walker.nextNode();
                if (firstTextNode) {
                  lastTextNode = firstTextNode;
                  let next: Node | null;
                  while ((next = walker.nextNode())) lastTextNode = next;
                }
              }
            }

            if (firstTextNode && lastTextNode) {
              const style = window.getComputedStyle(element);
              const hasFill =
                (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') ||
                style.backgroundImage !== 'none';
              const hasBorder =
                (parseFloat(style.borderLeftWidth) > 0 && style.borderLeftColor !== 'transparent') ||
                (parseFloat(style.borderRightWidth) > 0 && style.borderRightColor !== 'transparent') ||
                (parseFloat(style.borderTopWidth) > 0 && style.borderTopColor !== 'transparent') ||
                (parseFloat(style.borderBottomWidth) > 0 && style.borderBottomColor !== 'transparent');
              // Shrink to text ink only when this element has no own "box" (background/border).
              // If it has fill or border (e.g. flex pill: dot + text), keep full rect — otherwise Range
              // excludes padding and sibling decorations, so PPT background size/position won't match
              // the browser and separate shape children (e.g. .dot) appear misaligned.
              const shouldShrinkToTextRange =
                (hasExcludedTextSubtrees || (!hasFill && !hasBorder)) && !hasFill && !hasBorder;

              range.setStart(firstTextNode, 0);
              range.setEnd(lastTextNode, lastTextNode.textContent?.length ?? 0);
              const rangeRect = range.getBoundingClientRect();

              // Client HTML often mixes in-flow SVG/img with trailing text in one bordered/filled box.
              // PPT would center text in the full box; split: shape = border+fill (full rect), text = Range box.
              const hasLayoutExcludedDecoration =
                !!textExcludeSubtrees &&
                textExcludeSubtrees.size > 0 &&
                Array.from(textExcludeSubtrees).some((el) => decorativeTypes.has(getElementType(el)));
              const shouldSplitCaptionFrame =
                type === 'text' &&
                hasExcludedTextSubtrees &&
                hasLayoutExcludedDecoration &&
                (hasFill || hasBorder) &&
                rangeRect.width > 0.5 &&
                rangeRect.height > 0.5 &&
                !hasTransformRotation(element);

              if (shouldSplitCaptionFrame) {
                textRect = rangeRect;
                emitSplitCaptionFrameShape = true;
              } else if (shouldShrinkToTextRange) {
                textRect = rangeRect;
              } else if (
                element instanceof HTMLElement &&
                (hasExcludedTextSubtrees || hasDecorativeChildren || hasInFlowPseudoBefore)
              ) {
                // Full border-box kept for background/border; PPT margin only encodes padding+border,
                // not in-flow icons/SVG/gap — shift text by measured first-line left edge.
                const tr = rangeRect;
                const bl = parseFloat(style.borderLeftWidth) || 0;
                const pl = parseFloat(style.paddingLeft) || 0;
                const extraPx = tr.left - rect.left - bl - pl;
                if (extraPx > 0.5) {
                  textFlowExtraMarginLeftPx = extraPx;
                }
              }
            }
          }

          const baseTag = element.tagName.toLowerCase();
          const tagWithMeta =
            element instanceof HTMLElement
              ? [
                  baseTag,
                  element.id ? `#${element.id}` : '',
                  element.classList?.length ? `.${Array.from(element.classList).join('.')}` : '',
                ].join('')
              : baseTag;

          const info: any = {
            type,
            tag: tagWithMeta,
            x: textRect.left,
            y: textRect.top,
            width: textRect.width,
            height: textRect.height,
            styles: getComputedStyles(element),
          };
          if (type === 'text' && isSvgNamespace(element)) {
            info.svgText = true;
          }
          // Mermaid labels: HTML inside foreignObject (font metrics differ from native SVG text).
          if (type === 'text' && element instanceof HTMLElement) {
            const fo = element.closest('foreignObject');
            if (fo?.closest('svg')) {
              info.svgText = true;
              info.svgForeignObjectText = true;
            }
          }
          // When element has CSS transform rotation, getBoundingClientRect() returns the AABB (larger).
          // PPTX expects unrotated size and position, then applies rotation — so use layout size/position.
          if (hasTransformRotation(element) && element instanceof HTMLElement && !emitSplitCaptionFrameShape) {
            const ow = (element as HTMLElement).offsetWidth;
            const oh = (element as HTMLElement).offsetHeight;
            if (ow > 0 && oh > 0) {
              const centerX = rect.left + rect.width / 2;
              const centerY = rect.top + rect.height / 2;
              info.x = centerX - ow / 2;
              info.y = centerY - oh / 2;
              info.width = ow;
              info.height = oh;
            }
          }

          // li: ::before bullet (in-flow) sits after padding; getTextOptions already applies padding+border as
          // PPT margin. beforePseudoWidthPx is only the extra horizontal space for the pseudo (ml + w + mr) in px,
          // added on top of margin-left in the converter — do not change x/w or the card fills the border box wrong.
          const tag = element.tagName.toLowerCase();
          if (tag === 'li') {
            const bs = window.getComputedStyle(element, '::before');
            const hasBefore = bs.content && bs.content !== 'none' && bs.content !== 'normal';
            if (hasBefore && bs.position !== 'absolute' && bs.position !== 'fixed') {
              const ml = parseFloat(bs.marginLeft) || 0;
              const mr = parseFloat(bs.marginRight) || 0;
              const w = parseFloat(bs.width);
              let bulletAdvance = 0;
              if (!isNaN(w) && w > 0) {
                bulletAdvance = ml + w + mr;
              } else {
                const textContent = bs.content.replace(/^["']|["']$/g, '');
                if (textContent.length > 0) {
                  const temp = document.createElement('span');
                  temp.style.visibility = 'hidden';
                  temp.style.pointerEvents = 'none';
                  temp.style.display = 'inline';
                  temp.style.fontSize = bs.fontSize;
                  temp.style.fontFamily = bs.fontFamily;
                  temp.style.fontWeight = bs.fontWeight;
                  temp.style.fontStyle = bs.fontStyle;
                  temp.style.letterSpacing = bs.letterSpacing;
                  temp.textContent = textContent;
                  element.insertBefore(temp, element.firstChild);
                  const tempRect = temp.getBoundingClientRect();
                  element.removeChild(temp);
                  if (tempRect.width > 0) bulletAdvance = ml + tempRect.width + mr;
                }
              }
              if (bulletAdvance > 0) info.beforePseudoWidthPx = bulletAdvance;
            }
          }

          // clip-path polygon (ancestor or self): visible region = clip polygon ∩ element box → custGeom in PPTX
          // Apply to all renderable element types to avoid unclipped rectangular fallbacks.
          if (type !== 'container') {
            const clip = computeClipPathIntersection(element, {
              x: info.x,
              y: info.y,
              width: info.width,
              height: info.height,
            });
            if (clip) {
              if (!clip.preserveLayoutBox) {
                info.x = clip.bbox.left;
                info.y = clip.bbox.top;
                info.width = clip.bbox.width;
                info.height = clip.bbox.height;
              }
              info.clipPathPolygonPx = clip.pointsRelative;
            }
          }

          // Flex space-* row: last in-flow child text should be right-aligned in its box (e.g. .ill-header > span)
          if (type === 'text' && element.parentElement) {
            const flexParent = element.parentElement;
            const ps = window.getComputedStyle(flexParent);
            const flexDistributesSpace =
              (ps.display === 'flex' || ps.display === 'inline-flex') &&
              /space-(between|around|evenly)/.test(ps.justifyContent || '');
            const flexDir = ps.flexDirection || 'row';
            if (flexDistributesSpace && (flexDir === 'row' || flexDir === 'row-reverse')) {
              const inFlowItems = Array.from(flexParent.childNodes).filter((n) => {
                if (n.nodeType === Node.TEXT_NODE) return (n.textContent?.trim() ?? '').length > 0;
                if (n.nodeType === Node.ELEMENT_NODE) return isVisible(n as Element);
                return false;
              });
              const lastItem = inFlowItems[inFlowItems.length - 1];
              const firstItem = inFlowItems[0];
              const isLast = lastItem === element;
              const isFirst = firstItem === element;
              if (flexDir === 'row-reverse') {
                if (isFirst) info.flexItemTextAlign = 'right';
                else if (isLast) info.flexItemTextAlign = 'left';
              } else {
                if (isLast) info.flexItemTextAlign = 'right';
                else if (isFirst) info.flexItemTextAlign = 'left';
              }
            }
          }

          // Add type-specific data
          if (type === 'text') {
            info.content = getTextContent(element, textExcludeSubtrees);
            let richText = extractRichText(element as HTMLElement, textExcludeSubtrees);
            richText = mergeTypographyPseudoRichText(element as HTMLElement, richText, textExcludeSubtrees, '::before');
            richText = mergeTypographyPseudoRichText(element as HTMLElement, richText, textExcludeSubtrees, '::after');
            if (richText && richText.length > 0) {
              info.richText = richText;
              info.content = richText.map((r: any) => r.text).join('');
            }
            if (textFlowExtraMarginLeftPx != null && textFlowExtraMarginLeftPx > 0) {
              info.textFlowExtraMarginLeftPx = textFlowExtraMarginLeftPx;
            }
          } else if (type === 'icon') {
            // Extract Font Awesome icon content from ::before pseudo-element
            info.content = getFontAwesomeContent(element as HTMLElement);
            // Mark as icon type for converter to handle specially
            info.isIcon = true;
            // Opacity is not inherited in computed style, but parent opacity affects the
            // whole rendered subtree. Apply effective opacity so decorative icons inside
            // low-opacity containers (e.g. opacity-5) keep the intended visual color.
            let effectiveOpacity = parseFloat(window.getComputedStyle(element as HTMLElement).opacity) || 1;
            for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
              effectiveOpacity *= parseFloat(window.getComputedStyle(parent).opacity) || 1;
            }
            info.styles.opacity = effectiveOpacity;
          } else if (type === 'image') {
            const imgElement = element as HTMLImageElement;
            info.src = imgElement.src;
            // Extract natural dimensions for object-fit calculations
            info.imageNaturalWidth = imgElement.naturalWidth || 0;
            info.imageNaturalHeight = imgElement.naturalHeight || 0;
            if (
              info.src &&
              !info.src.startsWith('data:') &&
              imgElement.complete &&
              info.imageNaturalWidth === 0
            ) {
              info.resourceUnavailable = true;
            }
            // Parent has border-radius + overflow-hidden and img is only child → parent clips img to rounded corners
            const parent = element.parentElement;
            if (parent && parent.children.length === 1) {
              const parentStyle = window.getComputedStyle(parent);
              const overflow = `${parentStyle.overflow} ${parentStyle.overflowX} ${parentStyle.overflowY}`;
              const clips = overflow.includes('hidden') || overflow.includes('clip');
              const br = parentStyle.borderRadius;
              const radiusPx = br ? parseFloat(br) || 0 : 0;
              if (clips && radiusPx > 0) {
                info.parentBorderRadiusPx = radiusPx;
              }
            }
          } else if (type === 'video') {
            const videoElement = element as HTMLVideoElement;
            info.src = videoElement.currentSrc || videoElement.src || '';
            info.poster = videoElement.poster || '';
            if (
              videoElement.error ||
              videoElement.networkState === HTMLMediaElement.NETWORK_NO_SOURCE ||
              videoElement.readyState === 0
            ) {
              info.resourceUnavailable = true;
            }
          } else if (type === 'audio') {
            const audioElement = element as HTMLAudioElement;
            info.src = audioElement.currentSrc || audioElement.src || '';
            if (
              audioElement.error ||
              audioElement.networkState === HTMLMediaElement.NETWORK_NO_SOURCE ||
              audioElement.readyState === 0
            ) {
              info.resourceUnavailable = true;
            }
          } else if (type === 'canvas') {
            try {
              info.dataUrl = (element as HTMLCanvasElement).toDataURL('image/png');
            } catch (e) {
              console.warn('Failed to export canvas:', e);
              info.resourceUnavailable = true;
            }
          } else if (type === 'table') {
            info.tableData = extractTableData(element as HTMLTableElement);
          }

          // Detect visual styles that PPT native shapes cannot faithfully reproduce.
          // Mark for isolated Playwright screenshot fallback.
          if (type === 'shape' && info.styles.backgroundImage) {
            const bgImg = info.styles.backgroundImage as string;
            const bgSize = window.getComputedStyle(element).backgroundSize;
            const gradientCount = (bgImg.match(/linear-gradient/g) || []).length;
            const isDefaultSize = !bgSize || bgSize === 'auto' || bgSize === 'auto auto' || bgSize === '100% 100%';
            // Do not isolate-screenshot <body> backgrounds. The screenshot flow forces
            // html/body background to transparent to capture overlay grids, which would
            // erase page-level background fills when the target itself is <body>.
            const isBody = (element as HTMLElement).tagName?.toLowerCase() === 'body';
            if (!isBody && gradientCount >= 2 && !isDefaultSize) {
              const screenshotId = `screenshot-${Math.random().toString(36).slice(2, 10)}`;
              element.setAttribute('data-screenshot', screenshotId);
              info.needsScreenshot = true;
              info.screenshotSelector = `[data-screenshot="${screenshotId}"]`;
            } else if (!isBody && hasTiledRadialGradientBackground(bgImg, bgSize)) {
              const screenshotId = `screenshot-${Math.random().toString(36).slice(2, 10)}`;
              element.setAttribute('data-screenshot', screenshotId);
              info.needsScreenshot = true;
              info.screenshotSelector = `[data-screenshot="${screenshotId}"]`;
            } else if (
              !isBody &&
              (gradientCount >= 1 || /radial-gradient\(|repeating-radial-gradient\(/i.test(bgImg)) &&
              hasAdjacentDuplicatePercentHardStopInGradients(bgImg)
            ) {
              const screenshotId = `screenshot-${Math.random().toString(36).slice(2, 10)}`;
              element.setAttribute('data-screenshot', screenshotId);
              info.needsScreenshot = true;
              info.screenshotSelector = `[data-screenshot="${screenshotId}"]`;
            } else if (!isBody && /url\s*\(/i.test(bgImg)) {
              // background-image: url() — pptx shapes only support solid/gradient fills, not photos.
              // Full-slide url+gradient overlays are handled in converter; skip screenshot there.
              const hasGrad =
                gradientCount >= 1 ||
                /radial-gradient\(|repeating-radial-gradient\(/i.test(bgImg);
              const isNearFullSlide = info.width >= 1152 && info.height >= 648;
              if (!(isNearFullSlide && hasGrad)) {
                const screenshotId = `screenshot-${Math.random().toString(36).slice(2, 10)}`;
                element.setAttribute('data-screenshot', screenshotId);
                info.needsScreenshot = true;
                info.screenshotSelector = `[data-screenshot="${screenshotId}"]`;
              }
            }
          }

          // Border-radius polygon fallback:
          // For complex radii (non-uniform/elliptical/%), generate a custom polygon path
          // so converter can emit custGeom instead of unstable screenshot fallback.
          if (type === 'shape' && !info.clipPathPolygonPx && !info.svgTag) {
            const radiusPoly = sampleRoundedRectPolygon(element, info.width, info.height);
            if (radiusPoly && radiusPoly.length >= 3) {
              info.clipPathPolygonPx = radiusPoly;
            }
          }

          if (type === 'shape' && isSvgNamespace(element)) {
            applySvgShapeMetadata(info, element);
          }

          // Bordered/filled flex (or block) box with excluded SVG/img/canvas/icon: frame shape + Range-sized caption text
          if (emitSplitCaptionFrameShape && element instanceof HTMLElement) {
            const stripCaptionOnlyBoxStyles = (st: any) => {
              st.backgroundColor = 'rgba(0, 0, 0, 0)';
              st.backgroundImage = 'none';
              st.boxShadow = 'none';
              st.borderWidth = '0px';
              st.borderStyle = 'none';
              st.borderColor = 'transparent';
              st.borderRadius = '0px';
              // Caption uses Range geometry (content ink box); padding/border live on frame shape only.
              st.paddingTop = '0px';
              st.paddingRight = '0px';
              st.paddingBottom = '0px';
              st.paddingLeft = '0px';
              for (const side of ['Left', 'Right', 'Top', 'Bottom'] as const) {
                st['border' + side + 'Width'] = '0px';
                st['border' + side + 'Color'] = 'transparent';
                st['border' + side + 'Style'] = 'none';
              }
            };
            stripCaptionOnlyBoxStyles(info.styles);

            const frameShape: any = {
              type: 'shape',
              tag: (element.tagName || 'div').toLowerCase(),
              x: rect.left,
              y: rect.top,
              width: rect.width,
              height: rect.height,
              styles: getComputedStyles(element),
            };
            const clipFrame = computeClipPathIntersection(element, {
              x: frameShape.x,
              y: frameShape.y,
              width: frameShape.width,
              height: frameShape.height,
            });
            if (clipFrame) {
              if (!clipFrame.preserveLayoutBox) {
                frameShape.x = clipFrame.bbox.left;
                frameShape.y = clipFrame.bbox.top;
                frameShape.width = clipFrame.bbox.width;
                frameShape.height = clipFrame.bbox.height;
              }
              frameShape.clipPathPolygonPx = clipFrame.pointsRelative;
            }
            if (!frameShape.clipPathPolygonPx) {
              const radiusPoly = sampleRoundedRectPolygon(element, frameShape.width, frameShape.height);
              if (radiusPoly && radiusPoly.length >= 3) {
                frameShape.clipPathPolygonPx = radiusPoly;
              }
            }
            result.push(frameShape);
          }

          // Text hosts: z-index < 0 decorations paint behind in-flow text (CSS stacking).
          let textDecorationsBehind: Element[] = [];
          let textDecorationsFront: Element[] = [];
          if (type === 'text') {
            const nestedDecor = collectNestedVisualDecorationsFromTextHost(element, textExcludeSubtrees);
            const excludedDirect = textExcludeSubtrees ? Array.from(textExcludeSubtrees) : [];
            const seen = new Set<Element>();
            const batch: Element[] = [];
            for (const el of [...nestedDecor, ...excludedDirect]) {
              if (seen.has(el)) continue;
              seen.add(el);
              batch.push(el);
            }
            batch.sort(
              (a, b) => parseElementZIndex(a) - parseElementZIndex(b) || compareElementsDomOrder(a, b)
            );
            for (const el of batch) {
              if (parseElementZIndex(el) < 0) textDecorationsBehind.push(el);
              else textDecorationsFront.push(el);
            }
          }

          for (const ch of textDecorationsBehind) {
            await processElement(ch, depth + 1);
          }

          result.push(info);
          markDomAsPptxMapped(element, !!info.needsScreenshot);

          // Extract visual ::before / ::after pseudo-elements as separate entries
          const pseudoItems = extractPseudoElements(element);
          for (const pi of pseudoItems) {
            result.push(pi);
          }

          if (type === 'text') {
            for (const pi of collectMergedTextSubtreePseudoElements(element, textExcludeSubtrees)) {
              result.push(pi);
            }
          }

          for (const ch of textDecorationsFront) {
            await processElement(ch, depth + 1);
          }
          if (type === 'text' && textExcludeSubtrees?.size) {
            return;
          }

          // For shape elements with children, always process children separately
          // For other non-leaf elements, process children normally
          if (shouldExtractChildrenSeparately ||
              (type !== 'text' && type !== 'icon' && type !== 'image' && type !== 'canvas' && type !== 'svg' && type !== 'math' && type !== 'table')) {
            for (const child of getChildrenInPaintOrder(element)) {
              await processElement(child, depth + 1);
            }
          }
        }

        // Find root elements to process
        let rootElements: HTMLElement[];

        /**
         * Emit page background as a rasterized full-viewport image.
         * This avoids severe color drift when CSS uses layered gradients on <body>.
         * Returns true when a background entry was emitted.
         */
        function emitPageBackgroundRasterIfAny(): boolean {
          try {
            if (!document.body) return false;
            const bs = window.getComputedStyle(document.body);
            const hasBg =
              (bs.backgroundColor &&
                bs.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                bs.backgroundColor !== 'rgba(0,0,0,0)' &&
                bs.backgroundColor !== 'transparent') ||
              (bs.backgroundImage && bs.backgroundImage !== 'none');
            if (!hasBg) return false;

            const bgHost = document.createElement('div');
            bgHost.setAttribute('data-html2pptx-page-bg', '1');
            bgHost.style.cssText = [
              'position:fixed',
              'left:0',
              'top:0',
              'width:100vw',
              'height:100vh',
              'pointer-events:none',
              // Keep it behind normal content; isolated screenshot hides other elements anyway.
              'z-index:-999999',
              // Copy computed background from body (includes layered gradients, resolved vars)
              `background-image:${bs.backgroundImage}`,
              `background-color:${canonicalizeComputedBackgroundColor(bs.backgroundColor)}`,
              `background-position:${bs.backgroundPosition}`,
              `background-size:${bs.backgroundSize}`,
              `background-repeat:${bs.backgroundRepeat}`,
            ].join(';');
            document.body.appendChild(bgHost);

            result.push({
              type: 'shape',
              tag: 'body.page-bg',
              x: 0,
              y: 0,
              width: window.innerWidth,
              height: window.innerHeight,
              styles: getComputedStyles(bgHost),
              needsScreenshot: true,
              screenshotSelector: `[data-html2pptx-page-bg="1"]`,
              screenshotBakesOpacity: true,
            });
            // Do not emit this helper node again during normal traversal.
            markDomAsPptxMapped(bgHost);
            return true;
          } catch {
            return false;
          }
        }

        const emittedPageBg = emitPageBackgroundRasterIfAny();

        if (slideSelector) {
          // Use custom slide selector
          rootElements = Array.from(document.querySelectorAll(slideSelector)) as HTMLElement[];
        } else if (inputIsSvg) {
          const svgRoot = getStandaloneSvgRoot();
          rootElements = svgRoot
            ? (Array.from([svgRoot]) as unknown as HTMLElement[])
            : document.body
              ? ([document.body] as HTMLElement[])
              : ([document.documentElement] as unknown as HTMLElement[]);
        } else {
          // Default: process body
          // If we already emitted a raster page background, skip emitting <body> itself as a shape
          // (its fill approximation can wash out the raster). Traverse its children instead.
          rootElements = emittedPageBg
            ? (Array.from(document.body!.children) as HTMLElement[])
            : [document.body!];
        }

        // Process root elements (body background is extracted via processElement when body has background)
        for (const root of rootElements) {
          await processElement(root);
        }

        // Keep raw viewport coordinates. Do not normalize by inner slide/container size.

        result.push({ _debugInfo });
        return result;
      },
      { slideSelector, slideHeight: getSlideHeightPx(), inputIsSvg }
    );

    // Check if the last element is our debug info
    const lastElement = elements[elements.length - 1];
    let _debugInfo: string[] = [];
    if (lastElement && lastElement._debugInfo) {
      _debugInfo = lastElement._debugInfo;
      elements.pop(); // Remove the debug info object from the elements array
    }

    for (const msg of _debugInfo) {
      console.log(msg);
    }

    for (const el of elements as ElementInfo[]) {
      if (el.type !== 'math' || !el.mathml) continue;
      const converted = await convertMathmlToOmml(el.mathml);
      if (!converted.ok) {
        console.warn(`MathML→OMML failed, using screenshot fallback: ${converted.error}`);
        el.needsScreenshot = true;
        continue;
      }
      el.ommlXml = converted.omml;
    }

    // Isolated screenshot backfill: remove every other box from layout (display:none)
    // so Playwright's element screenshot cannot composite separate PPTX layers (text,
    // icons, etc.) into the PNG. Keep the host and its ancestor chain visible.
    const PPTX_SHOT_HIDDEN_ATTR = 'data-html2pptx-shot-hidden';

    for (const el of elements as any[]) {
      if (el.needsScreenshot && el.screenshotSelector) {
        const selector = el.screenshotSelector as string;
        try {
          await this.page.evaluate(
            ({ sel, hiddenAttr, hideSvgText }) => {
              const host = document.querySelector(sel);
              if (!host) return;
              const hideTargets: Element[] = document.body
                ? Array.from(document.body.querySelectorAll('*'))
                : Array.from(document.documentElement.querySelectorAll('*'));
              hideTargets.forEach((node) => {
                if (!(node instanceof HTMLElement || node instanceof SVGElement)) return;
                if (node === host) return;
                if (host.contains(node)) {
                  const tag = node.localName?.toLowerCase();
                  const isSvgText =
                    tag === 'text' || tag === 'tspan' || tag === 'foreignobject';
                  if (hideSvgText && isSvgText) {
                    node.setAttribute(hiddenAttr, '1');
                    (node as SVGElement).style.setProperty('visibility', 'hidden', 'important');
                    return;
                  }
                  if (node.hasAttribute('data-html2pptx-mapped')) {
                    node.setAttribute(hiddenAttr, '1');
                    if (isSvgText) {
                      (node as SVGElement).style.setProperty('visibility', 'hidden', 'important');
                    } else {
                      (node as HTMLElement).style.setProperty('display', 'none', 'important');
                    }
                  }
                  return;
                }
                if (node.contains(host)) return;
                node.setAttribute(hiddenAttr, '1');
                (node as HTMLElement).style.setProperty('display', 'none', 'important');
              });
            },
            {
              sel: selector,
              hiddenAttr: PPTX_SHOT_HIDDEN_ATTR,
              hideSvgText: !!el.svgHybridRaster,
            }
          );

          const hybridTextCss = el.svgHybridRaster
            ? `${selector} text, ${selector} tspan, ${selector} foreignObject { visibility: hidden !important; }`
            : '';
          const bgCss = el.screenshotPreserveBackground
            ? 'html, body { background: transparent !important; }'
            : 'html, body, svg { background: transparent !important; }';
          await this.page.evaluate((css) => {
            let s = document.querySelector(
              '[data-html2pptx-shot-style]'
            ) as HTMLStyleElement | null;
            if (!s) {
              s = document.createElement('style');
              s.setAttribute('data-html2pptx-shot-style', '1');
              (document.head || document.documentElement).appendChild(s);
            }
            s.textContent = css;
          }, `${bgCss} ${hybridTextCss}`.trim());

          await this.page.evaluate(() =>
            new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            })
          );
          await this.page.waitForTimeout(50);

          const locator = this.page.locator(selector);
          const count = await locator.count();
          if (count > 0) {
            const buffer = await locator.first().screenshot({
              type: 'png',
              omitBackground: !el.screenshotPreserveBackground,
            });
            el.dataUrl = `data:image/png;base64,${buffer.toString('base64')}`;
            const preserveSvgType = el.type === 'svg';
            if (!preserveSvgType) {
              el.type = 'canvas';
              el.screenshotBakesOpacity = true;
            }
            await locator.first().evaluate((node: Element) => {
              if (node instanceof HTMLElement || node instanceof SVGElement) {
                node.setAttribute('data-html2pptx-mapped', '');
              }
            });
          }
        } catch (e) {
          console.warn(`Failed to screenshot element ${el.screenshotSelector}:`, e);
        } finally {
          await this.page.evaluate(() => {
            document.querySelector('[data-html2pptx-shot-style]')?.remove();
          });
          await this.page.evaluate((hiddenAttr) => {
            document.querySelectorAll(`[${hiddenAttr}]`).forEach((node) => {
              if (!(node instanceof HTMLElement || node instanceof SVGElement)) return;
              (node as HTMLElement).style.removeProperty('display');
              (node as SVGElement).style.removeProperty('visibility');
              node.removeAttribute(hiddenAttr);
            });
          }, PPTX_SHOT_HIDDEN_ATTR);
        }
      }
    }

    return elements as ElementInfo[];
  }

  /**
   * Detect slide boundaries based on selector or height
   */
  async detectSlides(
    elements: ElementInfo[],
    slideSelector?: string,
    splitByHeight: boolean = false
  ): Promise<Map<number, ElementInfo[]>> {
    const slides = new Map<number, ElementInfo[]>();

    if (slideSelector) {
      // Group by slide selector elements
      const slideElements = elements.filter((el) =>
        this.matchesSelector(el, slideSelector)
      );

      slideElements.forEach((slideEl, index) => {
        const slideY = slideEl.y;
        const nextSlideY =
          index < slideElements.length - 1
            ? slideElements[index + 1].y
            : Infinity;

        const slideContent = elements.filter(
          (el) => el.y >= slideY && el.y < nextSlideY
        );

        slides.set(index, slideContent);
      });
    } else if (splitByHeight) {
      // Split by fixed height (720px sections)
      elements.forEach((el) => {
        const slideIndex = Math.floor(el.y / getSlideHeightPx());
        if (!slides.has(slideIndex)) {
          slides.set(slideIndex, []);
        }
        slides.get(slideIndex)!.push(el);
      });
    } else {
      // Single slide
      slides.set(0, elements);
    }

    return slides;
  }

  /**
   * Simple selector matching helper
   */
  private matchesSelector(element: ElementInfo, selector: string): boolean {
    // Simple class selector matching
    if (selector.startsWith('.')) {
      const className = selector.slice(1);
      return element.tag.includes(className);
    }
    return false;
  }
}
