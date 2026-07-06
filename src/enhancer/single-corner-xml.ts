import { StyleEnhancement } from '../types';

const PATH_COORD = 21600; // OOXML path coordinate system (0-21600 = 100%)

/**
 * Generate OOXML custGeom path for rect with one rounded corner
 * cornerIndex: 0=topLeft, 1=topRight, 2=bottomRight, 3=bottomLeft
 */
function buildSingleCornerPath(
  cornerIndex: number,
  radiusInch: number,
  widthInch: number,
  heightInch: number
): string {
  if (radiusInch <= 0 || widthInch <= 0 || heightInch <= 0) return '';

  // 1/4 椭圆：border-radius:100% 时椭圆填满角，rx=宽度 ry=高度。path 空间 0-21600
  // 当 radius 接近 min(w,h) 时视为 100%，用 wR=hR=21600 得到完整 1/4 椭圆
  const minDim = Math.min(widthInch, heightInch);
  const isFullEllipse = radiusInch >= minDim * 0.8;
  const wR = isFullEllipse ? PATH_COORD : Math.round(Math.min((radiusInch / widthInch) * PATH_COORD, PATH_COORD));
  const hR = isFullEllipse ? PATH_COORD : Math.round(Math.min((radiusInch / heightInch) * PATH_COORD, PATH_COORD));

  const w = PATH_COORD;
  const h = PATH_COORD;

  // Use arcTo for true circular arc (smooth); quadBezTo approximates and looks angular
  // arcTo: wR, hR (radii), stAng, swAng (angles in 60000ths of degree; 90°=5400000, 270°=16200000)
  // OOXML: 0°=east, 90°=south, 180°=west, 270°=north; swAng is always clockwise
  const ARC_90 = 5400000;
  const ARC_270 = 16200000;

  switch (cornerIndex) {
    case 0: // topLeft: arc from (0,hR) to (wR,0), ellipse center (wR,hR)
      return `<a:moveTo><a:pt x="${wR}" y="0"/></a:moveTo>` +
        `<a:lnTo><a:pt x="${w}" y="0"/></a:lnTo>` +
        `<a:lnTo><a:pt x="${w}" y="${h}"/></a:lnTo>` +
        `<a:lnTo><a:pt x="0" y="${h}"/></a:lnTo>` +
        `<a:lnTo><a:pt x="0" y="${hR}"/></a:lnTo>` +
        `<a:arcTo wR="${wR}" hR="${hR}" stAng="${ARC_90 * 2}" swAng="${ARC_90}"/>` +
        `<a:close/>`;
    case 1: // topRight: arc from (w-wR,0) to (w,hR), ellipse center (w-wR,hR)
      return `<a:moveTo><a:pt x="0" y="0"/></a:moveTo>` +
        `<a:lnTo><a:pt x="${w - wR}" y="0"/></a:lnTo>` +
        `<a:arcTo wR="${wR}" hR="${hR}" stAng="${ARC_270}" swAng="${ARC_90}"/>` +
        `<a:lnTo><a:pt x="${w}" y="${h}"/></a:lnTo>` +
        `<a:lnTo><a:pt x="0" y="${h}"/></a:lnTo>` +
        `<a:lnTo><a:pt x="0" y="0"/></a:lnTo>` +
        `<a:close/>`;
    case 2: // bottomRight: arc from (w,h-hR) to (w-wR,h), ellipse center (w-wR,h-hR)
      return `<a:moveTo><a:pt x="0" y="0"/></a:moveTo>` +
        `<a:lnTo><a:pt x="${w}" y="0"/></a:lnTo>` +
        `<a:lnTo><a:pt x="${w}" y="${h - hR}"/></a:lnTo>` +
        `<a:arcTo wR="${wR}" hR="${hR}" stAng="0" swAng="${ARC_90}"/>` +
        `<a:lnTo><a:pt x="0" y="${h}"/></a:lnTo>` +
        `<a:lnTo><a:pt x="0" y="0"/></a:lnTo>` +
        `<a:close/>`;
    case 3: // bottomLeft: arc at (0,h), 短弧凸 中心(wR,h-hR) stAng=90°(南)->180°(西)
      return `<a:moveTo><a:pt x="0" y="0"/></a:moveTo>` +
        `<a:lnTo><a:pt x="${w}" y="0"/></a:lnTo>` +
        `<a:lnTo><a:pt x="${w}" y="${h}"/></a:lnTo>` +
        `<a:lnTo><a:pt x="${wR}" y="${h}"/></a:lnTo>` +
        `<a:arcTo wR="${wR}" hR="${hR}" stAng="${ARC_90}" swAng="${ARC_90}"/>` +
        `<a:lnTo><a:pt x="0" y="${h - hR}"/></a:lnTo>` +
        `<a:close/>`;
    default:
      return '';
  }
}

/**
 * Apply single-corner rounded rect by replacing prstGeom rect with custGeom path
 */
export function applySingleCornerRectToXml(
  slideXml: string,
  enhancement: StyleEnhancement & {
    elementIndex: number;
    cornerRadii: [number, number, number, number];
    shapeWidthInch: number;
    shapeHeightInch: number;
  }
): string {
  const { elementIndex, cornerRadii, shapeWidthInch, shapeHeightInch } = enhancement;

  const nonZeroIndices = cornerRadii
    .map((r, i) => (r > 0 ? i : -1))
    .filter((i) => i >= 0);
  if (nonZeroIndices.length !== 1) return slideXml;

  const cornerIndex = nonZeroIndices[0];
  const radiusInch = cornerRadii[cornerIndex];

  const pathContent = buildSingleCornerPath(
    cornerIndex,
    radiusInch,
    shapeWidthInch,
    shapeHeightInch
  );
  if (!pathContent) return slideXml;

  const custGeomXml = `<a:custGeom><a:pathLst><a:path w="${PATH_COORD}" h="${PATH_COORD}">${pathContent}</a:path></a:pathLst></a:custGeom>`;

  const shapePattern = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;
  const matches = [...slideXml.matchAll(shapePattern)];

  if (elementIndex >= matches.length) return slideXml;

  const targetMatch = matches[elementIndex];
  const targetShape = targetMatch[0];
  const targetStart = targetMatch.index!;
  const targetEnd = targetStart + targetShape.length;

  const prstGeomPattern = /<a:prstGeom prst="rect">[\s\S]*?<\/a:prstGeom>/;
  if (!targetShape.match(prstGeomPattern)) return slideXml;

  const modifiedShape = targetShape.replace(prstGeomPattern, custGeomXml);

  return (
    slideXml.substring(0, targetStart) +
    modifiedShape +
    slideXml.substring(targetEnd)
  );
}
