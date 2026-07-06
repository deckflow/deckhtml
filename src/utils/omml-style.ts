/**
 * Apply presentation hints (color, size) to OMML produced by mathml2omml.
 *
 * PowerPoint is strict: use only valid children inside m:rPr (w:color, m:sz).
 * Do NOT insert DrawingML a:solidFill or a sibling w:rPr block — both can trigger repair.
 */

import { ElementInfo } from '../types';
import { parseColor } from './style';

export interface MathPresentationMeta {
  colorHex?: string;
  szHalfPt?: number;
  mathJc: 'left' | 'center' | 'right';
}

/**
 * Scale CSS font-size (from `<math>`) to a PowerPoint-friendly size.
 *
 * Empirical: MathJax/KaTeX formulas rendered in HTML often look larger than PowerPoint's
 * Office Math at the same nominal point size. Example `example-math/preview1-2.html`:
 * CSS ~18px (13.5pt) looks closer to `a:rPr sz=1000` (10pt) → factor ≈ 0.74.
 */
export const PPT_MATH_A_RPR_SZ_FACTOR = 0.77;

/** True when CSS text color is light (e.g. #f8fafc on dark slides). */
export function isLightTextColor(styles: { color?: string }): boolean {
  const c = parseColor(styles.color);
  if (!c?.color || c.color.length < 6) return false;
  const r = parseInt(c.color.slice(0, 2), 16);
  const g = parseInt(c.color.slice(2, 4), 16);
  const b = parseInt(c.color.slice(4, 6), 16);
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum > 0.72;
}

/**
 * Derive OMML color/size/alignment from the inspected <math> element.
 */
export function getMathPresentationMeta(element: ElementInfo): MathPresentationMeta {
  const colorRes = parseColor(element.styles.color);
  const fontSizePx = Math.max(
    1,
    parseFloat(String(element.styles.fontSize ?? '')) || 16
  );
  const cssPt = (fontSizePx * 72) / 96;
  // Use the <math> element's own computed font-size as the source of truth.
  // OOXML a:rPr@sz expects 1/100 pt; we pass half-points downstream and convert later.
  const szHalfPt = Math.max(2, Math.round(cssPt * 2 * PPT_MATH_A_RPR_SZ_FACTOR));

  const align = element.styles.textAlign;
  // Office Math behaves like "center" by default (when m:jc is omitted).
  // In browsers, computed `text-align` often resolves to `left/start` even when authors
  // did not explicitly set it. Treat `left/start` as "unspecified" here.
  let mathJc: 'left' | 'center' | 'right' = 'center';
  if (align === 'right' || align === 'end') mathJc = 'right';
  else if (align === 'center') mathJc = 'center';
  else mathJc = 'center';

  return {
    colorHex: colorRes?.color,
    szHalfPt,
    mathJc,
  };
}

/**
 * Prepare OMML from mathml2omml for PowerPoint.
 * - Strip WordprocessingML `w:*` (e.g. `<w:rPr/>`) — slide has no xmlns:w → corrupt XML.
 * - Strip redundant xmlns on `<m:oMath>` (declared on `m:oMathPara` wrapper).
 * - Unwrap outer `<m:oMathPara>` if converter already wrapped (avoid double wrap).
 */
const OMML_TEXT_CONTAINER = /<(m:e|m:num|m:den|m:sub|m:sup|m:lim|m:limLow|m:limUpp)>([\s\S]*?)<\/\1>/g;

function hasBareTextOutsideMt(inner: string): boolean {
  const withoutMt = inner.replace(/<m:t\b[^>]*>[\s\S]*?<\/m:t>/g, '');
  return withoutMt.replace(/<[^>]+>/g, '').trim().length > 0;
}

/** Wrap only top-level stray text in OMML containers (do not touch text inside m:t). */
function wrapTopLevelBareOmmlText(inner: string): string {
  const parts = inner.split(/(<[^>]+>)/);
  let depth = 0;
  let result = '';
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('<')) {
      const selfClose = /\/>\s*$/.test(part);
      const closing = /^<\//.test(part);
      if (closing) depth = Math.max(0, depth - 1);
      result += part;
      if (!selfClose && !closing) depth++;
    } else if (depth === 0 && part.trim()) {
      const escaped = part
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      result += `<m:r><m:t xml:space="preserve">${escaped}</m:t></m:r>`;
    } else {
      result += part;
    }
  }
  return result;
}

/** Wrap stray character data inside OMML containers in m:r/m:t (PowerPoint rejects bare text). */
function wrapBareOmmlTextInMathContainers(omml: string): string {
  return omml.replace(OMML_TEXT_CONTAINER, (_match, tag: string, inner: string) => {
    if (!hasBareTextOutsideMt(inner)) return `<${tag}>${inner}</${tag}>`;
    const wrapped = wrapTopLevelBareOmmlText(inner);
    return `<${tag}>${wrapped}</${tag}>`;
  });
}

