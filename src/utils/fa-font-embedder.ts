/**
 * Font Awesome font embedder for PPTX.
 *
 * This project does NOT implement general font embedding — that is the cloud's job.
 * Font Awesome is the one exception: its icon glyphs must travel with the PPTX,
 * otherwise the small icons render as empty boxes on machines without FA installed.
 *
 * Pre-built PowerPoint-compatible EOT files live under assets/fonts/font-awesome/
 * (generated from the official FA TTFs via html2pptx's sanitize + sfnttool pipeline).
 * No runtime TTF→EOT conversion is performed; we just drop the matching EOT into
 * ppt/fonts/ and wire up [Content_Types].xml / presentation.xml / .rels.
 */
import * as fs from 'fs';
import * as path from 'path';
import JSZip from 'jszip';

/** PPTX typeface → EOT asset path (relative to this package's assets/ dir). */
const FONT_AWESOME_EOT_MAP: Record<string, string> = {
  // Font Awesome 6 Free — face names emitted by normalizeFontAwesomeFreeFamily
  'Font Awesome 6 Free Solid': 'fonts/font-awesome/6/fa-solid-900.eot',
  'Font Awesome 6 Free Regular': 'fonts/font-awesome/6/fa-regular-400.eot',
  // Font Awesome 6 Brands — CSS family name (brands bypass normalizeFontAwesomeFreeFamily)
  'Font Awesome 6 Brands': 'fonts/font-awesome/6/fa-brands-400.eot',
  'Font Awesome 6 Brands Regular': 'fonts/font-awesome/6/fa-brands-400.eot',
  // Font Awesome 5 Brands — CSS family name
  'Font Awesome 5 Brands': 'fonts/font-awesome/5/fa-brands-400.eot',
  'Font Awesome 5 Brands Regular': 'fonts/font-awesome/5/fa-brands-400.eot',
  // Font Awesome v4 Compatibility
  'Font Awesome v4 Compatibility': 'fonts/font-awesome/6/fa-v4compatibility.eot',
  'Font Awesome v4 Compatibility Regular':
    'fonts/font-awesome/6/fa-v4compatibility.eot',
  // Defensive aliases (FA5 Free face names — currently normalized to FA6 by
  // normalizeFontAwesomeFreeFamily, but keep them in case of direct CSS usage).
  'Font Awesome 5 Free Solid': 'fonts/font-awesome/5/fa-solid-900.eot',
  'Font Awesome 5 Free Regular': 'fonts/font-awesome/5/fa-regular-400.eot',
};

const FONTS_DIR = 'ppt/fonts';
const CONTENT_TYPES_PATH = '[Content_Types].xml';
const PRESENTATION_PATH = 'ppt/presentation.xml';
const PRESENTATION_RELS_PATH = 'ppt/_rels/presentation.xml.rels';

const FONT_CONTENT_TYPE = 'application/x-fontdata';
const FONT_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/font';

/** Resolve the assets/ directory shipped with this package. */
function resolveAssetsDir(): string {
  // dist/utils/fa-font-embedder.js → ../../assets
  const candidates = [
    path.resolve(__dirname, '..', '..', 'assets'),
    path.resolve(process.cwd(), 'assets'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0]!;
}

/** Extract every typeface="..." value from the PPTX slide XMLs. */
async function collectTypefaces(zip: JSZip): Promise<Set<string>> {
  const typefaces = new Set<string>();
  const typefaceRe = /\btypeface\s*=\s*"([^"]+)"/g;
  for (const filePath of Object.keys(zip.files)) {
    // Slide XMLs and theme/master XMLs may reference font faces.
    if (
      !filePath.endsWith('.xml') ||
      (!filePath.startsWith('ppt/slides/') &&
        !filePath.startsWith('ppt/slideMasters/') &&
        !filePath.startsWith('ppt/theme/') &&
        !filePath.startsWith('ppt/slideLayouts/'))
    ) {
      continue;
    }
    const file = zip.file(filePath);
    if (!file) continue;
    const xml = await file.async('text');
    let m: RegExpExecArray | null;
    while ((m = typefaceRe.exec(xml)) !== null) {
      if (m[1]) typefaces.add(m[1]);
    }
  }
  return typefaces;
}

function isFontAwesomeTypeface(typeface: string): boolean {
  return typeface in FONT_AWESOME_EOT_MAP;
}

interface EmbeddedFontInfo {
  /** PPTX typeface (matches <p:font typeface="..."/> and run fontFace). */
  typeface: string;
  /** Zip path where the EOT was written (ppt/fonts/fontN.fntdata). */
  zipPath: string;
  /** Relationship target relative to ppt/ (fonts/fontN.fntdata). */
  relTarget: string;
  /** Relationship id (rIdNNN) assigned in presentation.xml.rels. */
  rId: string;
}

/** Pick the next free fontN.fntdata name in the zip. */
function nextFontPath(zip: JSZip): string {
  let n = 1;
  while (zip.file(`${FONTS_DIR}/font${n}.fntdata`)) n += 1;
  return `${FONTS_DIR}/font${n}.fntdata`;
}

