import { StyleEnhancement } from '../types';
import { sanitizeOmmlForPptx } from '../utils/omml-style';

const MATH_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/math';
const A14_NS = 'http://schemas.microsoft.com/office/drawing/2010/main';
const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
const SHAPE_PATTERN = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;

function escapeXmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Plain text from OMML m:t runs (compact, no duplicates). */
function plainTextFromOmml(omml: string): string {
  return [...omml.matchAll(/<m:t[^>]*>([^<]*)</g)]
    .map((m) => m[1])
    .join('');
}

/**
 * KaTeX MathML textContent often concatenates compact + TeX forms; pick one clean string.
 */
function pickMathFallbackText(meta: string | undefined, omml: string): string {
  const fromOmml = plainTextFromOmml(omml);
  const metaT = meta?.replace(/\s+/g, ' ').trim();
  if (!metaT) return fromOmml || '\u200B';
  if (!fromOmml) return metaT;
  if (metaT.startsWith(fromOmml)) {
    const tail = metaT.slice(fromOmml.length).trim();
    if (tail) return tail;
  }
  if (metaT.length <= fromOmml.length * 1.2) return metaT;
  return fromOmml;
}

/**
 * Ensure slide root declares math and a14 namespaces.
 */
function ensureSlideNamespaces(slideXml: string): string {
  const slideOpen = slideXml.match(/<p:sld\b[^>]*>/);
  if (!slideOpen) return slideXml;
  let attrs = slideOpen[0];
  if (!/xmlns:m=/.test(attrs)) {
    attrs = attrs.replace(/>$/, ` xmlns:m="${MATH_NS}">`);
  }
  if (!/xmlns:a14=/.test(attrs)) {
    attrs = attrs.replace(/>$/, ` xmlns:a14="${A14_NS}">`);
  }
  if (!/xmlns:mc=/.test(attrs)) {
    attrs = attrs.replace(/>$/, ` xmlns:mc="${MC_NS}">`);
  }
  if (!/\bmc:Ignorable="/.test(attrs)) {
    attrs = attrs.replace(/>$/, ` mc:Ignorable="a14">`);
  } else if (!/\bmc:Ignorable="[^"]*\ba14\b/.test(attrs)) {
    attrs = attrs.replace(/\bmc:Ignorable="([^"]*)"/, (_m, v) => `mc:Ignorable="${v} a14"`);
  }
  if (attrs === slideOpen[0]) return slideXml;
  return slideXml.replace(slideOpen[0], attrs);
}

/**
 * Wrap OMML (`<m:oMath>…</m:oMath>`) for PowerPoint text body (a14:m extension).
 * mc:Choice + mc:Fallback; sanitized OMML only (no m:sz — PPT flags it as corrupt).
 */
