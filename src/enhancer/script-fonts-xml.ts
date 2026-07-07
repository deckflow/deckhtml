import { StyleEnhancement } from '../types';
import { buildPlatformFontContext, PlatformFontContext } from '../utils/platformFontMap';
import { parseScriptFontFaces, ScriptFontFaces } from '../utils/style';
import {
  detectContainerScriptHints,
  scriptToOoxmlLang,
  splitTextByScript,
} from '../utils/textScript';

/**
 * Apply script-specific fonts (latin/ea/cs) and lang attributes per text run.
 */
export function applyScriptFontsToXml(
  slideXml: string,
  enhancement: StyleEnhancement
): string {
  const meta = enhancement.scriptFontsMeta;
  if (!meta?.fontFamily && !meta?.platform && !enhancement.scriptFontFaces) {
    return slideXml;
  }

  const shapePattern = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;
  const matches = [...slideXml.matchAll(shapePattern)];

  if (enhancement.elementIndex >= matches.length) {
    console.warn(
      `Script fonts: element index ${enhancement.elementIndex} out of bounds (total: ${matches.length})`
    );
    return slideXml;
  }

  const targetMatch = matches[enhancement.elementIndex];
  const targetShape = targetMatch[0];
  const targetStart = targetMatch.index!;
  const targetEnd = targetStart + targetShape.length;

  const platformCtx = meta?.platform ? buildPlatformFontContext({ platform: meta.platform }) : undefined;
  const shapeText = extractShapeText(targetShape);
  const containerHints = detectContainerScriptHints(shapeText);

  const updatedShape = targetShape.replace(
    /<a:p\b[^>]*>[\s\S]*?<\/a:p>/g,
    (paragraphXml) => processParagraph(paragraphXml, meta, platformCtx, containerHints, enhancement.scriptFontFaces)
  );

  return slideXml.substring(0, targetStart) + updatedShape + slideXml.substring(targetEnd);
}

function extractShapeText(shapeXml: string): string {
  const texts: string[] = [];
  const re = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(shapeXml)) !== null) {
    texts.push(decodeXmlText(match[1] ?? ''));
  }
  return texts.join('');
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function encodeXmlText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function processParagraph(
  paragraphXml: string,
  meta: StyleEnhancement['scriptFontsMeta'],
  platformCtx: PlatformFontContext | undefined,
  containerHints: ReturnType<typeof detectContainerScriptHints>,
  fallbackFaces?: ScriptFontFaces
): string {
  const openTagMatch = paragraphXml.match(/^<a:p\b[^>]*>/);
  const openTag = openTagMatch?.[0] ?? '<a:p>';
  const inner = paragraphXml.slice(openTag.length, paragraphXml.lastIndexOf('</a:p>'));
  const pPrMatch = inner.match(/^<a:pPr\b[^>]*>[\s\S]*?<\/a:pPr>/);
  const pPr = pPrMatch?.[0] ?? '';
  const body = pPr ? inner.slice(pPr.length) : inner;

  const processedRuns = body.replace(/<a:r\b[^>]*>[\s\S]*?<\/a:r>/g, (runXml) =>
    splitAndEnhanceRun(runXml, meta, platformCtx, containerHints, fallbackFaces)
  );

  return `${openTag}${pPr}${processedRuns}</a:p>`;
}

function splitAndEnhanceRun(
  runXml: string,
  meta: StyleEnhancement['scriptFontsMeta'],
  platformCtx: PlatformFontContext | undefined,
  containerHints: ReturnType<typeof detectContainerScriptHints>,
  fallbackFaces?: ScriptFontFaces
): string {
  const textMatch = runXml.match(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/);
  const rawText = textMatch?.[1] ?? '';
  const decodedText = decodeXmlText(rawText);
  const segments = splitTextByScript(decodedText, containerHints);

  if (segments.length <= 1) {
    return enhanceSingleRun(runXml, segments[0]?.script ?? 'latin', meta, platformCtx, fallbackFaces);
  }

  const rPrMatch = runXml.match(/<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>/);
  const rPr = rPrMatch?.[0] ?? '<a:rPr/>';
  const brMatch = runXml.match(/<a:br\b[^>]*\/>/);
  const br = brMatch?.[0] ?? '';

  return segments
    .map((seg) => {
      const enhancedRPr = applyRunFontSlots(
        rPr,
        seg.script,
        meta,
        platformCtx,
        fallbackFaces
      );
      const encoded = encodeXmlText(seg.text);
      return `<a:r>${enhancedRPr}${br}<a:t>${encoded}</a:t></a:r>`;
    })
    .join('');
}

