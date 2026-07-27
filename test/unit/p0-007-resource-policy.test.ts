import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import os from 'node:os';
import { convertHtmlToPptx } from '../../dist/api.js';
import {
  isResourceRequestAllowed,
  resolveDocumentUrl,
  type ResourcePolicy,
  type ResourceDiagnostic,
} from '../../dist/utils/resource-policy.js';
import { closeOwnedBrowser } from '../../dist/loader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE_DIR = path.join(ROOT, 'benchmark', 'pending', 'p0-007-resource-policy');
const FIXTURE = path.join(FIXTURE_DIR, 'deck.html');

function policy(p: ResourcePolicy): Required<Pick<ResourcePolicy, 'network' | 'allowedRoots' | 'followSymlinks' | 'allowRemoteFonts' | 'allowRemoteImages' | 'allowRemoteScripts' | 'allowRemoteStyles'>> {
  return {
    network: p.network ?? 'allow',
    allowedRoots: p.allowedRoots ?? [],
    followSymlinks: p.followSymlinks ?? false,
    allowRemoteFonts: p.allowRemoteFonts ?? (p.network === 'allow'),
    allowRemoteImages: p.allowRemoteImages ?? (p.network === 'allow'),
    allowRemoteScripts: p.allowRemoteScripts ?? (p.network === 'allow'),
    allowRemoteStyles: p.allowRemoteStyles ?? (p.network === 'allow'),
  };
}

describe('DH-P0-007 network & local resource policy', () => {
  after(async () => {
    await closeOwnedBrowser();
  });

  it('blocks http(s) requests when network: deny and emits a diagnostic', () => {
    const diagnostics: ResourceDiagnostic[] = [];
    const p = policy({ network: 'deny', allowedRoots: [] });
    const allowed = isResourceRequestAllowed(
      'https://example.com/img.png',
      'file:///tmp/doc.html',
      p,
      diagnostics,
      'image',
    );
    assert.equal(allowed, false);
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0]!.rule_id, 'DECKHTML_REMOTE_RESOURCE_BLOCKED');
    assert.equal(diagnostics[0]!.severity, 'error');
    assert.match(diagnostics[0]!.message, /Remote image/);
  });

  it('blocks ws/wss when network: deny', () => {
    const diagnostics: ResourceDiagnostic[] = [];
    const p = policy({ network: 'deny', allowedRoots: [] });
    assert.equal(
      isResourceRequestAllowed('wss://example.com/socket', 'file:///tmp/doc.html', p, diagnostics, 'other'),
      false,
    );
    assert.equal(diagnostics[0]!.rule_id, 'DECKHTML_REMOTE_RESOURCE_BLOCKED');
    assert.match(diagnostics[0]!.message, /WebSocket/);
  });

  it('allows remote images but not remote scripts when allowRemoteImages: true / allowRemoteScripts: false', () => {
    const diagnostics: ResourceDiagnostic[] = [];
    const p = policy({ network: 'deny', allowRemoteImages: true, allowRemoteScripts: false, allowedRoots: [] });
    assert.equal(
      isResourceRequestAllowed('https://example.com/a.png', 'file:///tmp/doc.html', p, diagnostics, 'image'),
      true,
    );
    assert.equal(
      isResourceRequestAllowed('https://example.com/a.js', 'file:///tmp/doc.html', p, diagnostics, 'script'),
      false,
    );
    assert.equal(diagnostics.length, 1);
    assert.equal(diagnostics[0]!.rule_id, 'DECKHTML_REMOTE_RESOURCE_BLOCKED');
  });

  it('rejects file:// outside allowedRoots', () => {
    const diagnostics: ResourceDiagnostic[] = [];
    const p = policy({ network: 'allow', allowedRoots: ['/safe/root'] });
    assert.equal(
      isResourceRequestAllowed('file:///other/path/file.png', 'file:///safe/root/doc.html', p, diagnostics, 'image'),
      false,
    );
    assert.equal(diagnostics[0]!.rule_id, 'DECKHTML_FILE_OUTSIDE_ROOTS');
  });

  it('rejects path traversal (..) even when the root would match', () => {
    const diagnostics: ResourceDiagnostic[] = [];
    const p = policy({ network: 'allow', allowedRoots: ['/safe/root'] });
    assert.equal(
      isResourceRequestAllowed('file:///safe/root/../../etc/passwd', 'file:///safe/root/doc.html', p, diagnostics, 'image'),
      false,
    );
    assert.equal(diagnostics[0]!.rule_id, 'DECKHTML_PATH_TRAVERSAL');
  });

  it('rejects symlinks when followSymlinks: false', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deckhtml-symlink-'));
    try {
      const realFile = path.join(dir, 'real.png');
      const linkFile = path.join(dir, 'link.png');
      await fs.writeFile(realFile, 'data');
      await fs.symlink(realFile, linkFile);
      const diagnostics: ResourceDiagnostic[] = [];
      const p = policy({ network: 'allow', allowedRoots: [dir], followSymlinks: false });
      assert.equal(
        isResourceRequestAllowed(`file://${linkFile}`, `file://${path.join(dir, 'doc.html')}`, p, diagnostics, 'image'),
        false,
      );
      assert.equal(diagnostics[0]!.rule_id, 'DECKHTML_SYMLINK_ESCAPE');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('allows file:// under an allowed root', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'deckhtml-allow-'));
    try {
      const file = path.join(dir, 'img.png');
      await fs.writeFile(file, 'data');
      const diagnostics: ResourceDiagnostic[] = [];
      const p = policy({ network: 'deny', allowedRoots: [dir] });
      assert.equal(
        isResourceRequestAllowed(`file://${file}`, `file://${path.join(dir, 'doc.html')}`, p, diagnostics, 'image'),
        true,
      );
      assert.equal(diagnostics.length, 0);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it('end-to-end: convert with network: deny surfaces remote-resource diagnostics', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      resourcePolicy: { network: 'deny', allowedRoots: [FIXTURE_DIR] },
    });
    assert.ok(result.data.length > 0);
    const diags = result.resourceDiagnostics ?? [];
    const remoteBlocked = diags.filter((d) => d.rule_id === 'DECKHTML_REMOTE_RESOURCE_BLOCKED');
    assert.ok(remoteBlocked.length >= 1, 'expected at least one remote-blocked diagnostic');
    assert.ok(
      remoteBlocked.some((d) => /example\.com/.test(d.url)),
      'expected the example.com image to be reported',
    );
  });

  it('end-to-end: convert with legacy allowLocalResources: true stays loose (no diagnostics)', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });
    assert.ok(result.data.length > 0);
    // Loose mode does not register a route handler, so no diagnostics are collected.
    const diags = result.resourceDiagnostics ?? [];
    assert.equal(diags.filter((d) => d.rule_id === 'DECKHTML_FILE_OUTSIDE_ROOTS').length, 0);
  });
});
