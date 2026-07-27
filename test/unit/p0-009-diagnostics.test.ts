import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertHtmlToPptx } from '../../dist/api.js';
import { closeOwnedBrowser } from '../../dist/loader.js';
import {
  ConversionError,
  DiagnosticsCollector,
  RULE_IDS,
} from '../../dist/utils/diagnostics.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'benchmark', 'pending', 'p0-009-diagnostics', 'deck.html');

describe('DH-P0-009 structured diagnostics', () => {
  after(async () => {
    await closeOwnedBrowser();
  });

  it('exposes a stable RULE_IDS family with the minimum rule ids', () => {
    const required = [
      'IDENTITY_MISSING',
      'IDENTITY_DUPLICATE',
      'KIND_AMBIGUOUS',
      'KIND_UNSUPPORTED',
      'RESOURCE_REMOTE_BLOCKED',
      'RESOURCE_MISSING',
      'BROWSER_UNAVAILABLE',
      'FONT_MISSING',
      'RASTER_FALLBACK',
      'GEOMETRY_INVALID',
      'OOXML_WRITE_FAILURE',
      'OUTPUT_EXISTS',
    ];
    for (const key of required) {
      assert.ok(
        (RULE_IDS as Record<string, string>)[key],
        `RULE_IDS.${key} must be defined`,
      );
    }
  });

  it('Diagnostic carries rule_id, severity, message and optional recovery', () => {
    const d = {
      rule_id: RULE_IDS.KIND_AMBIGUOUS,
      severity: 'warning' as const,
      message: 'x',
      recovery: 'fix it',
    };
    assert.equal(d.rule_id, 'DECKHTML_KIND_AMBIGUOUS');
    assert.equal(d.severity, 'warning');
    assert.equal(d.recovery, 'fix it');
  });

  it('DiagnosticsCollector dedupes by (rule_id, element_id, slide_id, message)', () => {
    const c = new DiagnosticsCollector();
    c.add(RULE_IDS.IDENTITY_DUPLICATE, 'warning', 'dup', { element_id: 'a' });
    c.add(RULE_IDS.IDENTITY_DUPLICATE, 'warning', 'dup', { element_id: 'a' });
    c.add(RULE_IDS.IDENTITY_DUPLICATE, 'warning', 'dup', { element_id: 'b' });
    assert.equal(c.count, 2);
    assert.equal(c.warningCount, 2);
    assert.equal(c.errorCount, 0);
  });

  it('ConversionError carries a primary diagnostic and aggregates additional ones', () => {
    const primary = {
      rule_id: RULE_IDS.BROWSER_UNAVAILABLE,
      severity: 'error' as const,
      message: 'no browser',
    };
    const extra = {
      rule_id: RULE_IDS.RESOURCE_MISSING,
      severity: 'warning' as const,
      message: 'missing font',
    };
    const err = new ConversionError(primary, [extra]);
    assert.equal(err.primary.rule_id, RULE_IDS.BROWSER_UNAVAILABLE);
    assert.equal(err.diagnostics.length, 2);
    assert.equal(err.hasErrors, true);
    assert.equal(err.name, 'ConversionError');
  });

  it('emits DECKHTML_KIND_AMBIGUOUS for unknown data-pptx-kind during conversion', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });

    // identityDiagnostics carries the KIND_AMBIGUOUS warning.
    const identity = result.identityDiagnostics ?? [];
    const kindDiag = identity.find(
      (d) => d.rule_id === RULE_IDS.KIND_AMBIGUOUS && d.element_id === 'card',
    );
    assert.ok(
      kindDiag,
      `expected DECKHTML_KIND_AMBIGUOUS for card, got: ${JSON.stringify(identity)}`,
    );
    assert.equal(kindDiag!.severity, 'warning');
    assert.ok(kindDiag!.recovery, 'recovery hint should be present');

    // Unified diagnostics (DH-P0-009) must include the same warning.
    const unified = result.diagnostics ?? [];
    const unifiedKind = unified.find(
      (d) => d.rule_id === RULE_IDS.KIND_AMBIGUOUS && d.element_id === 'card',
    );
    assert.ok(
      unifiedKind,
      `expected unified diagnostics to include KIND_AMBIGUOUS, got: ${JSON.stringify(unified)}`,
    );

    // The well-hinted title must NOT produce a KIND_AMBIGUOUS diagnostic.
    const titleDiag = unified.find(
      (d) => d.element_id === 'title' && d.rule_id === RULE_IDS.KIND_AMBIGUOUS,
    );
    assert.equal(titleDiag, undefined);
  });
});