export function sanitizeOmmlForPptx(omml: string): string {
  let result = omml.trim();
  result = result.replace(/<w:rPr\b[^>]*\/>/g, '');
  result = result.replace(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/g, '');
  result = result.replace(/<w:[a-zA-Z]+[^>]*\/>/g, '');
  result = result.replace(/<w:[a-zA-Z]+[^>]*>[\s\S]*?<\/w:[a-zA-Z]+>/g, '');
  result = result.replace(/<m:sty\b[^>]*m:val="undefined"[^>]*\/?>/g, '');
  result = result.replace(/<m:rPr>\s*<m:nor\s*\/>\s*<\/m:rPr>/g, '');
  // Mathematical Italic Nabla (U+1D6FB) → Nabla operator (U+2207)
  result = result.replace(/\u{1D6FB}/gu, '\u2207');
  // KaTeX `<mi mathvariant="normal">∇</mi>`: force upright nabla in PPT (not italic 𝛻 glyph)
  result = result.replace(
    /<m:r>\s*(?:<m:rPr>[\s\S]*?<\/m:rPr>\s*)?<m:t(\b[^>]*)>([^<]*∇[^<]*)<\/m:t>\s*<\/m:r>/g,
    (_match, tAttrs: string, text: string) =>
      `<m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t${tAttrs}>${text}</m:t></m:r>`
  );
  // mathml2omml may emit empty nary integrand; PPT rejects <m:e/>
  result = result.replace(
    /<m:e\s*\/>(?=\s*<\/m:nary>)/g,
    '<m:e><m:r><m:t xml:space="preserve"> </m:t></m:r></m:e>'
  );
  // KaTeX mhchem reaction arrows → <m:limUpp>…<m:lim/>; empty lim breaks PPT
  result = result.replace(
    /<m:lim\s*\/>/g,
    '<m:lim><m:r><m:t xml:space="preserve"> </m:t></m:r></m:lim>'
  );
  // mathml2omml may leave summand text (e.g. p(x)) outside <m:t> — invalid in PPT
  result = wrapBareOmmlTextInMathContainers(result);
  // Repair: sometimes OMML is (incorrectly) serialized into text as `&lt;m:r&gt;&lt;m:t...&gt;...`
  // but the closing `</m:t></m:r>` is real markup. That both corrupts XML *and* shows OOXML
  // source in PowerPoint. Collapse those serialized runs back to plain text.
  result = result.replace(
    /&lt;m:r&gt;&lt;m:t\b[^&]*?&gt;([\s\S]*?)<\/m:t>\s*<\/m:r>/gi,
    '$1'
  );
  // Some pipelines accidentally serialize OMML fragments into text by escaping only the
  // opening tags (`&lt;m:r&gt;...`) but leaving closing tags as real markup (`</m:t></m:r>`),
  // which corrupts the XML tree (m:t closes early, following tags mismatch).
  //
  // If we see an escaped OMML opener, force the corresponding closers to be escaped too.
  result = result.replace(
    /(&lt;m:r&gt;&lt;m:t\b[^&]*?&gt;[\s\S]*?)<\/m:t>\s*<\/m:r>/gi,
    '$1&lt;/m:t&gt;&lt;/m:r&gt;'
  );
  // Hidden upper limit / sqrt degree still need a child element
  result = result.replace(
    /<m:sup\s*\/>/g,
    '<m:sup><m:r><m:t xml:space="preserve"> </m:t></m:r></m:sup>'
  );
  result = result.replace(
    /<m:deg\s*\/>/g,
    '<m:deg><m:r><m:t xml:space="preserve"> </m:t></m:r></m:deg>'
  );

  if (/^<m:oMathPara\b/i.test(result)) {
    result = result
      .replace(/^<m:oMathPara\b[^>]*>/i, '')
      .replace(/<\/m:oMathPara>\s*$/i, '')
      .trim();
  }

  // PowerPoint (and XML parsers) require `<` and bare `&` in `<m:t>` text to be escaped.
  // Keep this narrowly scoped: only escape plain text runs (no embedded serialized OMML).
  result = result.replace(/<m:t\b([^>]*)>([\s\S]*?)<\/m:t>/gi, (_m, attrs: string, text: string) => {
    // If `<m:t>` contains serialized OMML tags, it's not meant to show up in PPT.
    // Strip the serialized tags but keep the actual characters (e.g. `⋮` in matrices).
    let t = text;
    if (/&lt;\s*\/?\s*m:/i.test(t)) {
      t = t.replace(/&lt;\s*\/?\s*m:[^&]*?&gt;/gi, '');
      return `<m:t${attrs}>${t}</m:t>`;
    }
    // First, escape bare ampersands (do not double-escape existing entities).
    t = t.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
    // Then escape angle brackets defensively.
    t = t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<m:t${attrs}>${t}</m:t>`;
  });

  return result.replace(/<m:oMath(\s[^>]*)>/i, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\s+xmlns:m="[^"]*"/gi, '')
      .replace(/\s+xmlns:w="[^"]*"/gi, '');
    return `<m:oMath${cleaned}>`;
  });
}

/** Remove WordprocessingML tags when slide root has no xmlns:w (post-equation safety net). */
export function stripUndeclaredWordMlFromSlide(slideXml: string): string {
  if (/xmlns:w=/.test(slideXml)) return slideXml;
  if (!/<w:[a-zA-Z]/.test(slideXml)) return slideXml;
  let xml = slideXml;
  xml = xml.replace(/<w:rPr\b[^>]*\/>/g, '');
  xml = xml.replace(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/g, '');
  xml = xml.replace(/<w:[a-zA-Z]+[^>]*\/>/g, '');
  xml = xml.replace(/<w:[a-zA-Z]+[^>]*>[\s\S]*?<\/w:[a-zA-Z]+>/g, '');
  return xml;
}
