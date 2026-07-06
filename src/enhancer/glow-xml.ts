import { StyleEnhancement } from '../types';

const SHAPE_PATTERN = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;

/**
 * Apply glow effect to a shape element by injecting <a:glow> into <a:effectLst>.
 *
 * OOXML glow XML:
 *   <a:glow rad="184150">
 *     <a:srgbClr val="000000">
 *       <a:alpha val="5000"/>
 *     </a:srgbClr>
 *   </a:glow>
 *
 * Where rad is in EMU (1pt = 12700 EMU).
 */
export function applyGlowToXml(slideXml: string, enhancement: StyleEnhancement): string {
  const { elementIndex, glowData } = enhancement;
  if (!glowData) return slideXml;

  const matches = [...slideXml.matchAll(SHAPE_PATTERN)];
  if (elementIndex >= matches.length) {
    console.warn(`Glow: element index ${elementIndex} out of bounds (total: ${matches.length})`);
    return slideXml;
  }

  const targetMatch = matches[elementIndex];
  const targetShape = targetMatch[0];
  const startIndex = targetMatch.index ?? 0;
  const endIndex = startIndex + targetShape.length;

  // Convert points to EMU (1pt = 12700 EMU)
  const radiusEmu = Math.round(glowData.radiusPt * 12700);
  // Alpha: 0-1 → OOXML 0-100000
  const alphaVal = Math.round(Math.max(0, Math.min(1, glowData.alpha)) * 100000);

  const glowXml =
    `<a:glow rad="${radiusEmu}">` +
    `<a:srgbClr val="${glowData.color}">` +
    `<a:alpha val="${alphaVal}"/>` +
    `</a:srgbClr>` +
    `</a:glow>`;

  const effectLstPattern = /<a:effectLst>[\s\S]*?<\/a:effectLst>/;

  let updatedShape: string;
  if (effectLstPattern.test(targetShape)) {
    // effectLst already exists — insert glow before </a:effectLst>
    updatedShape = targetShape.replace(effectLstPattern, (match) => {
      if (match.includes('<a:glow')) return match; // already has glow
      const insertPos = match.lastIndexOf('</a:effectLst>');
      if (insertPos === -1) return match;
      return match.slice(0, insertPos) + glowXml + match.slice(insertPos);
    });
  } else {
    // No effectLst — create one before </p:spPr>
    const insertPoint = targetShape.indexOf('</p:spPr>');
    if (insertPoint === -1) {
      console.warn('Glow: <p:spPr> not found, skipping effect');
      return slideXml;
    }
    updatedShape =
      targetShape.slice(0, insertPoint) +
      `<a:effectLst>${glowXml}</a:effectLst>` +
      targetShape.slice(insertPoint);
  }

  return slideXml.slice(0, startIndex) + updatedShape + slideXml.slice(endIndex);
}
