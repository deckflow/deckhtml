import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { convertHtmlToPptx } from '../../dist/api.js';
import { closeOwnedBrowser } from '../../dist/loader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'benchmark', 'pending', 'p0-001-element-identity', 'deck.html');

async function slideXml(data: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const file = zip.file('ppt/slides/slide1.xml');
  assert.ok(file, 'slide1.xml missing');
  return await file.async('string');
}

describe('DH-P0-001 stable element identity', () => {
  after(async () => {
    await closeOwnedBrowser();
  });

  it('writes data-element-id into the PPTX object name (cNvPr @name)', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });
    assert.ok(result.data.length > 0);
    const xml = await slideXml(result.data);

    // Each declared identity must appear as a cNvPr name somewhere in the slide.
    for (const id of ['cover-title', 'cover-blurb', 'cover-card']) {
      assert.match(
        xml,
        new RegExp(`name="${id}"`),
        `expected cNvPr name="${id}" in slide xml`,
      );
    }
  });

  it('honours a custom identityAttribute', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
      identityAttribute: 'data-pptx-id',
    });
    const xml = await slideXml(result.data);
    // The card carries data-pptx-id="alt-card"; with the custom attribute it
    // should be exported as "alt-card" rather than "cover-card".
    assert.match(xml, /name="alt-card"/);
    // And the default-attribute identities should NOT be picked up.
    assert.doesNotMatch(xml, /name="cover-title"/);
  });

  it('detects duplicate identities and reports a structured diagnostic', async () => {
    const dupFixture = path.join(
      ROOT,
      'benchmark',
      'pending',
      'p0-001-element-identity',
      'dup.html',
    );
    // Write a fixture with a duplicate identity on the fly.
    const fs = await import('node:fs/promises');
    await fs.writeFile(
      dupFixture,
      `<!DOCTYPE html><html><body>
        <h1 data-element-id="dup-id">A</h1>
        <h2 data-element-id="dup-id">B</h2>
      </body></html>`,
    );
    try {
      const result = await convertHtmlToPptx({
        input: dupFixture,
        viewportWidth: 1280,
        viewportHeight: 720,
        quiet: true,
        allowLocalResources: true,
      });
      const diags = result.identityDiagnostics ?? [];
      const dup = diags.find(
        (d) => d.rule_id === 'DECKHTML_IDENTITY_DUPLICATE' && d.element_id === 'dup-id',
      );
      assert.ok(dup, `expected DECKHTML_IDENTITY_DUPLICATE diagnostic for dup-id, got: ${JSON.stringify(diags)}`);
      assert.equal(dup!.severity, 'warning');
    } finally {
      await fs.rm(dupFixture, { force: true });
    }
  });
});
