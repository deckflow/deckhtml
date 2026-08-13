import { StyleEnhancement } from '../types';

/**
 * Apply border-radius to image (p:pic) by changing preset shape from rect to roundRect.
 * In OOXML, roundRect's adj value is corner radius as percentage (0-100000) of min(width, height).
 * adj = (radiusInch / min(w_inch, h_inch)) * 100000
 */
export function applyImageRoundRectToXml(
  slideXml: string,
  enhancement: StyleEnhancement & {
    imageBorderRadiusPx: number;
    imageWidthInch: number;
    imageHeightInch: number;
    elementIndex: number;
    picIndex?: number;
  }
): string {
  const { imageBorderRadiusPx, imageWidthInch, imageHeightInch } = enhancement;
  if (!imageBorderRadiusPx || imageBorderRadiusPx <= 0 || !imageWidthInch || !imageHeightInch) {
    return slideXml;
  }

  const radiusInch = imageBorderRadiusPx / 128;
  const minDim = Math.min(imageWidthInch, imageHeightInch);
  if (minDim <= 0) return slideXml;

  const adj = Math.round((radiusInch / minDim) * 100000);
  const adjClamped = Math.min(50000, Math.max(0, adj)); // OOXML typically 0-50000

  const picMatches = Array.from(slideXml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g));
  if (picMatches.length === 0) return slideXml;

  const { picIndex } = enhancement;
  if (
    picIndex !== undefined &&
    (!Number.isInteger(picIndex) || picIndex < 0 || picIndex >= picMatches.length)
  ) {
    return slideXml;
  }

  const targetMatch = picMatches[picIndex ?? 0];
  const matchStart = targetMatch?.index;
  if (!targetMatch || matchStart === undefined) return slideXml;

  const picXml = targetMatch[0];
  const modifiedPicXml = picXml.replace(
    /<a:prstGeom prst="rect">([\s\S]*?)<\/a:prstGeom>/,
    `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adjClamped}"/></a:avLst></a:prstGeom>`
  );
  if (modifiedPicXml === picXml) return slideXml;

  const matchEnd = matchStart + picXml.length;
  return `${slideXml.slice(0, matchStart)}${modifiedPicXml}${slideXml.slice(matchEnd)}`;
}
