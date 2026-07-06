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

  let modifiedXml = slideXml;

  for (const picMatch of picMatches) {
    const picXml = picMatch[0];
    if (!picXml.includes('<a:prstGeom')) continue;

    // Replace rect with roundRect and add adj
    // Pattern: <a:prstGeom prst="rect"><a:avLst/></a:prstGeom> or similar
    let modifiedPicXml = picXml.replace(
      /<a:prstGeom prst="rect">([\s\S]*?)<\/a:prstGeom>/,
      `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${adjClamped}"/></a:avLst></a:prstGeom>`
    );

    if (modifiedPicXml !== picXml) {
      modifiedXml = modifiedXml.replace(picXml, modifiedPicXml);
      break; // Only modify the first matching pic (by elementIndex we could be more precise)
    }
  }

  return modifiedXml;
}
