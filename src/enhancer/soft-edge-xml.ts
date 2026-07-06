import { StyleEnhancement } from '../types';

const SHAPE_PATTERN = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;

export function applySoftEdgeToXml(slideXml: string, enhancement: StyleEnhancement): string {
  const { elementIndex, softEdgeRadiusPt, softEdgeShadow } = enhancement;
  if (softEdgeRadiusPt === undefined) return slideXml;

  const matches = [...slideXml.matchAll(SHAPE_PATTERN)];
  if (elementIndex >= matches.length) {
    console.warn(`Soft edge: element index ${elementIndex} out of bounds (total: ${matches.length})`);
    return slideXml;
  }

  const targetMatch = matches[elementIndex];
  const targetShape = targetMatch[0];
  const startIndex = targetMatch.index ?? 0;
  const endIndex = startIndex + targetShape.length;

  const effectLstPattern = /<a:effectLst>[\s\S]*?<\/a:effectLst>/;
  const softEdgeXml = `<a:softEdge rad="${Math.round(softEdgeRadiusPt * 12700)}"/>`;
  const outerShadowXml =
    softEdgeShadow !== undefined
      ? `<a:outerShdw blurRad="${Math.round(softEdgeShadow.blurPt * 12700)}" dist="${Math.round(softEdgeShadow.distPt * 12700)}" dir="${Math.round(((softEdgeShadow.angleDeg % 360 + 360) % 360) * 60000)}" algn="ctr" rotWithShape="0"><a:srgbClr val="${softEdgeShadow.color}"><a:alpha val="${Math.round(Math.max(0, Math.min(1, softEdgeShadow.opacity)) * 100000)}"/></a:srgbClr></a:outerShdw>`
      : '';

  let updatedShape: string;
  if (effectLstPattern.test(targetShape)) {
    updatedShape = targetShape.replace(effectLstPattern, (match) => {
      const insertPosition = match.lastIndexOf('</a:effectLst>');
      if (insertPosition === -1) return match;

      const hasSoftEdge = match.includes('<a:softEdge');
      const hasOuterShadow = match.includes('<a:outerShdw');

      let additions = '';
      if (softEdgeShadow && !hasOuterShadow) {
        additions += outerShadowXml;
      }
      if (!hasSoftEdge) {
        additions += softEdgeXml;
      }

      if (!additions) return match;
      return `${match.slice(0, insertPosition)}${additions}${match.slice(insertPosition)}`;
    });
  } else {
    const insertPoint = targetShape.indexOf('</p:spPr>');
    if (insertPoint === -1) {
      console.warn('Soft edge: <p:spPr> not found, skipping effect');
      return slideXml;
    }
    const effectLstInner = `${outerShadowXml}${softEdgeXml}`;
    const effectLstXml = `<a:effectLst>${effectLstInner}</a:effectLst>`;
    updatedShape =
      targetShape.slice(0, insertPoint) + effectLstXml + targetShape.slice(insertPoint);
  }

  return slideXml.slice(0, startIndex) + updatedShape + slideXml.slice(endIndex);
}
