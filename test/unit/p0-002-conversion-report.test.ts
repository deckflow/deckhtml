import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertHtmlToPptx } from '../../dist/api.js';
import { closeOwnedBrowser } from '../../dist/loader.js';
import type { DeckHtmlConversionReport } from '../../dist/conversion-report.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'benchmark', 'pending', 'p0-002-conversion-report', 'deck.html');

describe('DH-P0-002 per-element conversion report', () => {
  after(async () => {
    await closeOwnedBrowser();
  });

  it('produces a structured report with mapping modes, object refs, geometry, and summary', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });
    const report: DeckHtmlConversionReport | undefined = result.report;
    assert.ok(report, 'ConversionResult.report missing');
    assert.equal(report.schema_version, 1);
    assert.equal(report.status, 'succeeded');
    assert.equal(report.engine.name, '@deckflow/deckhtml');
    assert.match(report.engine.version, /^\d+\.\d+\.\d+/);

    assert.equal(report.slides.length, 1, 'expected one slide');
    const slide = report.slides[0]!;
    assert.equal(slide.index, 1);

    // Each declared identity must appear as an element record with object_ref.
    const ids = slide.elements.map((e) => e.element_id);
    assert.ok(ids.includes('title'), `title missing from ${JSON.stringify(ids)}`);
    assert.ok(ids.includes('body'));
    assert.ok(ids.includes('card'));

    const title = slide.elements.find((e) => e.element_id === 'title')!;
    assert.equal(title.mapping_mode, 'native');
    assert.match(title.object_ref!, /slide1\.xml#name:title/);
    assert.equal(title.geometry.unit, 'inch');
    assert.ok(title.geometry.w > 0);
    assert.ok(title.geometry.h > 0);
    assert.deepEqual(title.warnings, []);

    // The ignored element must NOT appear as a record (it never reached the generator).
    assert.ok(
      !ids.includes('ignored'),
      'ignored element should not appear in the report elements',
    );

    // Summary must recompute from the records (native >= 3, ignored >= 1).
    assert.ok(report.summary.native >= 3, `summary.native=${report.summary.native}`);
    assert.ok(report.summary.ignored >= 1, `summary.ignored=${report.summary.ignored}`);
    // Recompute native from records and compare.
    const recomputedNative = slide.elements.filter((e) => e.mapping_mode === 'native').length;
    assert.equal(recomputedNative, report.summary.native - (report.summary.native - recomputedNative) || true);
    // Stronger: total of all slides' native equals summary.native.
    const totalNative = report.slides.flatMap((s) => s.elements).filter((e) => e.mapping_mode === 'native').length;
    assert.equal(totalNative, report.summary.native);
  });

  it('diagnostics array is present (even if empty for a clean conversion)', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });
    assert.ok(Array.isArray(result.report!.diagnostics));
  });
});
