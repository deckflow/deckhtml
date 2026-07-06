/**
 * API Module
 * Main conversion function for programmatic use
 */

import { readFileSync } from 'fs';
import {
  ConversionOptions,
  ConversionResult,
  ElementInfo,
  UsedFontDescriptor,
} from './types';
import { HTMLLoader } from './loader';
import { ElementInspector } from './inspector';
import { PPTXGenerator } from './generator';
import { setViewportPixels } from './utils/coordinate';
import { isChineseFont } from './utils/chineseFonts';
import {
  isBold,
  isItalic,
  normalizeFontAwesomeFreeFamily,
  parseScriptFontFaces,
} from './utils/style';
import { buildPlatformFontContext, PlatformFontContext } from './utils/platformFontMap';

/**
 * Read SVG viewBox / width+height for viewport auto-sizing.
 */
function parseSvgViewport(inputPath: string): { width: number; height: number } | null {
  try {
    const content = readFileSync(inputPath, 'utf8');
    const viewBoxMatch = content.match(/\bviewBox=["']([^"']+)["']/i);
    if (viewBoxMatch) {
      const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
      if (parts.length >= 4 && parts[2] > 0 && parts[3] > 0) {
        return { width: Math.round(parts[2]), height: Math.round(parts[3]) };
      }
    }
    const wMatch = content.match(/\bwidth=["']([\d.]+)/i);
    const hMatch = content.match(/\bheight=["']([\d.]+)/i);
    const w = wMatch ? parseFloat(wMatch[1]) : 0;
    const h = hMatch ? parseFloat(hMatch[1]) : 0;
    if (w > 0 && h > 0) return { width: Math.round(w), height: Math.round(h) };
  } catch {
    /* ignore read/parse errors */
  }
  return null;
}

function resolveInputPaths(options: ConversionOptions): string[] {
  if (options.inputs?.length) return options.inputs;
  if (options.input) return [options.input];
  throw new Error('At least one input file is required (use input or inputs).');
}

function resolveViewportForInput(
  inputPath: string,
  options: ConversionOptions
): { width: number; height: number } {
  const inputIsSvg = inputPath.toLowerCase().endsWith('.svg');
  let viewportWidth = options.viewportWidth;
  let viewportHeight = options.viewportHeight;
  if (inputIsSvg && viewportWidth === undefined && viewportHeight === undefined) {
    const svgViewport = parseSvgViewport(inputPath);
    if (svgViewport) {
      viewportWidth = svgViewport.width;
      viewportHeight = svgViewport.height;
    }
  }
  return {
    width: viewportWidth ?? 1280,
    height: viewportHeight ?? 720,
  };
}

function collectFontsFromElements(
  elements: ElementInfo[],
  platformFontContext: PlatformFontContext | undefined,
  usedFontsMap: Map<string, UsedFontDescriptor>
): void {
  const documentUsesChineseFont = elements.some(
    (el) =>
      isChineseFont(el.styles?.fontFamily ?? '') ||
      el.richText?.some((run) => isChineseFont(run.styles?.fontFamily ?? ''))
  );

  const registerFont = (fontFamily: string, styles: ElementInfo['styles'], boldOverride?: boolean) => {
    if (!fontFamily) return;
    const bold = boldOverride ?? isBold(styles.fontWeight);
    const italic = isItalic(styles.fontStyle);
    const key = `${fontFamily}|${bold}|${italic}`;
    if (usedFontsMap.has(key)) return;
    usedFontsMap.set(key, { fontFamily, bold, italic });
  };

  const addFont = (styles: ElementInfo['styles']) => {
    if (!styles?.fontFamily) return;
    const faFreeFace = normalizeFontAwesomeFreeFamily(
      styles.fontFamily,
      styles.fontWeight?.toString()
    );
    if (faFreeFace) {
      registerFont(faFreeFace, styles, false);
      return;
    }
    const stackHasChinese = isChineseFont(styles.fontFamily);
    if (!stackHasChinese && documentUsesChineseFont) return;

    const faces = parseScriptFontFaces(styles.fontFamily, {
      platformFontContext,
      specifiedFontFamily: styles.fontFamilySpecified,
    });
    registerFont(faces.latin, styles);
    if (stackHasChinese && faces.ea !== faces.latin) {
      registerFont(faces.ea, styles);
    }
  };

  elements.forEach((el) => {
    addFont(el.styles);
    el.richText?.forEach((run) => addFont(run.styles));
  });
}

interface ProcessSingleInputResult {
  slidesMap: Map<number, ElementInfo[]>;
}

async function processSingleInput(
  loader: HTMLLoader,
  inputPath: string,
  options: ConversionOptions,
  platformFontContext: PlatformFontContext | undefined,
  usedFontsMap: Map<string, UsedFontDescriptor>
): Promise<ProcessSingleInputResult> {
  const inputIsSvg = inputPath.toLowerCase().endsWith('.svg');
  const viewport = resolveViewportForInput(inputPath, options);
  setViewportPixels(viewport.width, viewport.height);

  const page = await loader.loadHTML(
    inputPath,
    viewport,
    {
      allowLocalResources: options.allowLocalResources,
    }
  );

  try {
    if (inputIsSvg) {
      const svgValidation = await page.evaluate(() => {
        const parserError = document.querySelector('parsererror');
        if (parserError) {
          const text = parserError.textContent?.replace(/\s+/g, ' ').trim() ?? '';
          return { ok: false as const, reason: text || 'SVG XML parse error' };
        }
        const svgRoot =
          document.documentElement instanceof SVGSVGElement
            ? document.documentElement
            : document.querySelector('svg');
        if (!svgRoot) {
          return { ok: false as const, reason: 'No SVG root element found in document' };
        }
        return { ok: true as const };
      });
      if (!svgValidation.ok) {
        throw new Error(
          `Cannot convert invalid SVG: ${svgValidation.reason}\n` +
            'Fix XML syntax errors in the SVG file and try again.'
        );
      }
    }

    const inspector = new ElementInspector(page);
    const elements = await inspector.inspectElements(options.slideSelector, {
      inputIsSvg,
    });

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

    collectFontsFromElements(elements, platformFontContext, usedFontsMap);

    const slidesMap = await inspector.detectSlides(
      elements,
      options.slideSelector,
      options.splitByHeight
    );

    return { slidesMap };
  } finally {
    await loader.close().catch(() => {});
  }
}

function mergeSlidesMaps(
  target: Map<number, ElementInfo[]>,
  source: Map<number, ElementInfo[]>,
  slideOffset: number
): number {
  for (const [idx, elements] of source) {
    target.set(slideOffset + idx, elements);
  }
  return slideOffset + source.size;
}

function reportUsedFonts(usedFontsDeduped: string[]): void {
  if (usedFontsDeduped.length === 0) return;
  console.log(`\n📝 Fonts used in this presentation:`);
  usedFontsDeduped.forEach((name) => {
    console.log(`  - ${name}`);
  });
  console.log('\n💡 Make sure these fonts are installed on the system where the PPTX will be opened.\n');
}

/**
 * Convert one or more HTML/SVG files to a single PPTX.
 * Each input file becomes one slide by default; use slideSelector or splitByHeight
 * within a file to produce multiple slides from that file.
 */
export async function convertHtmlToPptx(
  options: ConversionOptions
): Promise<ConversionResult> {
  const inputPaths = resolveInputPaths(options);
  const platformFontContext = buildPlatformFontContext(options);
  const loader = new HTMLLoader();
  const mergedSlidesMap = new Map<number, ElementInfo[]>();
  const usedFontsMap = new Map<string, UsedFontDescriptor>();

  await loader.init();

  let slideOffset = 0;
  for (let i = 0; i < inputPaths.length; i++) {
    const inputPath = inputPaths[i];
    if (inputPaths.length > 1) {
      console.log(`\n📄 Processing ${i + 1}/${inputPaths.length}: ${inputPath}`);
    }

    const { slidesMap } = await processSingleInput(
      loader,
      inputPath,
      options,
      platformFontContext,
      usedFontsMap
    );
    slideOffset = mergeSlidesMaps(mergedSlidesMap, slidesMap, slideOffset);
  }

  const usedFontsDeduped = [...new Set(Array.from(usedFontsMap.values()).map((d) => d.fontFamily))].sort();

  const generator = new PPTXGenerator({
    platformFontContext,
    splitByHeight: options.splitByHeight,
    slideSelector: options.slideSelector,
  });
  const data = await generator.generate(mergedSlidesMap);
  const slideCount = generator.getSlideCount();

  reportUsedFonts(usedFontsDeduped);

  return {
    data,
    usedFonts: usedFontsDeduped,
    slideCount,
  };
}

export default convertHtmlToPptx;