function enhanceSingleRun(
  runXml: string,
  script: import('../utils/platformFontMap').PlatformFontLang,
  meta: StyleEnhancement['scriptFontsMeta'],
  platformCtx: PlatformFontContext | undefined,
  fallbackFaces?: ScriptFontFaces
): string {
  return runXml.replace(/<a:rPr\b[^>]*>[\s\S]*?<\/a:rPr>/, (rPr) =>
    applyRunFontSlots(rPr, script, meta, platformCtx, fallbackFaces)
  );
}

function applyRunFontSlots(
  rPrXml: string,
  script: import('../utils/platformFontMap').PlatformFontLang,
  meta: StyleEnhancement['scriptFontsMeta'],
  platformCtx: PlatformFontContext | undefined,
  fallbackFaces?: ScriptFontFaces
): string {
  const ooxmlLang = scriptToOoxmlLang(script);
  let updated = upsertLangAttr(rPrXml, ooxmlLang);

  const stackSource = meta?.fontFamilySpecified ?? meta?.fontFamily;
  const faces =
    stackSource && platformCtx
      ? parseScriptFontFaces(meta?.fontFamily, {
          platformFontContext: platformCtx,
          specifiedFontFamily: stackSource,
          textScript: script,
        })
      : fallbackFaces;

  if (!faces) return updated;

  updated = upsertScriptTypeface(updated, 'latin', faces.latin);

  if (script === 'ar' || script === 'he') {
    updated = upsertScriptTypeface(updated, 'cs', faces.cs ?? faces.latin);
    updated = removeScriptTypeface(updated, 'ea');
  } else if (script === 'sc' || script === 'tc' || script === 'jp' || script === 'kr') {
    updated = upsertScriptTypeface(updated, 'ea', faces.ea);
    updated = removeScriptTypeface(updated, 'cs');
  } else {
    updated = removeScriptTypeface(updated, 'ea');
    updated = removeScriptTypeface(updated, 'cs');
  }

  return updated;
}

function removeScriptTypeface(rPrXml: string, tag: 'latin' | 'ea' | 'cs'): string {
  const selfClosing = new RegExp(`<a:${tag}\\b[^>]*/>`, 'g');
  const withBody = new RegExp(`<a:${tag}\\b[^>]*>[\\s\\S]*?</a:${tag}>`, 'g');
  return rPrXml.replace(selfClosing, '').replace(withBody, '');
}

function upsertLangAttr(rPrXml: string, lang: string): string {
  if (/<a:rPr\b[^>]*\/>/.test(rPrXml)) {
    return rPrXml.replace(/<a:rPr\b([^>]*)\/>/, `<a:rPr$1 lang="${lang}"/>`);
  }
  if (/\slang="[^"]*"/.test(rPrXml)) {
    return rPrXml.replace(/\slang="[^"]*"/, ` lang="${lang}"`);
  }
  return rPrXml.replace(/<a:rPr\b/, `<a:rPr lang="${lang}"`);
}

function upsertScriptTypeface(rPrXml: string, tag: 'latin' | 'ea' | 'cs', typeface: string): string {
  const selfClosing = new RegExp(`<a:${tag}\\b[^>]*\\/>`);
  const withBody = new RegExp(`<a:${tag}\\b[^>]*>[\\s\\S]*?<\\/a:${tag}>`);

  if (selfClosing.test(rPrXml)) {
    return rPrXml.replace(
      new RegExp(`(<a:${tag}\\b[^>]*\\btypeface=")[^"]*(")`),
      `$1${typeface}$2`
    ).replace(
      new RegExp(`<a:${tag}\\b([^>]*)\\/>`),
      (full, attrs) => {
        if (/\btypeface="/.test(attrs)) return full;
        return `<a:${tag}${attrs} typeface="${typeface}"/>`;
      }
    );
  }

  if (withBody.test(rPrXml)) {
    return rPrXml.replace(
      new RegExp(`(<a:${tag}\\b[^>]*\\btypeface=")[^"]*(")`),
      `$1${typeface}$2`
    );
  }

  const insertPoint = rPrXml.lastIndexOf('</a:rPr>');
  if (insertPoint === -1) {
    return rPrXml.replace(/\/>$/, `><a:${tag} typeface="${typeface}"/></a:rPr>`);
  }
  return (
    rPrXml.slice(0, insertPoint) +
    `<a:${tag} typeface="${typeface}"/>` +
    rPrXml.slice(insertPoint)
  );
}
