import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { convertHtmlToPptx } from '../../dist/api.js';
import { closeOwnedBrowser } from '../../dist/loader.js';
import {
  verifyOoxml,
  isCanonicalEquivalent,
  canonicalizeSlideXml,
} from '../../dist/utils/ooxml-verify.js';
import { RULE_IDS } from '../../dist/utils/diagnostics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'benchmark', 'pending', 'p0-010-ooxml-verify', 'deck.html');

async function firstSlideXml(data: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const file = zip.file('ppt/slides/slide1.xml');
  assert.ok(file, 'slide1.xml missing');
  return await file.async('string');
}

describe('DH-P0-010 OOXML self-check & determinism', () => {
  after(async () => {
    await closeOwnedBrowser();
  });

  it('verifyOoxml reopens the generated PPTX and reports ok with no error diagnostics', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });
    const verification = await verifyOoxml(result.data, result.report);
    assert.equal(verification.ok, true, `expected ok, diagnostics: ${JSON.stringify(verification.diagnostics)}`);
    assert.equal(verification.packageSlideCount, result.report.slides.length);
    assert.equal(verification.hasFullPageImage, false);
    assert.equal(verification.hasRemoteRelationship, false);
    const errors = verification.diagnostics.filter((d) => d.severity === 'error');
    assert.equal(errors.length, 0);
  });

  it('object_ref closure: every mapped element identity is found as a cNvPr name in the slide XML', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });
    const xml = await firstSlideXml(result.data);
    for (const slide of result.report.slides) {
      for (const rec of slide.elements) {
        if (rec.mapping_mode === 'ignored' || rec.mapping_mode === 'unsupported') continue;
        if (!rec.element_id) continue;
        assert.match(
          xml,
          new RegExp(`name="${rec.element_id}"`),
          `element_id "${rec.element_id}" not found as cNvPr name in slide1.xml`,
        );
      }
    }
  });

  it('slide count in package matches the report', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });
    const zip = await JSZip.loadAsync(result.data);
    const slideFiles = Object.keys(zip.files).filter((n) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(n),
    );
    assert.equal(slideFiles.length, result.report.slides.length);
    assert.equal(slideFiles.length, result.slideCount);
  });

  it('canonicalizeSlideXml strips volatile attributes and normalizes whitespace', () => {
    const a = `<p:sp><p:nvSpPr><p:cNvPr p:id="42" name="title"/><p:cNvSpPr/></p:nvSpPr></p:sp>`;
    const b = `<p:sp>  <p:nvSpPr>  <p:cNvPr p:id="999" name="title"/>  <p:cNvSpPr/>  </p:nvSpPr>  </p:sp>`;
    assert.equal(canonicalizeSlideXml(a), canonicalizeSlideXml(b));
  });

  it('two runs over the same input produce canonical-equivalent OOXML', async () => {
    const opts = {
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    };
    const [resultA, resultB] = await Promise.all([
      convertHtmlToPptx(opts),
      convertHtmlToPptx(opts),
    ]);
    const equivalent = await isCanonicalEquivalent(resultA.data, resultB.data);
    assert.equal(equivalent, true, 'two runs should produce canonical-equivalent OOXML');
  });

  it('verifyOoxml detects a corrupt buffer (ZIP reopen failure)', async () => {
    const corruptBuffer = Buffer.from('not a zip file');
    const fakeReport = {
      schema_version: 1,
      engine: { name: 'test', version: '0' },
      status: 'succeeded' as const,
      slides: [],
      summary: { native: 0, vector: 0, raster: 0, ignored: 0, unsupported: 0 },
      diagnostics: [],
    };
    const verification = await verifyOoxml(corruptBuffer, fakeReport as any);
    assert.equal(verification.ok, false);
    assert.ok(
      verification.diagnostics.some((d) => d.rule_id === RULE_IDS.OOXML_REOPEN_FAILURE),
      'expected OOXML_REOPEN_FAILURE diagnostic',
    );
  });
});
