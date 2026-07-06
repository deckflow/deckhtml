import { StyleEnhancement } from '../types';

const SHAPE_PATTERN = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;

/**
 * Apply CSS writing-mode via OOXML a:bodyPr @vert (e.g. vertical-rl → eaVert).
 */
export function applyWritingModeToXml(
  slideXml: string,
  enhancement: StyleEnhancement
): string {
  const { elementIndex, bodyPrVert } = enhancement;
  if (!bodyPrVert) return slideXml;

  const matches = [...slideXml.matchAll(SHAPE_PATTERN)];
  if (elementIndex >= matches.length) {
    console.warn(
      `Writing mode: element index ${elementIndex} out of bounds (total: ${matches.length})`
    );
    return slideXml;
  }

  const targetMatch = matches[elementIndex];
  const targetShape = targetMatch[0];
  const startIndex = targetMatch.index ?? 0;
  const endIndex = startIndex + targetShape.length;

  if (!/<a:bodyPr\b/.test(targetShape)) {
    console.warn('Writing mode: <a:bodyPr> not found in target shape');
    return slideXml;
  }

  const updatedShape = targetShape.replace(/<a:bodyPr\b([^>]*)\/?>/, (full, attrs) => {
    const vertAttr = `vert="${bodyPrVert}"`;
    if (/\bvert="[^"]*"/.test(attrs)) {
      return full.replace(/\bvert="[^"]*"/, vertAttr);
    }
    return `<a:bodyPr ${vertAttr}${attrs}>`;
  });

  return slideXml.slice(0, startIndex) + updatedShape + slideXml.slice(endIndex);
}
