/**
 * OOXML repairs for slide parts that pptxgenjs emits incorrectly.
 *
 * Rich-text arrays cause pptxgen to insert <a:pPr> before every <a:r> inside one <a:p>.
 * ECMA-376 allows at most one <a:pPr> as the first child of <a:p> — extra pPr triggers
 * PowerPoint "repair document" and schema validation errors.
 */
const PARAGRAPH_RE = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
const PPR_RE = /<a:pPr\b[^>]*(?:\/>|>[\s\S]*?<\/a:pPr>)/g;

export function fixDuplicateParagraphPropertiesInSlide(slideXml: string): string {
  return slideXml.replace(PARAGRAPH_RE, (paragraph: string, inner: string) => {
    let seenPPr = false;
    const fixedInner = inner.replace(PPR_RE, (pPr: string) => {
      if (!seenPPr) {
        seenPPr = true;
        return pPr;
      }
      return '';
    });
    return paragraph.replace(inner, fixedInner);
  });
}