function buildEquationParagraphXml(
  ommlXml: string,
  displayMode: 'block' | 'inline',
  mathJc: 'left' | 'center' | 'right',
  fallbackText: string,
  colorHex?: string,
  szHalfPt?: number
): string {
  let omml = sanitizeOmmlForPptx(ommlXml.trim());

  // Apply font-size from inspected <math> onto OMML text runs using DrawingML run props.
  // OOXML: a:rPr @sz is in 1/100 pt (e.g. 10pt → 1000). We receive half-points (pt * 2).
  if (szHalfPt && Number.isFinite(szHalfPt) && szHalfPt > 0) {
    const sz100Pt = Math.max(1, Math.round(szHalfPt * 50));
    // 1) Replace existing a:rPr@sz (if present) to avoid duplicates.
    omml = omml.replace(
      /<a:rPr\b([^>]*)\bsz="[^"]*"/gi,
      (_m, attrs: string) => `<a:rPr${attrs}sz="${sz100Pt}"`
    );
    // 2) Ensure each <m:r> has an <a:rPr sz="..."/> right before <m:t>.
    // Keep any existing <m:rPr> intact; insert a:rPr after it.
    omml = omml.replace(
      /<m:r\b([^>]*)>(\s*)(<m:rPr>[\s\S]*?<\/m:rPr>\s*)?(?:<a:rPr\b[^>]*\/>\s*)?<m:t\b/gi,
      (_m, rAttrs: string, ws: string, mRpr: string | undefined) =>
        `<m:r${rAttrs}>${ws}${mRpr ?? ''}<a:rPr sz="${sz100Pt}"/><m:t`
    );
  }

  // Repair: some OMML is embedded as serialized text fragments like:
  // `&lt;m:r&gt;&lt;m:t...&gt;⋮</m:t></m:r>` (open tags escaped, closers real).
  // This both corrupts XML (PPT repair prompt) and/or renders OOXML as visible text.
  //
  // Step 1: force those accidental real closers to be escaped so XML stays well-formed.
  omml = omml.replace(
    /(&lt;m:r&gt;&lt;m:t\b[^&]*?&gt;[\s\S]*?)<\/m:t>\s*<\/m:r>/gi,
    '$1&lt;/m:t&gt;&lt;/m:r&gt;'
  );
  // Step 2: collapse fully-serialized runs back to plain text (keep the actual characters).
  omml = omml.replace(
    /&lt;m:r&gt;&lt;m:t\b[^&]*?&gt;([\s\S]*?)&lt;\/m:t&gt;&lt;\/m:r&gt;/gi,
    '$1'
  );
  // Some broken fragments leave redundant closers after collapsing (e.g. `</m:r></m:t></m:r>`).
  // Remove those unmatched closers so OMML stays well-formed.
  omml = omml.replace(/<\/m:r>\s*<\/m:t>\s*<\/m:r>/gi, '</m:r>');

  // Final guardrail: `<m:t>` must be pure text. If any converter leaked OMML tags into `<m:t>`
  // (e.g. `<m:t>⋮<m:r>...</m:r></m:t>`), strip those tags but keep their text content so
  // PowerPoint doesn't display raw OOXML.
  omml = omml.replace(/<m:t\b([^>]*)>([\s\S]*?)<\/m:t>/gi, (_full, attrs: string, inner: string) => {
    // Pull text from any nested m:r/m:t blocks first.
    let t = inner.replace(
      /<m:r\b[^>]*>[\s\S]*?<m:t\b[^>]*>([\s\S]*?)<\/m:t>[\s\S]*?<\/m:r>/gi,
      '$1'
    );
    // Drop any remaining tags defensively.
    t = t.replace(/<[^>]+>/g, '');
    // Escape bare ampersands and angle brackets for XML safety.
    t = t.replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g, '&amp;');
    t = t.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<m:t${attrs}>${t}</m:t>`;
  });
  // PowerPoint reliably respects horizontal alignment when it's set on m:oMathParaPr/m:jc.
  // Always wrap in m:oMathPara so alignment works for both inline and block equations.
  const inner = `<m:oMathPara xmlns:m="${MATH_NS}"><m:oMathParaPr><m:jc m:val="${mathJc}"/></m:oMathParaPr>${omml}</m:oMathPara>`;
  const fallback = escapeXmlText(fallbackText.trim() || '\u200B');
  const pPr =
    colorHex && /^[0-9A-Fa-f]{6}$/.test(colorHex)
      ? `<a:pPr><a:defRPr><a:solidFill><a:srgbClr val="${colorHex.toUpperCase()}"/></a:solidFill></a:defRPr></a:pPr>`
      : '';
  return (
    `<a:p>` +
    pPr +
    `<mc:AlternateContent>` +
    `<mc:Choice Requires="a14">` +
    `<a14:m>${inner}</a14:m>` +
    `</mc:Choice>` +
    `<mc:Fallback><a:r><a:rPr lang="en-US"/><a:t>${fallback}</a:t></a:r></mc:Fallback>` +
    `</mc:AlternateContent>` +
    `</a:p>`
  );
}

/**
 * Replace text body content with native Office equation markup.
 */
export function applyEquationToXml(slideXml: string, enhancement: StyleEnhancement): string {
  const {
    elementIndex,
    ommlXml,
    mathDisplayMode = 'inline',
    // Office Math defaults to centered equations when no alignment is specified.
    mathJc = 'center',
    mathFallbackText = '\u200B',
    mathColorHex,
    mathSzHalfPt,
  } = enhancement;
  if (!ommlXml) return slideXml;

  let xml = ensureSlideNamespaces(slideXml);

  const matches = [...xml.matchAll(SHAPE_PATTERN)];
  if (elementIndex >= matches.length) {
    console.warn(
      `Equation: element index ${elementIndex} out of bounds (total: ${matches.length})`
    );
    return slideXml;
  }

  const targetMatch = matches[elementIndex];
  const targetShape = targetMatch[0];
  const startIndex = targetMatch.index ?? 0;
  const endIndex = startIndex + targetShape.length;

  const txBodyPattern = /<p:txBody\b[^>]*>[\s\S]*?<\/p:txBody>/;
  const txBodyMatch = targetShape.match(txBodyPattern);
  if (!txBodyMatch) {
    console.warn(`Equation: <p:txBody> not found in shape ${elementIndex}`);
    return slideXml;
  }

  const paraXml = buildEquationParagraphXml(
    ommlXml,
    mathDisplayMode,
    mathJc,
    pickMathFallbackText(mathFallbackText, ommlXml),
    mathColorHex,
    mathSzHalfPt
  );
  const bodyPr =
    // Align equations vertically centered within their placeholder text box.
    // This matches typical HTML math layout better than top-aligned text bodies.
    '<a:bodyPr wrap="none" anchor="ctr"/>';
  const newTxBody = `<p:txBody>${bodyPr}<a:lstStyle/>${paraXml}</p:txBody>`;
  const updatedShape = targetShape.replace(txBodyPattern, newTxBody);

  return xml.slice(0, startIndex) + updatedShape + xml.slice(endIndex);
}
