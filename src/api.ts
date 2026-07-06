/**
 * API Module
 * Main conversion function for programmatic use
 */

import { readFileSync } from 'fs';
import { ConversionOptions, ConversionResult, UsedFontDescriptor } from './types';
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
import { buildPlatformFontContext } from './utils/platformFontMap';

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

/**
 * Convert HTML to PPTX
 */
export async function convertHtmlToPptx(
  options: ConversionOptions
): Promise<ConversionResult> {
  const loader = new HTMLLoader();

  const inputIsSvg = options.input.toLowerCase().endsWith('.svg');
  let viewportWidth = options.viewportWidth;
  let viewportHeight = options.viewportHeight;
  if (inputIsSvg && viewportWidth === undefined && viewportHeight === undefined) {
    const svgViewport = parseSvgViewport(options.input);
    if (svgViewport) {
      viewportWidth = svgViewport.width;
      viewportHeight = svgViewport.height;
    }
  }
  viewportWidth ??= 1280;
  viewportHeight ??= 720;
  setViewportPixels(viewportWidth, viewportHeight);

  await loader.init();

  try {
    const page = await loader.loadHTML(
      options.input,
      {
        width: viewportWidth,
        height: viewportHeight,
      },
      {
        allowLocalResources: options.allowLocalResources,
      }
    );

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

    const platformFontContext = buildPlatformFontContext(options);

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
      })
    }

    const documentUsesChineseFont = elements.some(
      (el: any) =>
        isChineseFont(el.styles?.fontFamily ?? '') ||
        el.richText?.some((run: any) => isChineseFont(run.styles?.fontFamily ?? ''))
    );
    const usedFontsMap = new Map<string, UsedFontDescriptor>();
    const registerFont = (fontFamily: string, styles: any, boldOverride?: boolean) => {
      if (!fontFamily) return;
      const bold = boldOverride ?? isBold(styles.fontWeight);
      const italic = isItalic(styles.fontStyle);
      const key = `${fontFamily}|${bold}|${italic}`;
      if (usedFontsMap.has(key)) return;
      usedFontsMap.set(key, { fontFamily, bold, italic });
    };
    const addFont = (styles: any) => {
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
    elements.forEach((el: any) => {
      addFont(el.styles);
      el.richText?.forEach((run: any) => addFont(run.styles));
    });
    const usedFontsList = Array.from(usedFontsMap.values());
    const usedFontsDeduped = [...new Set(usedFontsList.map((d) => d.fontFamily))].sort();

    const slidesMap = await inspector.detectSlides(
      elements,
      options.slideSelector,
      options.splitByHeight
    );

    const generator = new PPTXGenerator({ platformFontContext });
    const data = await generator.generate(slidesMap);

    const slideCount = generator.getSlideCount();

    if (usedFontsDeduped.length > 0) {
      console.log(`\n📝 Fonts used in this presentation:`);
      usedFontsDeduped.forEach(name => {
        console.log(`  - ${name}`);
      });
      console.log('\n💡 Make sure these fonts are installed on the system where the PPTX will be opened.\n');
    }

    return {
      data,
      usedFonts: usedFontsDeduped,
      slideCount,
    };
  } finally {
    await loader.close().catch(() => {});
  }
}

export default convertHtmlToPptx;
