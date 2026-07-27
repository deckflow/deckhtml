import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertHtmlToPptx } from '../../dist/api.js';
import { closeOwnedBrowser } from '../../dist/loader.js';
import { ConversionError, RULE_IDS } from '../../dist/utils/diagnostics.js';
import { recomputeSummary } from '../../dist/conversion-report.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE_DIR = path.join(ROOT, 'benchmark', 'pending', 'p0-003-strict-mode');
const GOOD = path.join(FIXTURE_DIR, 'deck.html');
const MISSING_ID = path.join(FIXTURE_DIR, 'missing-identity.html');

describe('DH-P0-003 strict / loose mode separation', () => {
  after(async () => {
    await closeOwnedBrowser();
  });

  it('loose mode (default) succeeds even when elements lack identity', async () => {
    const result = await convertHtmlToPptx({
      input: MISSING_ID,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });
    assert.ok(result.data.length > 0);
    assert.equal(result.report.status, 'succeeded');
  });

  it('strict mode succeeds when every visible element declares an identity', async () => {
    const result = await convertHtmlToPptx({
      input: GOOD,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
      strict: {},
    });
    assert.ok(result.data.length > 0);
    assert.equal(result.report.status, 'succeeded');
  });

  it('strict mode hard-fails with ConversionError when an element lacks identity', async () => {
    await assert.rejects(
      () =>
        convertHtmlToPptx({
          input: MISSING_ID,
          viewportWidth: 1280,
          viewportHeight: 720,
          quiet: true,
          allowLocalResources: true,
          strict: {},
        }),
      (err: unknown) => {
        assert.ok(err instanceof ConversionError, `expected ConversionError, got ${err?.constructor?.name}`);
        assert.equal(err.name, 'ConversionError');
        assert.equal(err.primary.rule_id, RULE_IDS.IDENTITY_MISSING);
        assert.equal(err.primary.severity, 'error');
        assert.ok(err.primary.recovery, 'recovery hint should be present');
        assert.ok(err.hasErrors, 'should have error-severity diagnostics');
        return true;
      },
    );
  });

  it('strict.requireElementIdentity=false relaxes the identity gate', async () => {
    const result = await convertHtmlToPptx({
      input: MISSING_ID,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
      strict: { requireElementIdentity: false },
    });
    assert.ok(result.data.length > 0);
    assert.equal(result.report.status, 'succeeded');
  });

  it('strict mode does not return a PPTX on failure (no data leak)', async () => {
    let thrown: unknown;
    try {
      await convertHtmlToPptx({
        input: MISSING_ID,
        viewportWidth: 1280,
        viewportHeight: 720,
        quiet: true,
        allowLocalResources: true,
        strict: {},
      });
    } catch (err) {
      thrown = err;
    }
    assert.ok(thrown, 'strict mode should have thrown');
    // The thrown ConversionError must not carry a successful PPTX buffer.
    assert.ok(thrown instanceof ConversionError);
    assert.equal((thrown as ConversionError).primary.severity, 'error');
  });

  it('recomputeSummary reproduces the report summary from per-element records', async () => {
    const result = await convertHtmlToPptx({
      input: GOOD,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });
    const recomputed = recomputeSummary(result.report, result.report.summary.ignored);
    assert.deepEqual(recomputed, result.report.summary);
  });
});
