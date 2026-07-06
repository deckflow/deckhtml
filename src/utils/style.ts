/**
 * CSS to PPTX style mapping utilities
 */

import { ComputedStyles, GradientData, GradientStop } from '../types';
import { inchToPoints, pxToInch, pxToPoints } from './coordinate';
import { isChineseFont, splitFontStack } from './chineseFonts';
import {
  detectStackGenericKind,
  getPlatformMappedFont,
  isGenericSansToken,
  isGenericSerifToken,
  isPlatformFontContextActive,
  PlatformFontContext,
  resolveFontFamilyForPlatform,
} from './platformFontMap';

/**
 * Sanitize text for XML/PPTX compatibility - remove control characters that cause Office repair
 * XML 1.0 allows: #x9, #xA, #xD, #x20-#xD7FF, #xE000-#xFFFD
 */
export function sanitizeTextForXml(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

/** Relative luminance 0–1 for hex RRGGBB (sRGB) */
function hexLuminance(hex6: string): number {
  const r = parseInt(hex6.slice(0, 2), 16) / 255;
  const g = parseInt(hex6.slice(2, 4), 16) / 255;
  const b = parseInt(hex6.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** HSL (degrees, 0–100, 0–100) → sRGB 0–255 */
function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  let hue = h % 360;
  if (hue < 0) hue += 360;
  const sat = Math.max(0, Math.min(100, s)) / 100;
  const light = Math.max(0, Math.min(100, l)) / 100;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    return light - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
}

/**
 * Convert Oklab (L,a,b) to sRGB, returns {r,g,b} 0-255
 * Tailwind v4 and modern CSS use oklab()
 */
function oklabToSrgb(L: number, aVal: number, bVal: number): { r: number; g: number; b: number } {
  const l_ = L + aVal * 0.3963377774 + bVal * 0.2158037573;
  const m_ = L + aVal * -0.1055613458 + bVal * -0.0638541728;
  const s_ = L + aVal * -0.0894841775 + bVal * -1.291485548;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const linearToGamma = (c: number) =>
    c >= 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c;
  const rVal = 255 * linearToGamma(l * 4.0767416621 + m * -3.3077115913 + s * 0.2309699292);
  const gVal = 255 * linearToGamma(l * -1.2684380046 + m * 2.6097574011 + s * -0.3413193965);
  const bVal2 = 255 * linearToGamma(l * -0.0041960863 + m * -0.7034186147 + s * 1.707614701);
  return {
    r: Math.round(Math.max(0, Math.min(255, rVal))),
    g: Math.round(Math.max(0, Math.min(255, gVal))),
    b: Math.round(Math.max(0, Math.min(255, bVal2))),
  };
}

/**
 * Parse CSS color to hex format (RRGGBB without #) and extract alpha
 * PowerPoint uses hex colors without the # prefix
 * Returns { color: string, alpha?: number } where alpha is 0-1
 */
export function parseColor(color: string | undefined): { color: string; alpha?: number } | undefined {
  if (!color) return undefined;

  // Handle transparent / none
  if (color === 'transparent' || color === 'none') return undefined;

  // Handle oklch() - Tailwind v4, OKLCH (L chroma hue / alpha)
  const oklchMatch = color.match(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)/);
  if (oklchMatch) {
    const L = parseFloat(oklchMatch[1]);
    const C = parseFloat(oklchMatch[2]);
    const H = parseFloat(oklchMatch[3]); // hue in degrees
    const alpha = oklchMatch[4] !== undefined ? parseFloat(oklchMatch[4]) : 1;
    if (alpha === 0) return undefined;
    const Hrad = (H * Math.PI) / 180;
    const aVal = C * Math.cos(Hrad);
    const bVal = C * Math.sin(Hrad);
    const rgb = oklabToSrgb(L, aVal, bVal);
    const hex = [rgb.r, rgb.g, rgb.b]
      .map((v) => v.toString(16).padStart(2, '0').toUpperCase())
      .join('');
    return { color: hex, alpha: alpha < 1 ? alpha : undefined };
  }

  // Handle oklab() - Tailwind v4, modern CSS
  const oklabMatch = color.match(/oklab\(\s*([\d.+-]+)\s+([\d.+-]+)\s+([\d.+-]+)(?:\s*\/\s*([\d.]+))?\)/);
  if (oklabMatch) {
    const L = parseFloat(oklabMatch[1]);
    const a = parseFloat(oklabMatch[2]);
    const b = parseFloat(oklabMatch[3]);
    const alpha = oklabMatch[4] !== undefined ? parseFloat(oklabMatch[4]) : 1;
    if (alpha === 0) return undefined;
    const rgb = oklabToSrgb(L, a, b);
    const hex = [rgb.r, rgb.g, rgb.b]
      .map((v) => v.toString(16).padStart(2, '0').toUpperCase())
      .join('');
    return { color: hex, alpha: alpha < 1 ? alpha : undefined };
  }

  // hsl() / hsla() — comma or space syntax (Tailwind hsl(var(...)))
  const hslComma = color.match(
    /^hsla?\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%(?:\s*,\s*([\d.]+))?\s*\)$/i
  );
  if (hslComma) {
    const alpha = hslComma[4] !== undefined ? parseFloat(hslComma[4]) : 1;
    if (alpha === 0) return undefined;
    const rgb = hslToRgb(parseFloat(hslComma[1]), parseFloat(hslComma[2]), parseFloat(hslComma[3]));
    const hex = [rgb.r, rgb.g, rgb.b]
      .map((v) => v.toString(16).padStart(2, '0').toUpperCase())
      .join('');
    return { color: hex, alpha: alpha < 1 ? alpha : undefined };
  }
  const hslSpace = color.match(
    /^hsla?\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%(?:\s*\/\s*([\d.]+))?\s*\)$/i
  );
  if (hslSpace) {
    const alpha = hslSpace[4] !== undefined ? parseFloat(hslSpace[4]) : 1;
    if (alpha === 0) return undefined;
    const rgb = hslToRgb(parseFloat(hslSpace[1]), parseFloat(hslSpace[2]), parseFloat(hslSpace[3]));
    const hex = [rgb.r, rgb.g, rgb.b]
      .map((v) => v.toString(16).padStart(2, '0').toUpperCase())
      .join('');
    return { color: hex, alpha: alpha < 1 ? alpha : undefined };
  }

  // rgb() / rgba() — space-separated (CSS Color 4), e.g. rgb(30 64 175 / 1)
  const rgbSpace = color.match(/^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/i);
  if (rgbSpace) {
    const alpha = rgbSpace[4] !== undefined ? parseFloat(rgbSpace[4]) : 1;
    if (alpha === 0) return undefined;
    const r = parseInt(rgbSpace[1], 10).toString(16).padStart(2, '0').toUpperCase();
    const g = parseInt(rgbSpace[2], 10).toString(16).padStart(2, '0').toUpperCase();
    const b = parseInt(rgbSpace[3], 10).toString(16).padStart(2, '0').toUpperCase();
    return { color: `${r}${g}${b}`, alpha: alpha < 1 ? alpha : undefined };
  }

  // Handle rgba - check alpha channel
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (rgbaMatch) {
    const alpha = rgbaMatch[4] ? parseFloat(rgbaMatch[4]) : 1;

    // If fully transparent, return undefined
    if (alpha === 0) return undefined;

    const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, '0').toUpperCase();
    const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, '0').toUpperCase();
    const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, '0').toUpperCase();

    return { color: `${r}${g}${b}`, alpha: alpha < 1 ? alpha : undefined };
  }

  // Already hex
  if (color.startsWith('#')) {
    return color.length === 7 ? { color: color.substring(1).toUpperCase() } : undefined;
  }

  // Named colors - map common ones (without #)
  const namedColors: Record<string, string> = {
    black: '000000',
    white: 'FFFFFF',
    red: 'FF0000',
    green: '008000',
    blue: '0000FF',
    yellow: 'FFFF00',
    gray: '808080',
    transparent: undefined as any,
  };

  const namedColor = namedColors[color.toLowerCase()];
  return namedColor ? { color: namedColor } : undefined;
}

/**
 * Parse font size from CSS to points
 * Reduced by 10% to better match web rendering (PPTX fonts tend to appear larger).
 * Viewport scaling (e.g. 1920→1280) is applied transparently inside `pxToPoints`.
 */
export function parseFontSize(fontSize: string | undefined): number {
  if (!fontSize) return 12;

  const px = parseFloat(fontSize);
  if (isNaN(px)) return 12;

  return Math.round(pxToPoints(px) * 0.922);
}

