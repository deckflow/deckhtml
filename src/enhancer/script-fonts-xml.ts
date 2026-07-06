import { StyleEnhancement } from '../types';

/**
 * Apply script-specific fonts (latin/ea/cs) to a text shape.
 */
export function applyScriptFontsToXml(
  slideXml: string,
  enhancement: StyleEnhancement
): string {
  const { elementIndex, scriptFontFaces } = enhancement;
  if (!scriptFontFaces) return slideXml;

  const shapePattern = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;
  const matches = [...slideXml.matchAll(shapePattern)];

  if (elementIndex >= matches.length) {
    console.warn(`Script fonts: element index ${elementIndex} out of bounds (total: ${matches.length})`);
    return slideXml;
  }

  const targetMatch = matches[elementIndex];
  const targetShape = targetMatch[0];
  const targetStart = targetMatch.index!;
  const targetEnd = targetStart + targetShape.length;

  let updatedShape = targetShape
    .replace(/(<a:latin\b[^>]*\btypeface=")[^"]*("[^>]*\/>)/g, `$1${scriptFontFaces.latin}$2`)
    .replace(/(<a:ea\b[^>]*\btypeface=")[^"]*("[^>]*\/>)/g, `$1${scriptFontFaces.ea}$2`)
    .replace(/(<a:cs\b[^>]*\btypeface=")[^"]*("[^>]*\/>)/g, `$1${scriptFontFaces.cs}$2`);

  // Set run language by text content: Chinese -> zh-CN, otherwise en-US.
  updatedShape = updatedShape.replace(/<a:r\b[^>]*>[\s\S]*?<\/a:r>/g, (runXml) => {
    const textMatch = runXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/);
    const runText = textMatch?.[1] ?? '';
    if (!runText.trim()) return runXml;

    const lang = hasChineseChars(runText) ? 'zh-CN' : 'en-US';
    return runXml.replace(/<a:rPr\b([^>]*)>/, (full, attrs) => {
      const nextAttrs = upsertLangAttr(attrs, lang);
      return `<a:rPr${nextAttrs}>`;
    });
  });

  return slideXml.substring(0, targetStart) + updatedShape + slideXml.substring(targetEnd);
}

function hasChineseChars(s: string): boolean {
  return /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/.test(s);
}

function upsertLangAttr(attrs: string, lang: 'zh-CN' | 'en-US'): string {
  if (/\slang="[^"]*"/.test(attrs)) {
    return attrs.replace(/\slang="[^"]*"/, ` lang="${lang}"`);
  }
  return `${attrs} lang="${lang}"`;
}
