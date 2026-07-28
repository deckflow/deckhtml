/**
 * OOXML self-check & determinism (DH-P0-010).
 *
 * Reopens the generated PPTX buffer as a ZIP and verifies:
 *  - the package can be re-parsed;
 *  - slide count matches the conversion report;
 *  - every mapping record's object_ref name can be found in the slide XML;
 *  - no undisclosed full-page image (screenshot fallback) is present;
 *  - no undisclosed remote (external) relationships exist.
 *
 * The verifier is pure: it takes a Buffer + report and returns a list of
 * diagnostics. It does not throw on findings — callers (or strict mode) decide
 * whether to hard-fail.
 */

import JSZip from 'jszip';
import type {
  DeckHtmlConversionReport,
  ElementReportRecord,
} from '../conversion-report';
import { RULE_IDS, type Diagnostic } from './diagnostics';

export interface OoxmlVerificationResult {
  ok: boolean;
  diagnostics: Diagnostic[];
  /** Slide count discovered in the package (ppt/slides/slideN.xml). */
  packageSlideCount: number;
  /** True when a full-page image was detected on any slide. */
  hasFullPageImage: boolean;
  /** True when any external relationship was found. */
  hasRemoteRelationship: boolean;
}

/** Standard slide dimensions in EMUs (914400 EMU per inch). */
const SLIDE_W_EMU = 12192000; // 13.333 in
const SLIDE_H_EMU = 6858000;  // 7.5 in

/**
 * Verify a generated PPTX buffer against its conversion report (DH-P0-010).
 */