/**
 * Font size for inline pill badges (roundRect + text).
 * Global parseFontSize dampens ~8% for body copy; shape text at small sizes reads too small
 * inside a fixed-width badge, so use slide-space pt (px→inch→pt) without that dampening.
 */
export function parsePillFontSize(fontSize: string | undefined): number {
  const px = parseFloat(String(fontSize ?? ''));
  if (isNaN(px) || px <= 0) return parseFontSize(fontSize);
  const spatialPt = inchToPoints(pxToInch(px));
  const standardPt = pxToPoints(px);
  return Math.round(Math.max(spatialPt, standardPt));
}

export interface ParseScriptFontFacesOptions {
  platformFontContext?: PlatformFontContext;
  specifiedFontFamily?: string;
}

/**
 * Parse font family, return first available font
 */
export function parseFontFamily(
  fontFamily: string | undefined,
  ctx?: PlatformFontContext
): string {
  if (!fontFamily) {
    return isPlatformFontContextActive(ctx)
      ? getPlatformMappedFont('sans', ctx)
      : 'Arial';
  }

  const firstFont = fontFamily.split(',')[0].trim().replace(/['"]/g, '');
  const lower = firstFont.toLowerCase();

  if (isPlatformFontContextActive(ctx)) {
    if (isGenericSansToken(firstFont)) return getPlatformMappedFont('sans', ctx);
    if (isGenericSerifToken(firstFont)) return getPlatformMappedFont('serif', ctx);
  }

  const fontMap: Record<string, string> = {
    'sans-serif': isPlatformFontContextActive(ctx)
      ? getPlatformMappedFont('sans', ctx)
      : 'Arial',
    serif: isPlatformFontContextActive(ctx)
      ? getPlatformMappedFont('serif', ctx)
      : 'Times New Roman',
    monospace: 'Courier New',
    cursive: 'Comic Sans MS',
  };

  return fontMap[lower] || firstFont;
}

export interface ScriptFontFaces {
  latin: string;
  ea: string;
  cs: string;
}

/**
 * Parse CSS font-family stack into PPTX script-specific faces.
 * - latin: first font in stack
 * - ea: first Chinese font in stack
 * - cs: Arial by default, or platform-mapped font for ar/he langs
 */
export function parseScriptFontFaces(
  fontFamily: string | undefined,
  options?: ParseScriptFontFacesOptions
): ScriptFontFaces {
  const ctx = options?.platformFontContext;
  const specified = options?.specifiedFontFamily;
  const defaultLatin = isPlatformFontContextActive(ctx)
    ? getPlatformMappedFont('sans', ctx)
    : 'Arial';

  if (!fontFamily && !specified) {
    return applyPlatformScriptSlots({ latin: defaultLatin, ea: defaultLatin, cs: defaultLatin }, ctx, specified, fontFamily);
  }

  const effectiveFamily = isPlatformFontContextActive(ctx)
    ? resolveFontFamilyForPlatform(fontFamily, specified, ctx)
    : fontFamily;

  const tokens = splitFontStack(effectiveFamily ?? '')
    .map((x) => x.trim().replace(/['"]/g, ''))
    .filter(Boolean);

  if (tokens.length === 0) {
    return applyPlatformScriptSlots({ latin: defaultLatin, ea: defaultLatin, cs: defaultLatin }, ctx, specified, fontFamily);
  }

  const latin = parseFontFamily(tokens[0], ctx);
  const eaToken = tokens.find((token) => isChineseFont(token));
  const ea = eaToken ? parseFontFamily(eaToken, ctx) : latin;

  return applyPlatformScriptSlots({ latin, ea, cs: 'Arial' }, ctx, specified, fontFamily);
}

function applyPlatformScriptSlots(
  faces: ScriptFontFaces,
  ctx?: PlatformFontContext,
  specified?: string,
  computed?: string
): ScriptFontFaces {
  if (!isPlatformFontContextActive(ctx)) return faces;

  const genericKind = detectStackGenericKind(specified) ?? detectStackGenericKind(computed);
  if (!genericKind) return faces;

  const mapped = getPlatformMappedFont(genericKind, ctx);
  const { lang } = ctx;

  if (lang === 'latin') {
    if (!specified || !stackHasNamedFontLocal(specified)) {
      return { latin: mapped, ea: mapped, cs: getPlatformMappedFont('sans', ctx) };
    }
  } else if (lang === 'sc' || lang === 'tc' || lang === 'jp' || lang === 'kr') {
    if (!specified || !stackHasNamedFontLocal(specified)) {
      return { latin: mapped, ea: mapped, cs: getPlatformMappedFont('sans', ctx) };
    }
    return { ...faces, ea: faces.ea === faces.latin ? mapped : faces.ea };
  } else if (lang === 'ar' || lang === 'he') {
    if (!specified || !stackHasNamedFontLocal(specified)) {
      return { latin: mapped, ea: mapped, cs: mapped };
    }
    return { ...faces, cs: mapped };
  }

  return faces;
}

function stackHasNamedFontLocal(fontFamily: string | undefined): boolean {
  if (!fontFamily) return false;
  return splitFontStack(fontFamily).some((tok) => {
    const core = tok.trim().replace(/^['"]|['"]$/g, '').toLowerCase();
    return core && !isGenericSansToken(tok) && !isGenericSerifToken(tok);
  });
}

/**
 * Check if font weight is bold
 * For numeric values: > 400 is treated as bold (500-900 map to bold in PPTX)
 */
export function isBold(fontWeight: string | undefined): boolean {
  if (!fontWeight) return false;
  const num = parseInt(fontWeight, 10);
  if (!isNaN(num)) return num > 400;
  return fontWeight === 'bold' || fontWeight === 'bolder';
}

/** PPTX / registry face names for Font Awesome 6 Free (Solid vs Regular files). */
const FONT_AWESOME_6_FREE_SOLID = 'Font Awesome 6 Free Solid';
const FONT_AWESOME_6_FREE_REGULAR = 'Font Awesome 6 Free Regular';

function firstFontFamilyToken(fontFamily: string | undefined): string {
  if (!fontFamily) return '';
  return fontFamily.split(',')[0].trim().replace(/['"]/g, '');
}

/**
 * If the primary font is Font Awesome Free (not Brands), return a discrete family name
 * (Solid vs Regular) from font-weight so multiple TTFs can be embedded without clashing.
 * Brands and non–Free families are left to the caller (returns undefined).
 */
export function normalizeFontAwesomeFreeFamily(
  fontFamily: string | undefined,
  fontWeight: string | undefined
): string | undefined {
  const first = firstFontFamilyToken(fontFamily);
  if (!first) return undefined;
  if (!/^Font Awesome/i.test(first)) return undefined;
  if (/brands/i.test(first)) return undefined;
  if (!/free/i.test(first)) return undefined;

  if (/^Font Awesome 6 Free Regular$/i.test(first)) return FONT_AWESOME_6_FREE_REGULAR;
  if (/^Font Awesome 6 Free Solid$/i.test(first)) return FONT_AWESOME_6_FREE_SOLID;

  return isBold(fontWeight) ? FONT_AWESOME_6_FREE_SOLID : FONT_AWESOME_6_FREE_REGULAR;
}

/**
 * Check if font style is italic
 */
export function isItalic(fontStyle: string | undefined): boolean {
  return fontStyle === 'italic' || fontStyle === 'oblique';
}

/**
 * Check if text has underline
 */
export function hasUnderline(textDecoration: string | undefined): boolean {
  return textDecoration?.includes('underline') || false;
}

export function hasStrikethrough(textDecoration: string | undefined): boolean {
  return textDecoration?.includes('line-through') || false;
}

/**
 * Parse text alignment
 */
export function parseTextAlign(
  textAlign: string | undefined
): 'left' | 'center' | 'right' | undefined {
  if (!textAlign) return undefined;
  if (textAlign === 'left' || textAlign === 'center' || textAlign === 'right') {
    return textAlign;
  }
  return undefined;
}

/**
 * Parse opacity (0-1) to transparency percentage (0-100)
 */
export function parseTransparency(opacity: number | undefined): number {
  if (opacity === undefined || opacity === 1) return 0;
  return Math.round((1 - opacity) * 100);
}

/**
 * Parse border width from CSS
 * Using 0.5 ratio (px to pt) for better visual match
 * Empirically determined: 8px (web) ≈ 4pt (PowerPoint)
 */
export function parseBorderWidth(borderWidth: string | undefined): number {
  if (!borderWidth) return 0;
  const px = parseFloat(borderWidth);
  return isNaN(px) ? 0 : px * 0.5;
}

/**
 * Map CSS border-style to pptxgenjs dashType
 * PowerPoint supports: solid, dash, dashDot, lgDash, lgDashDot, lgDashDotDot, sysDash, sysDot
 */
export function parseBorderStyleToDashType(borderStyle: string | undefined): 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot' {
  const s = (borderStyle || 'solid').toLowerCase();
  const map: Record<string, 'solid' | 'dash' | 'dashDot' | 'lgDash' | 'lgDashDot' | 'lgDashDotDot' | 'sysDash' | 'sysDot'> = {
    'solid': 'solid',
    'none': 'solid',
    'dashed': 'dash',
    'dotted': 'sysDot',
    'double': 'solid', // double-line not directly supported, fallback to solid
    'groove': 'solid',
    'ridge': 'solid',
    'inset': 'solid',
    'outset': 'solid',
  };
  return map[s] ?? 'solid';
}

/**
 * Parse padding from CSS to points
 * Converts padding values to match PowerPoint margin units
 */
export function parsePadding(padding: string | undefined): number {
  if (!padding) return 0;
  const px = parseFloat(padding);
  return isNaN(px) ? 0 : pxToPoints(px);
}

/** Slide-space padding/border px → pt for text-box insets (not font-calibrated pxToPoints). */
export function parseBoxInsetPt(paddingPx: number, borderPx: number = 0): number {
  const px = paddingPx + borderPx;
  if (px <= 0) return 0;
  return inchToPoints(pxToInch(px));
}

/**
 * Parse letter spacing from CSS to points
 * Converts letter-spacing to PowerPoint character spacing (charSpacing)
 * Supports: normal, px, em (em needs fontSizePx for conversion)
 */
export function parseLetterSpacing(
  letterSpacing: string | undefined,
  fontSizePx?: number,
  pxToPt: (px: number) => number = pxToPoints,
  boost = 1.35
): number | undefined {
  if (!letterSpacing || letterSpacing === 'normal') return undefined;
  const str = letterSpacing.trim();
  let px: number;
  if (str.endsWith('em') || str.endsWith('rem')) {
    const num = parseFloat(str);
    if (isNaN(num) || num === 0) return undefined;
    const basePx = fontSizePx ?? 16;
    px = num * basePx;
  } else {
    px = parseFloat(str);
    if (isNaN(px) || px === 0) return undefined;
  }
  // pptxgenjs charSpacing expects 1-256 points; negative letter-spacing not supported
  const basePt = pxToPt(Math.abs(px));
  const adjustedPt = basePt * boost;
  return adjustedPt >= 0.5 ? adjustedPt : undefined;
}

/**
 * Parse line height from CSS to pptxgenjs lineSpacing (points) or lineSpacingMultiple
 * CSS line-height: normal | number (1.5) | length (24px, 1.5em) | percentage (150%)
 * pptxgenjs: lineSpacing (points, fixed) | lineSpacingMultiple (e.g. 1.5 = 150%)
 */
export function parseLineHeight(
  lineHeight: string | undefined,
  fontSizePx?: number
): { lineSpacing?: number; lineSpacingMultiple?: number } | undefined {
  if (!lineHeight || lineHeight === 'normal') return undefined;
  const str = lineHeight.trim();
  const num = parseFloat(str);

  if (isNaN(num)) return undefined;

  // Percentage: 150% → lineSpacingMultiple 1.5
  if (str.includes('%')) {
    const multiple = num / 100;
    if (multiple > 0 && multiple <= 10) {
      return { lineSpacingMultiple: multiple };
    }
    return undefined;
  }

  // Unitless number (e.g. 1.5): line-height multiplier
  if (str.endsWith('px') || str.endsWith('em') || str.endsWith('rem')) {
    // Length: convert to points for lineSpacing
    // (Viewport scaling is applied inside pxToPoints.)
    let px: number;
    if (str.endsWith('em') || str.endsWith('rem')) {
      const basePx = fontSizePx ?? 16;
      px = num * basePx;
    } else {
      px = num;
    }
    // Browsers expose unitless line-height (e.g. 0.9) as computed px ≈ ratio × font-size.
    if (str.endsWith('px') && fontSizePx && fontSizePx > 0) {
      const ratio = px / fontSizePx;
      if (ratio >= 0.25 && ratio <= 10) {
        const rounded = Math.round(ratio * 1000) / 1000;
        if (Math.abs(px - rounded * fontSizePx) < 0.6) {
          return { lineSpacingMultiple: rounded };
        }
      }
    }
    const pt = pxToPoints(px);
    if (pt >= 1 && pt <= 256) return { lineSpacing: pt };
    return undefined;
  }

  // Unitless: 1.5, 1.8, 2 → lineSpacingMultiple (typical range 0.5-5)
  if (num >= 0.5 && num <= 10) {
    return { lineSpacingMultiple: num };
  }

  // Bare number like "24" (no unit) - treat as px if > 10
  if (num > 10 && num <= 500) {
    return { lineSpacing: pxToPoints(num) };
  }

  return undefined;
}

/**
 * Parsed box-shadow result with classification
 */
export interface BoxShadowParsed {
  offsetX: number;     // px
  offsetY: number;     // px
  blur: number;        // px
  spread: number;      // px
  color: string;       // hex (RRGGBB)
  alpha: number;       // 0-1
  /** 'glow' when shadow wraps 3-4 sides, 'shadow' when 1-2 sides */
  effect: 'glow' | 'shadow';
}

/**
 * Internal helper: parse a box-shadow string in either format:
 *   Format A (CSS shorthand): "2px 2px 4px 0px rgba(0,0,0,0.5)"
 *   Format B (computed style): "rgba(0, 0, 0, 0.05) 0px 10px 25px 0px"
 * Returns { offsetX, offsetY, blur, spread, colorStr } or undefined.
 */
function parseBoxShadowParts(boxShadow: string): { offsetX: number; offsetY: number; blur: number; spread: number; colorStr: string } | undefined {
  // Format A: numbers first, then color
  const matchA = boxShadow.match(
    /^([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px\s+(.+)$/
  );
  if (matchA) {
    return {
      offsetX: parseFloat(matchA[1]),
      offsetY: parseFloat(matchA[2]),
      blur: parseFloat(matchA[3]),
      spread: parseFloat(matchA[4]),
      colorStr: matchA[5].trim(),
    };
  }

  // Format B: color first (rgb/rgba/hsl/hex), then numbers
  const matchB = boxShadow.match(
    /^((?:rgba?\([\d.,\s/]+\))|(?:hsla?\([\d.,\s%/]+\))|(?:#[0-9a-fA-F]{3,8}))\s+([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px\s+([-\d.]+)px$/
  );
  if (matchB) {
    return {
      offsetX: parseFloat(matchB[2]),
      offsetY: parseFloat(matchB[3]),
      blur: parseFloat(matchB[4]),
      spread: parseFloat(matchB[5]),
      colorStr: matchB[1].trim(),
    };
  }

  return undefined;
}

/**
 * Parse box-shadow and classify as glow (all-around) or shadow (directional).
 *
 * Classification: count the sides where blur extends beyond the offset.
 *   visible extent on a side = blur - abs(offset towards that side)
 *   3-4 visible sides → glow, 1-2 → shadow
 */
export function parseBoxShadowClassified(boxShadow: string | undefined): BoxShadowParsed | undefined {
  if (!boxShadow || boxShadow === 'none') return undefined;

  const parts = parseBoxShadowParts(boxShadow.trim());
  if (!parts) return undefined;

  const { offsetX, offsetY, blur, spread, colorStr } = parts;
  const colorResult = parseColor(colorStr);
  if (!colorResult) return undefined;

  // Count visible sides: blur extends past the offset on that side?
  let visibleSides = 0;
  if (blur - Math.abs(Math.min(0, offsetX)) > 0) visibleSides++; // left  (offsetX < 0 pushes right)
  if (blur - Math.abs(Math.max(0, offsetX)) > 0) visibleSides++; // right (offsetX > 0 pushes right)
  if (blur - Math.abs(Math.min(0, offsetY)) > 0) visibleSides++; // top
  if (blur - Math.abs(Math.max(0, offsetY)) > 0) visibleSides++; // bottom

  const effect: 'glow' | 'shadow' = visibleSides >= 3 ? 'glow' : 'shadow';

  return {
    offsetX,
    offsetY,
    blur,
    spread,
    color: colorResult.color,
    alpha: colorResult.alpha ?? 0.5,
    effect,
  };
}

/**
 * Parse box shadow to PPTX shadow options (for directional shadows)
 */
export function parseBoxShadow(boxShadow: string | undefined): any {
  if (!boxShadow || boxShadow === 'none') return undefined;

  const parts = parseBoxShadowParts(boxShadow.trim());
  if (!parts) return undefined;

  const { offsetX, offsetY, blur, colorStr } = parts;
  const colorResult = parseColor(colorStr);

  return {
    type: 'outer',
    angle: Math.atan2(offsetY, offsetX) * (180 / Math.PI),
    blur: Math.max(0, Math.min(100, pxToPoints(blur))),
    offset: Math.max(0, Math.min(200, pxToPoints(Math.sqrt(offsetX ** 2 + offsetY ** 2)))),
    color: colorResult?.color || '000000',
    opacity:
      colorResult?.alpha !== undefined
        ? Math.max(0, Math.min(1, colorResult.alpha))
        : 0.5,
  };
}

/**
 * Extract blur radius (in px) from CSS filter string (e.g., "blur(20px) brightness(1.1)")
 */
export function parseBlurFilter(filter: string | undefined): number | undefined {
  if (!filter) return undefined;
  const match = filter.match(/blur\(\s*([^)]+)\)/i);
  if (!match) return undefined;

  const rawValue = match[1].trim();
  const unitMatch = rawValue.match(/^([-\d.]+)([a-z%]*)$/i);
  if (!unitMatch) return undefined;

  const numeric = parseFloat(unitMatch[1]);
  if (isNaN(numeric) || numeric <= 0) return undefined;

  const unit = unitMatch[2].toLowerCase();
  if (unit === '' || unit === 'px') {
    return numeric;
  }

  // Unsupported units (em/rem/etc.) - return undefined to avoid incorrect scaling
  return undefined;
}

/**
 * Extract rotation in degrees from CSS transform.
 * Handles:
 * - Literal: "rotate(45deg)", "rotate(-0.25turn)"
 * - Computed: "matrix(a, b, c, d, e, f)" (browser returns this for rotate(45deg))
 * Returns value in range [-360, 360] for pptxgenjs, or undefined if no rotation.
 */
export function parseTransformRotate(transform: string | undefined): number | undefined {
  if (!transform || typeof transform !== 'string') return undefined;

  // 1) Literal rotate() from author CSS
  const rotateMatch = transform.match(/rotate\s*\(\s*([-\d.]+)\s*(deg|turn|rad)\s*\)/i);
  if (rotateMatch) {
    const value = parseFloat(rotateMatch[1]);
    const unit = (rotateMatch[2] || 'deg').toLowerCase();
    if (isNaN(value)) return undefined;
    let degrees: number;
    if (unit === 'deg') degrees = value;
    else if (unit === 'turn') degrees = value * 360;
    else if (unit === 'rad') degrees = (value * 180) / Math.PI;
    else return undefined;
    return normalizeRotateDegrees(degrees);
  }

  // 2) Computed value: matrix(a, b, c, d, e, f) — browser converts rotate(θ) to matrix(cos θ, sin θ, -sin θ, cos θ, 0, 0)
  const matrixMatch = transform.match(/matrix\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
  if (matrixMatch) {
    const a = parseFloat(matrixMatch[1]);
    const b = parseFloat(matrixMatch[2]);
    if (isNaN(a) || isNaN(b)) return undefined;
    // Rotation angle: atan2(b, a) in radians → degrees
    const radians = Math.atan2(b, a);
    const degrees = (radians * 180) / Math.PI;
    return normalizeRotateDegrees(degrees);
  }

  // 3) matrix3d(...) — use upper-left 2x2 for rotation (rotateZ)
  const matrix3dMatch = transform.match(/matrix3d\s*\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/);
  if (matrix3dMatch) {
    const m11 = parseFloat(matrix3dMatch[1]);
    const m12 = parseFloat(matrix3dMatch[2]);
    if (isNaN(m11) || isNaN(m12)) return undefined;
    const radians = Math.atan2(m12, m11);
    const degrees = (radians * 180) / Math.PI;
    return normalizeRotateDegrees(degrees);
  }

  return undefined;
}

function normalizeRotateDegrees(degrees: number): number | undefined {
  if (degrees === 0) return undefined;
  degrees = degrees % 360;
  if (degrees > 360) degrees -= 360;
  if (degrees < -360) degrees += 360;
  return Math.round(degrees * 100) / 100;
}

/**
 * Map CSS `-webkit-text-stroke` to pptxgen `outline` (text stroke in PPT).
 */
export function parseWebkitTextStroke(styles: ComputedStyles): { widthPt: number; colorHex: string } | undefined {
  const raw = styles.webkitTextStroke?.trim();
  let widthPx = 0;
  let colorStr: string | undefined;

  if (raw && raw !== 'none' && raw !== '0px') {
    const m = raw.match(/^([\d.]+)\s*px\s+([\s\S]+)$/);
    if (m) {
      widthPx = parseFloat(m[1]) || 0;
      colorStr = m[2].trim();
    }
  }
  if (widthPx <= 0 && styles.webkitTextStrokeWidth) {
    const w = styles.webkitTextStrokeWidth.trim();
    if (w && w !== 'none') {
      widthPx = parseFloat(w) || 0;
    }
  }
  if (!colorStr && styles.webkitTextStrokeColor) {
    const c = styles.webkitTextStrokeColor.trim();
    if (c && c !== 'none') colorStr = c;
  }

  if (widthPx <= 0 || !colorStr) return undefined;

  const colorResult = parseColor(colorStr);
  if (!colorResult?.color) return undefined;

  return {
    widthPt: Math.max(0.25, pxToPoints(widthPx)),
    colorHex: colorResult.color,
  };
}

/**
 * Get text options for pptxgenjs
 */
/**
 * Map CSS writing-mode to OOXML a:bodyPr @vert (ST_TextVerticalType).
 * vertical-rl: columns progress right-to-left → eaVert (East Asian vertical).
 * vertical-lr: columns progress left-to-right → vert.
 */
export function getOoxmlBodyPrVert(writingMode: string | undefined): string | undefined {
  if (!writingMode) return undefined;
  const wm = writingMode.trim().toLowerCase();
  if (wm === 'vertical-rl') return 'eaVert';
  if (wm === 'vertical-lr') return 'vert';
  return undefined;
}

export function getTextOptions(
  styles: ComputedStyles,
  platformFontContext?: PlatformFontContext
): any {
  const options: any = {};

  const backgroundClip = styles.backgroundClip ?? styles.webkitBackgroundClip;
  const isTextClip = backgroundClip === 'text';

  const textStroke = parseWebkitTextStroke(styles);

  let colorResult = parseColor(styles.color) ?? parseColor(styles.webkitTextFillColor);

  if (!colorResult && isTextClip) {
    const gradientResult = parseGradientSolidApproximation(styles.backgroundImage);
    if (gradientResult) {
      colorResult = { color: gradientResult.color };
    }
  }

  if (textStroke) {
    options.outline = { color: textStroke.colorHex, size: textStroke.widthPt };
  }

  if (colorResult) {
    options.color = colorResult.color;
  } else if (textStroke) {
    // Hollow text (color/nofill transparent): PPT defaults to black if no solidFill — use full transparency
    options.color = 'FFFFFF';
    options.transparency = 100;
  }

  // Apply opacity as text transparency when color has no alpha
  // e.g. opacity-20 (0.2) on text-[#A63437] → transparency 80
  if (colorResult && colorResult.alpha === undefined && styles.opacity !== undefined) {
    const transparency = parseTransparency(styles.opacity);
    if (transparency > 0) options.transparency = transparency;
  } else if (colorResult?.alpha !== undefined && colorResult.alpha < 1) {
    // rgba() alpha takes precedence over opacity when both exist
    options.transparency = Math.round((1 - colorResult.alpha) * 100);
  }

  const isPillBoxEarly = isInlinePillBox(styles);
  const fontSize = isPillBoxEarly
    ? parsePillFontSize(styles.fontSize?.toString())
    : parseFontSize(styles.fontSize?.toString());
  options.fontSize = fontSize;

  const faFreeFace = normalizeFontAwesomeFreeFamily(
    styles.fontFamily,
    styles.fontWeight?.toString()
  );
  options.fontFace =
    faFreeFace ??
    parseScriptFontFaces(styles.fontFamily, {
      platformFontContext,
      specifiedFontFamily: styles.fontFamilySpecified,
    }).latin;

  if (!faFreeFace && isBold(styles.fontWeight)) options.bold = true;

  if (isItalic(styles.fontStyle)) options.italic = true;
  if (hasUnderline(styles.textDecoration)) options.underline = true;
  if (hasStrikethrough(styles.textDecoration)) options.strike = true;

  const align = parseTextAlign(styles.textAlign);
  if (align) options.align = align;

  // Add letter spacing (character spacing in PowerPoint)
  // fontSizePx is the raw browser-reported size; viewport scaling is applied
  // downstream inside pxToPoints (called by parseLetterSpacing/parseLineHeight).
  const fontSizePx = parseFloat(String(styles.fontSize || '16')) || 16;
  const charSpacing = parseLetterSpacing(styles.letterSpacing, fontSizePx);
  if (charSpacing !== undefined) options.charSpacing = charSpacing;

  // Add line spacing (line height in PowerPoint)
  const lineHeightResult = parseLineHeight(styles.lineHeight, fontSizePx);
  if (lineHeightResult) {
    if (lineHeightResult.lineSpacing !== undefined) {
      options.lineSpacing = lineHeightResult.lineSpacing;
    }
    if (lineHeightResult.lineSpacingMultiple !== undefined) {
      options.lineSpacingMultiple = lineHeightResult.lineSpacingMultiple;
    }
  }

  // HTML/CSS default vertical alignment is top; set explicitly for PPTX
  options.valign = 'top';

  const display = styles.display;
  const isInlineBox = display === 'inline' || display === 'inline-block';
  const hasTextHighlight =
    isVisibleTextBackgroundColor(styles.backgroundColor) ||
    isVisibleTextBackgroundColor(styles.glyphHighlightColor);
  const isPillBox = isPillBoxEarly;

  // Parse padding and border, convert to margin for PowerPoint text box
  // PowerPoint margin = internal space between text and box edge (like CSS padding)
  // Include border width so text aligns with HTML content box (content starts after border+padding)
  const parseSide = (padding: string | undefined, borderWidth: string | undefined): number => {
    const padPx = parseFloat(String(padding || '0')) || 0;
    const borderPx = parseFloat(String(borderWidth || '0')) || 0;
    if (isPillBox) return parseBoxInsetPt(padPx, borderPx);
    const pad = parsePadding(padding);
    return pad + pxToPoints(borderPx);
  };
  const marginTop = parseSide(styles.paddingTop, styles.borderTopWidth);
  const marginRight = parseSide(styles.paddingRight, styles.borderRightWidth);
  const marginBottom = parseSide(styles.paddingBottom, styles.borderBottomWidth);
  const marginLeft = parseSide(styles.paddingLeft, styles.borderLeftWidth);

  // CSS 500 is medium; isBold treats >400 as bold and widens glyphs vs browser
  if (isPillBox && options.bold) {
    const fw = parseInt(String(styles.fontWeight ?? ''), 10);
    if (!isNaN(fw) && fw >= 500 && fw < 600) delete options.bold;
  }

  // Inline highlight padding is simulated with spaces in the converter; PPT run margin would
  // affect the whole text box, not just the highlighted phrase.
  // Pill badges (background + border-radius) use a separate roundRect fill — keep padding margin.
  if (!(isInlineBox && hasTextHighlight && !isPillBox)) {
    // Always set margin - when web has 0 padding/border, use [0,0,0,0] to override pptxgenjs default
    // pptxgenjs expects margin as [left, right, bottom, top] (maps to lIns, rIns, bIns, tIns)
    options.margin = [marginLeft, marginRight, marginBottom, marginTop];
  } else {
    options.margin = [0, 0, 0, 0];
  }

  const highlightFromGlyphField = styles.glyphHighlightColor
    ? parseTextHighlightColor(styles.glyphHighlightColor, styles.highlightBackdropColor)
    : undefined;
  const highlightFromBackground =
    !isPillBox
      ? parseTextHighlightColor(styles.backgroundColor, styles.highlightBackdropColor)
      : undefined;
  const highlight = highlightFromGlyphField ?? highlightFromBackground;
  if (highlight) options.highlight = highlight;

  return options;
}

/**
 * inline/inline-block badge with background + border-radius (e.g. .method-tag pill).
 * Not a phrase-level highlight span — use box padding margin, not a:highlight.
 */
export function isInlinePillBox(styles: ComputedStyles): boolean {
  const display = styles.display;
  if (display !== 'inline' && display !== 'inline-block') return false;
  if (!isVisibleTextBackgroundColor(styles.backgroundColor)) return false;
  const br = styles.borderRadius;
  return !!(br && br !== '0' && br !== '0px');
}

/** True when background-color is a visible fill (not transparent). */
export function isVisibleTextBackgroundColor(backgroundColor: string | undefined): boolean {
  if (!backgroundColor) return false;
  return (
    backgroundColor !== 'rgba(0, 0, 0, 0)' &&
    backgroundColor !== 'rgba(0,0,0,0)' &&
    backgroundColor !== 'transparent' &&
    backgroundColor !== 'none'
  );
}

/**
 * Blend rgba foreground onto an opaque background to get perceived solid color.
 */
function blendRgbaOnBackground(
  r: number,
  g: number,
  b: number,
  alpha: number,
  bgR: number,
  bgG: number,
  bgB: number
): string {
  const inv = 1 - alpha;
  const R = Math.round(r * alpha + bgR * inv);
  const G = Math.round(g * alpha + bgG * inv);
  const B = Math.round(b * alpha + bgB * inv);
  return [R, G, B].map((v) => v.toString(16).padStart(2, '0').toUpperCase()).join('');
}

/** Blend rgba color onto white background (legacy fill paths). */
function blendRgbaOnWhite(r: number, g: number, b: number, alpha: number): string {
  return blendRgbaOnBackground(r, g, b, alpha, 255, 255, 255);
}

function resolveBackdropRgb(backdropColor?: string): { r: number; g: number; b: number } {
  if (!backdropColor || !isVisibleTextBackgroundColor(backdropColor)) {
    return { r: 255, g: 255, b: 255 };
  }
  const parsed = parseColor(backdropColor);
  if (!parsed) return { r: 255, g: 255, b: 255 };
  let r = parseInt(parsed.color.slice(0, 2), 16);
  let g = parseInt(parsed.color.slice(2, 4), 16);
  let b = parseInt(parsed.color.slice(4, 6), 16);
  if (parsed.alpha !== undefined && parsed.alpha < 1) {
    const blended = blendRgbaOnBackground(r, g, b, parsed.alpha, 255, 255, 255);
    r = parseInt(blended.slice(0, 2), 16);
    g = parseInt(blended.slice(2, 4), 16);
    b = parseInt(blended.slice(4, 6), 16);
  }
  return { r, g, b };
}

/**
 * Map CSS inline/element background-color to pptxgenjs text highlight (OOXML a:highlight).
 * PPT highlight is opaque; semi-transparent CSS backgrounds are composited on the backdrop.
 */
export function parseTextHighlightColor(
  backgroundColor: string | undefined,
  backdropColor?: string
): string | undefined {
  if (!isVisibleTextBackgroundColor(backgroundColor)) return undefined;

  const parsed = parseColor(backgroundColor);
  if (!parsed) return undefined;

  if (parsed.alpha !== undefined && parsed.alpha < 1) {
    const r = parseInt(parsed.color.slice(0, 2), 16);
    const g = parseInt(parsed.color.slice(2, 4), 16);
    const b = parseInt(parsed.color.slice(4, 6), 16);
    const bg = resolveBackdropRgb(backdropColor);
    return blendRgbaOnBackground(r, g, b, parsed.alpha, bg.r, bg.g, bg.b);
  }

  return parsed.color;
}

/**
 * Approximate how many spaces emulate CSS margin-left on an inline run (proportional to font size).
 */
export function marginLeftPxToLeadingSpaces(marginLeftPx: number, fontSizePx: number): number {
  if (marginLeftPx <= 0) return 0;
  const pxPerSpace = Math.max(fontSizePx * 0.25, 1);
  return Math.max(1, Math.round(marginLeftPx / pxPerSpace));
}

/**
 * PPT a:highlight only covers glyphs — pad inline highlighted runs with spaces (same run options).
 */
export function expandRunTextForInlineHighlightPadding(text: string, styles: ComputedStyles): string {
  if (
    !text ||
    (!isVisibleTextBackgroundColor(styles.backgroundColor) &&
      !isVisibleTextBackgroundColor(styles.glyphHighlightColor))
  ) {
    return text;
  }
  const display = styles.display;
  if (display !== 'inline' && display !== 'inline-block') return text;

  const fontSizePx = parseFloat(String(styles.fontSize || '16')) || 16;
  const padL = parseFloat(String(styles.paddingLeft || '0')) || 0;
  const padR = parseFloat(String(styles.paddingRight || '0')) || 0;
  if (padL <= 0 && padR <= 0) return text;

  // ~0.25em per regular space; use non-breaking spaces so padding is not collapsed.
  const pxPerSpace = Math.max(fontSizePx * 0.25, 1);
  const left = padL > 0 ? '\u00A0'.repeat(Math.max(1, Math.round(padL / pxPerSpace))) : '';
  const right = padR > 0 ? '\u00A0'.repeat(Math.max(1, Math.round(padR / pxPerSpace))) : '';
  return left + text + right;
}

/**
 * Extract all color values from a linear-gradient string (rgb, rgba, oklch, oklab, hex)
 */
function extractGradientColors(backgroundImage: string): string[] {
  const rgb = backgroundImage.match(/rgba?\([^)]+\)/g) ?? [];
  const hsl = backgroundImage.match(/hsla?\([^)]+\)/g) ?? [];
  const oklch = backgroundImage.match(/oklch\([^)]+\)/g) ?? [];
  const oklab = backgroundImage.match(/oklab\([^)]+\)/g) ?? [];
  const hex = backgroundImage.match(/#[0-9A-Fa-f]{6}/g) ?? [];
  return [...rgb, ...hsl, ...oklch, ...oklab, ...hex];
}

function backgroundImageHasGradientToken(backgroundImage: string | undefined): boolean {
  if (!backgroundImage) return false;
  return (
    backgroundImage.includes('linear-gradient') ||
    backgroundImage.includes('repeating-linear-gradient') ||
    backgroundImage.includes('radial-gradient') ||
    backgroundImage.includes('repeating-radial-gradient') ||
    backgroundImage.includes('conic-gradient') ||
    backgroundImage.includes('repeating-conic-gradient')
  );
}

/**
 * Parse linear- or radial-gradient to approximate solid color before XML gradient enhancement.
 * Blends each stop onto white, then averages.
 */
function parseGradientSolidApproximation(backgroundImage: string | undefined): { color: string } | undefined {
  if (!backgroundImage) return undefined;
  if (!backgroundImageHasGradientToken(backgroundImage)) return undefined;

  const colorStops = extractGradientColors(backgroundImage);
  if (!colorStops.length) return undefined;

  let sumR = 0,
    sumG = 0,
    sumB = 0;
  let count = 0;
  for (const stop of colorStops) {
    const result = parseColor(stop);
    if (result) {
      count++;
      const r = parseInt(result.color.slice(0, 2), 16);
      const g = parseInt(result.color.slice(2, 4), 16);
      const b = parseInt(result.color.slice(4, 6), 16);
      const alpha = result.alpha ?? 1;
      const blended = blendRgbaOnWhite(r, g, b, alpha);
      sumR += parseInt(blended.slice(0, 2), 16);
      sumG += parseInt(blended.slice(2, 4), 16);
      sumB += parseInt(blended.slice(4, 6), 16);
    }
  }
  if (count === 0) return undefined;

  const r = Math.round(sumR / count).toString(16).padStart(2, '0').toUpperCase();
  const g = Math.round(sumG / count).toString(16).padStart(2, '0').toUpperCase();
  const b = Math.round(sumB / count).toString(16).padStart(2, '0').toUpperCase();

  return { color: `${r}${g}${b}` };
}

/**
 * Extract first url() from background-image (e.g. "linear-gradient(...), url('...')")
 * Returns the URL string or undefined if no url found
 */
export function parseBackgroundImageUrl(backgroundImage: string | undefined): string | undefined {
  if (!backgroundImage) return undefined;
  const match = backgroundImage.match(/url\s*\(\s*['"]?([^'")\s]+)['"]?\s*\)/);
  return match ? match[1].trim() : undefined;
}

/**
 * Check if gradient is mostly transparent (all stops alpha < 0.2)
 * Such gradients should use dark/transparent base, not white blend
 */
function isMostlyTransparentGradient(backgroundImage: string | undefined): boolean {
  if (!backgroundImage) return false;
  if (!backgroundImageHasGradientToken(backgroundImage)) {
    return false;
  }
  const rgbaMatches = backgroundImage.match(/rgba\s*\(\s*[\d.,\s]+\s*\)/g);
  if (!rgbaMatches?.length) return false;
  for (const m of rgbaMatches) {
    const alphaMatch = m.match(/,\s*([\d.]+)\s*\)/);
    const alpha = alphaMatch ? parseFloat(alphaMatch[1]) : 1;
    if (alpha >= 0.2) return false;
  }
  return true;
}

/**
 * True when every color stop in the gradient has alpha < 0.2 (e.g. oklch/.../0.05 pattern lines).
 * Used with background-color: in CSS the color layer sits under the image and shows through.
 */
function gradientStopsAreAllVeryTransparent(backgroundImage: string | undefined): boolean {
  if (!backgroundImage) return false;
  if (!backgroundImageHasGradientToken(backgroundImage)) {
    return false;
  }
  const colorStops = extractGradientColors(backgroundImage);
  if (!colorStops.length) return false;
  for (const stop of colorStops) {
    const parsed = parseColor(stop);
    if (!parsed) return false;
    const alpha = parsed.alpha ?? 1;
    if (alpha >= 0.2) return false;
  }
  return true;
}

/** Split gradient argument list on commas, respecting parentheses (rgb(), etc.). */
function splitGradientCommaParts(content: string): string[] {
  const parts: string[] = [];
  let currentPart = '';
  let parenDepth = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '(') parenDepth++;
    if (char === ')') parenDepth--;
    if (char === ',' && parenDepth === 0) {
      parts.push(currentPart.trim());
      currentPart = '';
    } else {
      currentPart += char;
    }
  }
  if (currentPart) parts.push(currentPart.trim());
  return parts;
}

function extractGradientInner(
  backgroundImage: string,
  prefix: 'linear-gradient(' | 'radial-gradient('
): string | undefined {
  const startIdx = backgroundImage.indexOf(prefix);
  if (startIdx === -1) return undefined;
  let openParens = 0;
  const contentStart = startIdx + prefix.length;
  let endIdx = contentStart;
  for (let i = contentStart; i < backgroundImage.length; i++) {
    if (backgroundImage[i] === '(') openParens++;
    if (backgroundImage[i] === ')') {
      if (openParens === 0) {
        endIdx = i;
        break;
      }
      openParens--;
    }
  }
  return backgroundImage.substring(contentStart, endIdx);
}

/** CSS background-position pair → radial center as % 0–100 (OOXML fillToRect). */
function parseBackgroundPositionPair(pos: string): { cx: number; cy: number } {
  const d = { cx: 50, cy: 50 };
  const p = pos.trim();
  if (!p) return d;
  const tokens = p.split(/\s+/).filter(Boolean);
  const kw: Record<string, number> = {
    left: 0,
    center: 50,
    right: 100,
    top: 0,
    bottom: 100,
  };
  const pct = (t: string): number | undefined =>
    t.endsWith('%') ? parseFloat(t) : undefined;

  if (tokens.length >= 2) {
    const x = pct(tokens[0]) ?? kw[tokens[0].toLowerCase()] ?? 50;
    const y = pct(tokens[1]) ?? kw[tokens[1].toLowerCase()] ?? 50;
    return { cx: x, cy: y };
  }
  if (tokens.length === 1) {
    const t = tokens[0];
    const n = pct(t);
    if (n !== undefined) return { cx: n, cy: 50 };
    const k = kw[t.toLowerCase()];
    if (k !== undefined) {
      if (['left', 'center', 'right'].includes(t.toLowerCase())) return { cx: k, cy: 50 };
      if (['top', 'bottom'].includes(t.toLowerCase())) return { cx: 50, cy: k };
    }
  }
  return d;
}

function parseRadialCenterFromPreamble(preamble: string): { cx: number; cy: number } {
  const d = { cx: 50, cy: 50 };
  const p = preamble.trim();
  if (!p) return d;
  const atMatch = p.match(/\bat\s+(.+)$/is);
  if (!atMatch) return d;
  return parseBackgroundPositionPair(atMatch[1].trim());
}

function normalizeGradientStops(
  parsedStops: { color: string; position?: number; alpha?: number }[]
): GradientStop[] {
  type Draft = { color: string; position: number; alpha?: number; sourceOrder: number };
  const drafts: Draft[] = parsedStops.map((stop, index) => {
    let position: number;
    if (stop.position !== undefined) {
      position = stop.position;
    } else if (index === 0) {
      position = 0;
    } else if (index === parsedStops.length - 1) {
      position = 100;
    } else {
      const step = 100 / (parsedStops.length - 1);
      position = step * index;
    }
    return { color: stop.color, position, alpha: stop.alpha, sourceOrder: index };
  });
  drafts.sort((a, b) => (a.position !== b.position ? a.position - b.position : a.sourceOrder - b.sourceOrder));
  const stops: GradientStop[] = drafts.map(({ color, position, alpha }) => ({ color, position, alpha }));
  const last = stops[stops.length - 1];
  // CSS extends the last color to the edge; OOXML needs an explicit 100% stop
  if (last.position < 99.999) {
    stops.push({ color: last.color, position: 100, alpha: last.alpha });
  }
  return stops;
}

function parseRadialGradientInner(content: string): GradientData | undefined {
  const parts = splitGradientCommaParts(content);
  if (parts.length < 2) return undefined;

  let preamble: string;
  let stopParts: string[];
  const firstStop = parseGradientStop(parts[0]);
  if (!firstStop) {
    preamble = parts[0];
    stopParts = parts.slice(1);
  } else {
    preamble = '';
    stopParts = parts;
  }

  const { cx, cy } = parseRadialCenterFromPreamble(preamble);

  const parsedStops: { color: string; position?: number; alpha?: number }[] = [];
  for (const sp of stopParts) {
    const stop = parseGradientStop(sp);
    if (stop) parsedStops.push(stop);
  }
  if (parsedStops.length < 2) return undefined;

  const stops = normalizeGradientStops(parsedStops);

  return {
    type: 'radial',
    radialCenterX: cx,
    radialCenterY: cy,
    stops,
  };
}

function parseLinearGradientInner(content: string): GradientData | undefined {
  const parts = splitGradientCommaParts(content);

  let angle = 180;
  let colorStartIndex = 0;

  if (parts[0].includes('deg')) {
    const parsedAngle = parseFloat(parts[0]);
    angle = isNaN(parsedAngle) ? 180 : parsedAngle;
    colorStartIndex = 1;
  } else if (parts[0].startsWith('to ')) {
    angle = convertDirectionToAngle(parts[0].substring(3).trim());
    colorStartIndex = 1;
  }

  const parsedStops: { color: string; position?: number; alpha?: number }[] = [];
  for (let i = colorStartIndex; i < parts.length; i++) {
    const stop = parseGradientStop(parts[i]);
    if (stop) parsedStops.push(stop);
  }

  if (parsedStops.length < 2) return undefined;

  const stops = normalizeGradientStops(parsedStops);

  return { type: 'linear', angle, stops };
}

/**
 * Parse complete gradient information (new function for style enhancement)
 * Returns full gradient data with angle, color stops, etc.
 */
export function parseGradientFull(backgroundImage: string | undefined): GradientData | undefined {
  if (!backgroundImage) return undefined;

  const linIdx = backgroundImage.indexOf('linear-gradient(');
  const radIdx = backgroundImage.indexOf('radial-gradient(');

  if (radIdx >= 0 && (linIdx < 0 || radIdx < linIdx)) {
    const inner = extractGradientInner(backgroundImage, 'radial-gradient(');
    if (inner !== undefined) {
      const radial = parseRadialGradientInner(inner);
      if (radial) return radial;
    }
  }

  if (linIdx >= 0) {
    const inner = extractGradientInner(backgroundImage, 'linear-gradient(');
    if (inner === undefined) return undefined;
    return parseLinearGradientInner(inner);
  }

  return undefined;
}

/**
 * Convert CSS gradient direction keyword to angle (CSS: 0°=up, 90°=right, 180°=down)
 * Browsers may return "to X" or "to X Y" - normalize before lookup
 */
function convertDirectionToAngle(direction: string): number {
  const normalized = direction.trim().toLowerCase().replace(/\s+/g, ' ');
  const map: Record<string, number> = {
    'top': 0, 'right': 90, 'bottom': 180, 'left': 270,
    'top right': 45, 'right top': 45,
    'bottom right': 135, 'right bottom': 135,
    'bottom left': 225, 'left bottom': 225,
    'top left': 315, 'left top': 315,
  };
  return map[normalized] ?? 180;
}

/**
 * Parse a gradient color stop
 * Format: "rgba(255, 0, 0, 0.5) 25%" or "oklch(0.5 0.2 180) 50%" or "#FF0000 75%"
 */
function parseGradientStop(stopStr: string): { color: string; position?: number; alpha?: number } | undefined {
  // Extract color: rgba/rgb, oklch, oklab, or #hex
  const rgbaMatch = stopStr.match(/rgba?\([^)]+\)/);
  const oklchMatch = stopStr.match(/oklch\([^)]+\)/);
  const oklabMatch = stopStr.match(/oklab\([^)]+\)/);
  const hexMatch = stopStr.match(/#[0-9A-Fa-f]{6}/);

  let color: string | undefined;
  let alpha: number | undefined;

  // CSS keyword (computed styles may still say "transparent" in authored gradients)
  if (/^\s*transparent\b/i.test(stopStr.trim())) {
    color = '000000';
    alpha = 0;
  }

  const colorStr = rgbaMatch?.[0] ?? oklchMatch?.[0] ?? oklabMatch?.[0];
  if (colorStr) {
    const parsed = parseColor(colorStr);
    if (parsed) {
      color = parsed.color;
      alpha = parsed.alpha;
    } else if (rgbaMatch) {
      // parseColor returns undefined for alpha=0, but gradients need transparent stops
      const rgbaComma = rgbaMatch[0].match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\)/);
      if (rgbaComma) {
        const r = parseInt(rgbaComma[1]).toString(16).padStart(2, '0').toUpperCase();
        const g = parseInt(rgbaComma[2]).toString(16).padStart(2, '0').toUpperCase();
        const b = parseInt(rgbaComma[3]).toString(16).padStart(2, '0').toUpperCase();
        color = `${r}${g}${b}`;
        alpha = rgbaComma[4] !== undefined ? parseFloat(rgbaComma[4]) : 1;
      } else {
        // Space-separated: rgb(0 0 0 / 0) — parseColor drops alpha=0
        const rgbaSpace = rgbaMatch[0].match(
          /^rgba?\(\s*(\d+)\s+(\d+)\s+(\d+)(?:\s*\/\s*([\d.]+))?\s*\)$/i
        );
        if (rgbaSpace) {
          const r = parseInt(rgbaSpace[1], 10).toString(16).padStart(2, '0').toUpperCase();
          const g = parseInt(rgbaSpace[2], 10).toString(16).padStart(2, '0').toUpperCase();
          const b = parseInt(rgbaSpace[3], 10).toString(16).padStart(2, '0').toUpperCase();
          color = `${r}${g}${b}`;
          alpha = rgbaSpace[4] !== undefined ? parseFloat(rgbaSpace[4]) : 1;
        }
      }
    }
  } else if (hexMatch) {
    color = hexMatch[0].substring(1).toUpperCase();
  }

  if (!color) return undefined;

  // Extract position percentage (leave undefined if not specified)
  const percentMatch = stopStr.match(/(\d+(?:\.\d+)?)%/);
  const position = percentMatch ? parseFloat(percentMatch[1]) : undefined;

  return { color, position, alpha };
}

/**
 * Get shape fill options for pptxgenjs
 */
export function getFillOptions(styles: ComputedStyles): any {
  const options: any = {};

  const backgroundClip = styles.backgroundClip ?? styles.webkitBackgroundClip;
  if (backgroundClip === 'text') {
    return options;
  }

  const bgColorResult = parseColor(styles.backgroundColor);

  // Prefer backgroundImage (linear- / radial-gradient) over backgroundColor for *opaque* fills.
  // When the gradient is only a faint overlay, CSS still shows background-color underneath; do not
  // assume a white/dark page backdrop (that made white slides erase navy + white text).
  const gradientResult = parseGradientSolidApproximation(styles.backgroundImage);
  if (gradientResult) {
    const overlayOnSolidBg =
      !!bgColorResult &&
      (isMostlyTransparentGradient(styles.backgroundImage) ||
        gradientStopsAreAllVeryTransparent(styles.backgroundImage));

    if (overlayOnSolidBg) {
      options.fill = { color: bgColorResult.color };
      if (bgColorResult.alpha !== undefined) {
        options.fill.transparency = Math.round((1 - bgColorResult.alpha) * 100);
      } else {
        const transparency = parseTransparency(styles.opacity);
        if (transparency > 0) {
          options.fill.transparency = transparency;
        }
      }
      return options;
    }

    // Averaged gradient looks much lighter than declared background-color (grid/texture + solid base,
    // or hsl()/rgb() stops we blended on white). Prefer the solid color from the stylesheet.
    if (bgColorResult) {
      const lumB = hexLuminance(bgColorResult.color);
      const lumG = hexLuminance(gradientResult.color);
      if (lumB < 0.52 && lumG - lumB > 0.22) {
        options.fill = { color: bgColorResult.color };
        if (bgColorResult.alpha !== undefined) {
          options.fill.transparency = Math.round((1 - bgColorResult.alpha) * 100);
        } else {
          const transparency = parseTransparency(styles.opacity);
          if (transparency > 0) {
            options.fill.transparency = transparency;
          }
        }
        return options;
      }
    }

    // Faint overlay gradients without a usable background-color: keep legacy behavior (oklch stops
    // do not match isMostlyTransparentGradient's rgba-only heuristic).
    if (
      isMostlyTransparentGradient(styles.backgroundImage) ||
      (gradientStopsAreAllVeryTransparent(styles.backgroundImage) && !bgColorResult)
    ) {
      options.fill = { color: '000000', transparency: 95 };
    } else {
      options.fill = { color: gradientResult.color };
    }
    const transparency = parseTransparency(styles.opacity);
    if (transparency > 0) {
      options.fill.transparency = transparency;
    }
    return options;
  }
  if (bgColorResult) {
    options.fill = { color: bgColorResult.color };

    // Use alpha from rgba() if present, otherwise use opacity style
    // pptxgenjs expects transparency INSIDE fill object for createColorElement to add a:alpha
    if (bgColorResult.alpha !== undefined) {
      // Convert alpha (0-1) to transparency percentage (0-100): 0=opaque, 100=fully transparent
      options.fill.transparency = Math.round((1 - bgColorResult.alpha) * 100);
    } else {
      const transparency = parseTransparency(styles.opacity);
      if (transparency > 0) {
        options.fill.transparency = transparency;
      }
    }
  }

  return options;
}

/**
 * CSS used value for a uniform corner radius: min(specified, width/2, height/2).
 * Needed when authors use huge px (e.g. Tailwind `rounded-full` → 9999px); without
 * clamping, downstream logic can mis-classify a pill bar as an ellipse.
 */
function clampCornerRadiusPx(
  rPx: number,
  widthPx?: number,
  heightPx?: number
): number {
  if (
    rPx <= 0 ||
    widthPx === undefined ||
    heightPx === undefined ||
    !Number.isFinite(widthPx) ||
    !Number.isFinite(heightPx) ||
    widthPx <= 0 ||
    heightPx <= 0
  ) {
    return rPx;
  }
  return Math.min(rPx, widthPx / 2, heightPx / 2);
}

/**
 * Parse border radius from CSS to inches
 */
export function parseBorderRadius(
  borderRadius: string | undefined,
  widthPx?: number,
  heightPx?: number
): number | undefined {
  if (!borderRadius) return undefined;
  const trimmed = borderRadius.trim();
  if (!trimmed || trimmed === '0' || trimmed === '0px' || trimmed === '0%') return undefined;

  const firstToken = trimmed.split('/')[0]?.trim().split(/\s+/)[0];
  if (!firstToken) return undefined;

  const minDimensionPx =
    typeof widthPx === 'number' && typeof heightPx === 'number'
      ? Math.min(widthPx, heightPx)
      : undefined;

  if (firstToken.endsWith('%')) {
    if (minDimensionPx === undefined) return undefined;
    const percent = parseFloat(firstToken);
    if (isNaN(percent) || percent <= 0) return undefined;
    const rawPx = (percent / 100) * minDimensionPx;
    return pxToInch(clampCornerRadiusPx(rawPx, widthPx, heightPx));
  }

  const px = parseFloat(firstToken);
  if (isNaN(px) || px <= 0) return undefined;

  return pxToInch(clampCornerRadiusPx(px, widthPx, heightPx));
}

/**
 * Parse individual corner radii from CSS border-radius
 * Returns [topLeft, topRight, bottomRight, bottomLeft] in inches
 * CSS border-radius format:
 * - 1 value: all corners
 * - 2 values: [top-left & bottom-right, top-right & bottom-left]
 * - 3 values: [top-left, top-right & bottom-left, bottom-right]
 * - 4 values: [top-left, top-right, bottom-right, bottom-left]
 */
export function parseCornerRadii(
  borderRadius: string | undefined,
  widthPx?: number,
  heightPx?: number
): [number, number, number, number] {
  if (!borderRadius) {
    return [0, 0, 0, 0];
  }
  const trimmed = borderRadius.trim();
  if (!trimmed || trimmed === '0' || trimmed === '0px' || trimmed === '0%') {
    return [0, 0, 0, 0];
  }

  const [horizontalPart, verticalPart] = trimmed.split('/');
  const horizontalValues = expandRadiusValues(parseRadiusList(horizontalPart, widthPx));
  const verticalValues = expandRadiusValues(parseRadiusList(verticalPart ?? horizontalPart, heightPx));

  const cornerPx = (i: number) =>
    clampCornerRadiusPx(
      Math.min(horizontalValues[i], verticalValues[i]),
      widthPx,
      heightPx
    );

  return [
    pxToInch(cornerPx(0)),
    pxToInch(cornerPx(1)),
    pxToInch(cornerPx(2)),
    pxToInch(cornerPx(3)),
  ];
}

function parseRadiusList(part: string | undefined, referencePx?: number): number[] {
  if (!part) return [0];
  const tokens = part.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [0];
  return tokens.map((token) => {
    const value = token.trim();
    if (value.endsWith('%')) {
      if (referencePx === undefined) return 0;
      const percent = parseFloat(value);
      if (isNaN(percent) || percent <= 0) return 0;
      return (percent / 100) * referencePx;
    }
    const px = parseFloat(value);
    return isNaN(px) || px <= 0 ? 0 : px;
  });
}

function expandRadiusValues(values: number[]): [number, number, number, number] {
  if (values.length === 0) return [0, 0, 0, 0];
  if (values.length === 1) return [values[0], values[0], values[0], values[0]];
  if (values.length === 2) return [values[0], values[1], values[0], values[1]];
  if (values.length === 3) return [values[0], values[1], values[2], values[1]];
  return [values[0], values[1], values[2], values[3]];
}

/**
 * Get border/line options for pptxgenjs
 * Handles rgba alpha → PowerPoint transparency (0 = opaque, 100 = full transparent)
 */
export function getLineOptions(styles: ComputedStyles): any {
  const borderWidth = parseBorderWidth(styles.borderWidth?.toString());
  if (borderWidth === 0) return undefined;

  const borderColorResult = parseColor(styles.borderColor);
  if (!borderColorResult) return undefined;

  const dashType = parseBorderStyleToDashType(styles.borderStyle);
  const lineOptions: { color: string; width: number; dashType?: string; transparency?: number } = {
    color: borderColorResult.color || '000000',
    width: borderWidth,
    dashType: dashType !== 'solid' ? dashType : undefined,
  };
  if (borderColorResult.alpha !== undefined && borderColorResult.alpha < 1) {
    lineOptions.transparency = Math.round((1 - borderColorResult.alpha) * 100);
  }
  return lineOptions;
}

/**
 * Get table cell border options for pptxgenjs
 * Returns border: [top, right, bottom, left] - each side is {pt, color, transparency?} or null
 * pptxgenjs uses pt for border thickness; 1px CSS ≈ 0.75pt
 * Handles rgba alpha → PowerPoint transparency
 */
export function getTableCellBorderOptions(styles: any): any[] | undefined {
  const parseSide = (width: string | undefined, color: string | undefined) => {
    const px = parseFloat(String(width || '0')) || 0;
    if (px <= 0) return null;
    const colorResult = parseColor(color);
    if (!colorResult) return null;
    const pt = Math.max(0.5, px * 0.75);
    const side: { pt: number; color: string; transparency?: number } = {
      pt,
      color: colorResult.color,
    };
    if (colorResult.alpha !== undefined && colorResult.alpha < 1) {
      side.transparency = Math.round((1 - colorResult.alpha) * 100);
    }
    return side;
  };

  const top = parseSide(styles.borderTopWidth, styles.borderTopColor);
  const right = parseSide(styles.borderRightWidth, styles.borderRightColor);
  const bottom = parseSide(styles.borderBottomWidth, styles.borderBottomColor);
  const left = parseSide(styles.borderLeftWidth, styles.borderLeftColor);

  if (!top && !right && !bottom && !left) return undefined;

  return [top, right, bottom, left];
}
