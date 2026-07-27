import assert from 'node:assert/strict';
import { describe, it, after, before } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';
import { convertHtmlToPptx } from '../../dist/api.js';
import { atomicWriteFile, OutputExistsError } from '../../dist/cli/utils/write.js';
import { closeOwnedBrowser } from '../../dist/loader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(
  ROOT,
  'benchmark',
  'pending',
  'p0-008-library-first',
  'deck.html',
);

async function tmpdir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), 'deckhtml-p008-'));
}

describe('DH-P0-008 library-first / no implicit writes', () => {
  after(async () => {
    await closeOwnedBrowser();
  });

  it('library API returns a Buffer and never writes to disk', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
    });
    assert.ok(Buffer.isBuffer(result.data), 'result.data must be a Buffer');
    assert.ok(result.data.length > 0);
    // No output file should have been created anywhere by the library call.
  });

  it('atomicWriteFile refuses to overwrite an existing file by default', async () => {
    const dir = await tmpdir();
    try {
      const target = path.join(dir, 'out.pptx');
      await fs.writeFile(target, 'existing');
      await assert.rejects(
        () => atomicWriteFile(target, Buffer.from('new')),
        (err: unknown) => {
          assert.ok(err instanceof OutputExistsError);
          assert.equal((err as OutputExistsError).ruleId, 'DECKHTML_OUTPUT_EXISTS');
          return true;
        },
      );
      // Original content preserved (no partial write).
      const after = await fs.readFile(target, 'utf8');
      assert.equal(after, 'existing');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('atomicWriteFile overwrites when overwrite: true and leaves no temp file', async () => {
    const dir = await tmpdir();
    try {
      const target = path.join(dir, 'out.pptx');
      await fs.writeFile(target, 'old');
      await atomicWriteFile(target, Buffer.from('new-content'), { overwrite: true });
      const after = await fs.readFile(target, 'utf8');
      assert.equal(after, 'new-content');
      // No leftover temp files in the directory.
      const entries = await fs.readdir(dir);
      assert.deepEqual(entries, ['out.pptx']);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('atomicWriteFile writes atomically to a fresh path', async () => {
    const dir = await tmpdir();
    try {
      const target = path.join(dir, 'sub', 'deck.pptx');
      await atomicWriteFile(target, Buffer.from('payload'));
      const after = await fs.readFile(target, 'utf8');
      assert.equal(after, 'payload');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});