async function updateContentTypes(zip: JSZip): Promise<void> {
  const file = zip.file(CONTENT_TYPES_PATH);
  if (!file) return;
  let xml = await file.async('text');
  const defaultTag = `<Default Extension="fntdata" ContentType="${FONT_CONTENT_TYPE}"/>`;
  if (!xml.includes('Extension="fntdata"')) {
    xml = xml.replace('</Types>', `  ${defaultTag}\n</Types>`);
    zip.file(CONTENT_TYPES_PATH, xml);
  }
}

function generateEmbeddedFontLst(fonts: EmbeddedFontInfo[]): string {
  let xml = '<p:embeddedFontLst>';
  for (const font of fonts) {
    xml += '<p:embeddedFont>';
    xml += `<p:font typeface="${escapeXml(font.typeface)}" pitchFamily="34" charset="0"/>`;
    xml += `<p:regular r:id="${font.rId}"/>`;
    xml += '</p:embeddedFont>';
  }
  xml += '</p:embeddedFontLst>';
  return xml;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function updatePresentationXml(
  zip: JSZip,
  fonts: EmbeddedFontInfo[],
): Promise<void> {
  const file = zip.file(PRESENTATION_PATH);
  if (!file) return;
  let xml = await file.async('text');

  if (!xml.includes('embedTrueTypeFonts')) {
    xml = xml.replace(
      /(<p:presentation[^>]*)(>)/,
      '$1 embedTrueTypeFonts="1"$2',
    );
  }
  if (!xml.includes('saveSubsetFonts')) {
    xml = xml.replace(
      /(<p:presentation[^>]*)(>)/,
      '$1 saveSubsetFonts="1"$2',
    );
  }

  if (!xml.includes('<p:embeddedFontLst>')) {
    const lst = generateEmbeddedFontLst(fonts);
    // embeddedFontLst must come after p:notesSz per CT_Presentation schema order.
    if (/<p:notesSz[^>]*\/>|<\/p:notesSz>/.test(xml)) {
      xml = xml.replace(/(<p:notesSz[^>]*\/>|<\/p:notesSz>)/, `$1${lst}`);
    } else {
      // Fallback: insert just before closing </p:presentation>.
      xml = xml.replace('</p:presentation>', `${lst}</p:presentation>`);
    }
  }

  zip.file(PRESENTATION_PATH, xml);
}

async function updatePresentationRels(
  zip: JSZip,
  fonts: EmbeddedFontInfo[],
): Promise<void> {
  const file = zip.file(PRESENTATION_RELS_PATH);
  if (!file) return;
  let xml = await file.async('text');

  let maxRId = 0;
  const rIdRe = /Id="rId(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = rIdRe.exec(xml)) !== null) {
    const n = parseInt(m[1]!, 10);
    if (n > maxRId) maxRId = n;
  }

  let relsToAdd = '';
  fonts.forEach((font, index) => {
    font.rId = `rId${maxRId + index + 1}`;
    relsToAdd += `<Relationship Id="${font.rId}" Type="${FONT_REL_TYPE}" Target="${font.relTarget}"/>`;
  });

  xml = xml.replace('</Relationships>', `${relsToAdd}</Relationships>`);
  zip.file(PRESENTATION_RELS_PATH, xml);
}

/**
 * Embed Font Awesome fonts referenced by the PPTX into the package.
 * Only Font Awesome typefaces are embedded; all other fonts are left to the cloud.
 * Returns the original buffer unchanged when no FA typefaces are referenced.
 */
export async function embedFontAwesomeFonts(pptxData: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(pptxData);

  const typefaces = await collectTypefaces(zip);
  const faTypefaces = [...typefaces].filter(isFontAwesomeTypeface);
  if (faTypefaces.length === 0) {
    return pptxData;
  }

  const assetsDir = resolveAssetsDir();
  const fontsInfo: EmbeddedFontInfo[] = [];
  let embeddedCount = 0;

  for (const typeface of faTypefaces) {
    const relAsset = FONT_AWESOME_EOT_MAP[typeface]!;
    const absAssetPath = path.resolve(assetsDir, relAsset);
    if (!fs.existsSync(absAssetPath)) {
      console.warn(
        `⚠️  Font Awesome EOT asset missing: ${relAsset} (typeface "${typeface}") — skipping`,
      );
      continue;
    }
    const fontData = fs.readFileSync(absAssetPath);
    const zipPath = nextFontPath(zip);
    const relTarget = zipPath.replace(/^ppt\//, '');
    zip.file(zipPath, fontData);
    fontsInfo.push({ typeface, zipPath, relTarget, rId: 'pending' });
    console.log(
      `✓ Embedded Font Awesome: ${typeface} (${relAsset}, ${fontData.length} bytes)`,
    );
    embeddedCount += 1;
  }

  if (embeddedCount === 0) return pptxData;

  await updateContentTypes(zip);
  await updatePresentationRels(zip, fontsInfo);
  await updatePresentationXml(zip, fontsInfo);

  const modified = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
  });

  console.log(
    `\n✅ Embedded ${embeddedCount} Font Awesome font(s) into PPTX\n`,
  );
  return modified;
}