export async function verifyOoxml(
  data: Buffer,
  report: DeckHtmlConversionReport,
): Promise<OoxmlVerificationResult> {
  const diagnostics: Diagnostic[] = [];

  // 1. ZIP / package can be re-parsed.
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch (err) {
    diagnostics.push({
      rule_id: RULE_IDS.OOXML_REOPEN_FAILURE,
      severity: 'error',
      message: `Failed to reopen PPTX as a ZIP: ${err instanceof Error ? err.message : String(err)}`,
      recovery: 'Report this as an engine bug; the generated OOXML is corrupt.',
    });
    return { ok: false, diagnostics, packageSlideCount: 0, hasFullPageImage: false, hasRemoteRelationship: false };
  }

  // 2. Slide count: enumerate ppt/slides/slideN.xml entries.
  const slideEntries = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/)![1]!, 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/)![1]!, 10);
      return na - nb;
    });
  const packageSlideCount = slideEntries.length;

  if (packageSlideCount !== report.slides.length) {
    diagnostics.push({
      rule_id: RULE_IDS.OOXML_WRITE_FAILURE,
      severity: 'error',
      message: `Slide count mismatch: package has ${packageSlideCount} slide(s) but report has ${report.slides.length}.`,
      recovery: 'Report this as an engine bug; slide generation is not closed.',
    });
  }

  // 3. object_ref回查: each record's object name must appear in the slide XML.
  for (let i = 0; i < report.slides.length; i++) {
    const slideReport = report.slides[i]!;
    const entry = slideEntries[i];
    if (!entry) continue;
    const xml = await zip.files[entry]!.async('string');
    for (const rec of slideReport.elements) {
      if (rec.mapping_mode === 'ignored' || rec.mapping_mode === 'unsupported') continue;
      if (!rec.object_ref) continue;
      const nameMatch = rec.object_ref.match(/#name:(.+)$/);
      if (!nameMatch) continue;
      const name = nameMatch[1]!;
      // The cNvPr name attribute should contain the identity.
      const nameRegex = new RegExp(`name="${escapeRegex(name)}"`);
      if (!nameRegex.test(xml)) {
        diagnostics.push({
          rule_id: RULE_IDS.MAPPING_CLOSURE_FAILURE,
          severity: 'error',
          slide_id: slideReport.slide_id,
          element_id: rec.element_id,
          message: `object_ref "${rec.object_ref}" not found in ${entry}: name="${name}" missing from slide XML.`,
          recovery: 'Ensure the element identity is exported as the PPTX object name (cNvPr @name).',
        });
      }
    }
  }

  // 4. Full-page image detection: an image whose extent covers the whole slide.
  let hasFullPageImage = false;
  for (const entry of slideEntries) {
    const xml = await zip.files[entry]!.async('string');
    if (detectFullPageImage(xml)) {
      hasFullPageImage = true;
      diagnostics.push({
        rule_id: RULE_IDS.RASTER_FALLBACK,
        severity: 'warning',
        slide_id: null,
        message: `Full-page image detected in ${entry} — likely a screenshot fallback that hides native content.`,
        recovery: 'Avoid full-page screenshot fallbacks; convert elements natively or set strict.allowRaster=true.',
      });
    }
  }

  // 5. Remote relationship detection: any .rels with TargetMode="External".
  let hasRemoteRelationship = false;
  const relsEntries = Object.keys(zip.files).filter((n) =>
    n.endsWith('.rels'),
  );
  for (const entry of relsEntries) {
    const xml = await zip.files[entry]!.async('string');
    if (/TargetMode\s*=\s*["']External["']/i.test(xml)) {
      hasRemoteRelationship = true;
      diagnostics.push({
        rule_id: RULE_IDS.RESOURCE_REMOTE_BLOCKED,
        severity: 'warning',
        message: `Undisclosed remote relationship in ${entry}: TargetMode="External" found.`,
        recovery: 'Inline remote resources locally, or disclose them via the resource policy.',
      });
    }
  }

  // 6. Animation timing closure: every spid referenced by p:timing (spTgt/bldP)
  // must exist as a cNvPr @id in the same slide XML. A dangling reference
  // makes PowerPoint show the "repair" prompt.
  for (const entry of slideEntries) {
    const xml = await zip.files[entry]!.async('string');
    if (!xml.includes('<p:timing>')) continue;
    const shapeIds = new Set(
      [...xml.matchAll(/<p:cNvPr\s+id="(\d+)"/g)].map((m) => m[1]!),
    );
    const referenced = new Set<string>();
    for (const m of xml.matchAll(/<p:spTgt\s+spid="(\d+)"/g)) referenced.add(m[1]!);
    for (const m of xml.matchAll(/<p:bldP\s+spid="(\d+)"/g)) referenced.add(m[1]!);
    const dangling = [...referenced].filter((id) => !shapeIds.has(id));
    if (dangling.length > 0) {
      diagnostics.push({
        rule_id: RULE_IDS.OOXML_WRITE_FAILURE,
        severity: 'error',
        message: `Animation timing in ${entry} references missing shape id(s): ${dangling.join(', ')}.`,
        recovery: 'Report this as an engine bug; p:timing spTgt references are not closed.',
      });
    }
  }

  const ok = !diagnostics.some((d) => d.severity === 'error');
  return { ok, diagnostics, packageSlideCount, hasFullPageImage, hasRemoteRelationship };
}

/**
 * Detect a full-page image in a slide XML by looking for a picture (p:pic)
 * whose extent (a:ext cx/cy) matches the slide dimensions.
 */
function detectFullPageImage(xml: string): boolean {
  // Match <p:pic>...</p:pic> blocks and inspect their a:ext cx/cy.
  const picRegex = /<p:pic\b[\s\S]*?<\/p:pic>/g;
  let match: RegExpExecArray | null;
  while ((match = picRegex.exec(xml)) !== null) {
    const block = match[0];
    const extMatch = block.match(/<a:ext\s+cx="(\d+)"\s+cy="(\d+)"/);
    if (!extMatch) continue;
    const cx = parseInt(extMatch[1]!, 10);
    const cy = parseInt(extMatch[2]!, 10);
    // Allow a small tolerance (within 1% of slide dimensions).
    const tol = 0.01;
    if (
      cx >= SLIDE_W_EMU * (1 - tol) &&
      cx <= SLIDE_W_EMU * (1 + tol) &&
      cy >= SLIDE_H_EMU * (1 - tol) &&
      cy <= SLIDE_H_EMU * (1 + tol)
    ) {
      return true;
    }
  }
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Canonicalize a slide XML string for deterministic comparison (DH-P0-010).
 *
 * Strips volatile attributes (timestamps, temporary paths) and normalizes
 * whitespace so two runs over the same input produce equivalent canonical
 * strings. Binary-identical output is a stretch goal; canonical structural
 * equivalence is the minimum bar.
 */
export function canonicalizeSlideXml(xml: string): string {
  return xml
    // Strip XML comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Strip volatile attributes deckhtml never sets but pptxgenjs might inject
    .replace(/\s+\w+:id\s*=\s*"[^"]*"/gi, '')
    // Normalize whitespace between tags
    .replace(/>\s+</g, '><')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Compare two PPTX buffers for canonical OOXML equivalence (DH-P0-010).
 *
 * Returns `true` when every slide XML and rels entry is canonically equivalent
 * between the two runs. Binary identity is not required.
 */
export async function isCanonicalEquivalent(
  dataA: Buffer,
  dataB: Buffer,
): Promise<boolean> {
  const [zipA, zipB] = await Promise.all([
    JSZip.loadAsync(dataA),
    JSZip.loadAsync(dataB),
  ]);
  const namesA = Object.keys(zipA.files).sort();
  const namesB = Object.keys(zipB.files).sort();
  if (namesA.length !== namesB.length) return false;
  for (let i = 0; i < namesA.length; i++) {
    if (namesA[i] !== namesB[i]) return false;
    const name = namesA[i]!;
    const fileA = zipA.files[name]!;
    const fileB = zipB.files[name]!;
    if (fileA.dir || fileB.dir) continue;
    const isXml = name.endsWith('.xml') || name.endsWith('.rels');
    if (!isXml) continue;
    const [contentA, contentB] = await Promise.all([
      fileA.async('string'),
      fileB.async('string'),
    ]);
    if (canonicalizeSlideXml(contentA) !== canonicalizeSlideXml(contentB)) {
      return false;
    }
  }
  return true;
}
