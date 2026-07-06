import { StyleEnhancement } from '../types';

/**
 * Apply image sizing (object-fit: cover/contain) to PPTX XML
 * 
 * For object-fit: cover:
 * - Replace <a:stretch/> with <a:stretch><a:fillRect/></a:stretch>
 * - fillRect must be wrapped in stretch tag for proper cover behavior
 * - Calculate and set srcRect with only needed crop attributes (l/r or t/b, not both)
 * - Only set attributes that are needed (non-zero), don't set attributes to 0
 * 
 * For object-fit: contain, we'd use <a:fit/> but that's less common.
 */
export function applyImageSizingToXml(
  slideXml: string,
  enhancement: StyleEnhancement & {
    objectFit: 'cover' | 'contain';
    elementIndex: number;
    picIndex?: number;
  }
): string {
  if (enhancement.objectFit !== 'cover' && enhancement.objectFit !== 'contain') {
    return slideXml;
  }

  const picMatches = Array.from(slideXml.matchAll(/<p:pic>[\s\S]*?<\/p:pic>/g));
  if (picMatches.length === 0) {
    return slideXml;
  }

  // Use explicit pic index first (precise mapping), fallback to first picture for compatibility.
  const targetPicIdx =
    typeof enhancement.picIndex === 'number' &&
    enhancement.picIndex >= 0 &&
    enhancement.picIndex < picMatches.length
      ? enhancement.picIndex
      : 0;
  const targetMatch = picMatches[targetPicIdx];
  if (!targetMatch) {
    return slideXml;
  }

  const picXml = targetMatch[0];
  const matchStart = targetMatch.index ?? -1;
  if (matchStart < 0) {
    return slideXml;
  }
  let modifiedPicXml = picXml;

  if (enhancement.objectFit === 'cover') {
    // Calculate srcRect for cover behavior
    // Only set attributes that are needed (non-zero), don't set attributes to 0
    let srcRectAttrs: string[] = [];

    if (enhancement.imageNaturalWidth && enhancement.imageNaturalHeight &&
        enhancement.containerWidth && enhancement.containerHeight) {
      const imageAspect = enhancement.imageNaturalWidth / enhancement.imageNaturalHeight;
      const containerAspect = enhancement.containerWidth / enhancement.containerHeight;

      // Calculate crop percentages (in 100000ths)
      let l: number | null = null;
      let r: number | null = null;
      let t: number | null = null;
      let b: number | null = null;

      if (imageAspect > containerAspect) {
        // Image is wider than container - scale by height, crop left/right
        const scaledWidth = enhancement.containerHeight * imageAspect;
        const cropWidth = (scaledWidth - enhancement.containerWidth) / 2;
        if (cropWidth > 0) {
          const cropPercent = Math.round((cropWidth / scaledWidth) * 100000);
          l = cropPercent;
          r = cropPercent;
        }
      } else {
        // Image is taller than container - scale by width, crop top/bottom
        const scaledHeight = enhancement.containerWidth / imageAspect;
        const cropHeight = (scaledHeight - enhancement.containerHeight) / 2;
        if (cropHeight > 0) {
          const cropPercent = Math.round((cropHeight / scaledHeight) * 100000);
          t = cropPercent;
          b = cropPercent;
        }
      }

      if (l !== null) srcRectAttrs.push(`l="${l}"`);
      if (r !== null) srcRectAttrs.push(`r="${r}"`);
      if (t !== null) srcRectAttrs.push(`t="${t}"`);
      if (b !== null) srcRectAttrs.push(`b="${b}"`);
    }

    const srcRectXml = srcRectAttrs.length > 0
      ? `<a:srcRect ${srcRectAttrs.join(' ')}/>`
      : '';

    const hasOriginalSrcRect = modifiedPicXml.includes('<a:srcRect');

    if (srcRectXml) {
      if (hasOriginalSrcRect) {
        modifiedPicXml = modifiedPicXml.replace(
          /<a:srcRect\s+[^>]*?\/?>/g,
          srcRectXml
        );
      } else {
        modifiedPicXml = modifiedPicXml.replace(
          /(<a:blip[^>]*>)/,
          `$1${srcRectXml}`
        );
      }
    } else if (!hasOriginalSrcRect) {
      console.warn(`⚠️  Image sizing enhancement: Could not calculate srcRect for cover (missing image dimensions)`);
    }

    // fillRect keeps center crop behavior for cover
    modifiedPicXml = modifiedPicXml.replace(
      /<a:stretch>[\s\S]*?<\/a:stretch>/g,
      '<a:stretch><a:fillRect/></a:stretch>'
    );
    modifiedPicXml = modifiedPicXml.replace(
      /<a:stretch\/>/g,
      '<a:stretch><a:fillRect/></a:stretch>'
    );
  } else if (enhancement.objectFit === 'contain') {
    modifiedPicXml = modifiedPicXml.replace(
      /<a:stretch>[\s\S]*?<\/a:stretch>/g,
      ''
    );
    modifiedPicXml = modifiedPicXml.replace(
      /<a:stretch\/>/g,
      ''
    );
  }

  const matchEnd = matchStart + picXml.length;
  return `${slideXml.slice(0, matchStart)}${modifiedPicXml}${slideXml.slice(matchEnd)}`;
}
