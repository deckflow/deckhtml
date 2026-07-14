import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  deriveOutputPath,
  resolveOutputFormat,
} from '../../dist/cli/utils/input.js';

describe('resolveOutputFormat', () => {
  it('defaults to pptx when -o is omitted', () => {
    assert.equal(resolveOutputFormat(), 'pptx');
    assert.equal(resolveOutputFormat(undefined), 'pptx');
  });

  it('infers format from -o extension', () => {
    assert.equal(resolveOutputFormat('deck.pptx'), 'pptx');
    assert.equal(resolveOutputFormat('/tmp/out.PDF'), 'pdf');
    assert.equal(resolveOutputFormat('frames.PNG'), 'png');
  });

  it('rejects missing or unsupported extensions', () => {
    assert.throws(() => resolveOutputFormat('frames'), /Cannot infer format/);
    assert.throws(
      () => resolveOutputFormat('deck.docx'),
      /Unsupported output extension/
    );
  });
});

describe('deriveOutputPath', () => {
  it('resolves explicit -o path', () => {
    const out = deriveOutputPath(['/a/b.html'], 'png', 'frames.png');
    assert.ok(out.endsWith('frames.png'));
  });

  it('defaults png path from input basename', () => {
    const out = deriveOutputPath(['/a/b.html'], 'png');
    assert.equal(out, '/a/b.png');
  });
});
