import { StyleEnhancement } from '../types';

/**
 * Apply table cell margin to slide XML
 * Replaces marL, marR, marT, marB in a:tcPr with target value (EMUs)
 * pptxgenjs ignores margin:0, so we post-process to achieve compact cells
 */
export function applyTableCellMarginToXml(
  slideXml: string,
  enhancement: StyleEnhancement
): string {
  const marginPt = enhancement.tableCellMarginPt ?? 0;
  // 1 pt = 12700 EMUs (914400 EMUs per inch, 72 pt per inch)
  const marginEmu = Math.round(marginPt * 12700);
  const marginStr = String(marginEmu);

  // Replace marL, marR, marT, marB in every a:tcPr (table cell properties only, not a:pPr)
  // Matches <a:tcPr ...> (with attrs) and <a:tcPr> (empty)
  return slideXml.replace(
    /<a:tcPr(\s+[^>]*?)?>/g,
    (_match, attrs) => {
      const attrStr = attrs ? attrs.trim() : '';
      let rest = attrStr
        .replace(/\s*marL="[^"]*"/g, '')
        .replace(/\s*marR="[^"]*"/g, '')
        .replace(/\s*marT="[^"]*"/g, '')
        .replace(/\s*marB="[^"]*"/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      const marginAttrs = `marL="${marginStr}" marR="${marginStr}" marT="${marginStr}" marB="${marginStr}"`;
      return `<a:tcPr ${marginAttrs}${rest ? ' ' + rest : ''}>`;
    }
  );
}
