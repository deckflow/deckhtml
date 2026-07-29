import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  detectViewportFromFile,
  detectViewportFromHtml,
  parseDeckCssVariables,
  parseDeckSizeMeta,
  parseStageJson,
  parseWxH,
  resolveConversionViewport,
  DEFAULT_VIEWPORT_WIDTH,
  DEFAULT_VIEWPORT_HEIGHT,
} from '../../dist/utils/viewport.js';

describe('parseWxH', () => {
  it('parses WxH and unicode ×', () => {
    assert.deepEqual(parseWxH('1920x1080'), { width: 1920, height: 1080 });
    assert.deepEqual(parseWxH('landscape-16-9 1920×1080'), {
      width: 1920,
      height: 1080,
    });
  });
});

describe('parseDeckSizeMeta', () => {
  it('reads meta deck-size', () => {
    const html = `<meta name="deck-size" content="landscape-16-9 1920x1080">`;
    assert.deepEqual(parseDeckSizeMeta(html), { width: 1920, height: 1080 });
  });

  it('supports content before name', () => {
    const html = `<meta content="1280x720" name="deck-size">`;
    assert.deepEqual(parseDeckSizeMeta(html), { width: 1280, height: 720 });
  });
});

describe('parseDeckCssVariables', () => {
  it('reads --deck-width / --deck-height', () => {
    const html = `
:root {
  --deck-width: 1920px;
  --deck-height: 1080px;
}`;
    assert.deepEqual(parseDeckCssVariables(html), {
      width: 1920,
      height: 1080,
    });
  });
});

describe('parseStageJson', () => {
  it('reads stage width/height from embedded JSON', () => {
    const html = `"stage": {"id": "landscape-16-9", "width": 1920, "height": 1080}`;
    assert.deepEqual(parseStageJson(html), { width: 1920, height: 1080 });
  });
});

describe('detectViewportFromHtml', () => {
  it('prefers meta over CSS vars', () => {
    const html = `
<meta name="deck-size" content="1920x1080">
<style>:root { --deck-width: 1280px; --deck-height: 720px; }</style>`;
    assert.deepEqual(detectViewportFromHtml(html), {
      width: 1920,
      height: 1080,
    });
  });
});

describe('resolveConversionViewport', () => {
  it('auto-detects from HTML file when options omit size', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deckhtml-vp-'));
    const file = join(dir, 'slide.html');
    writeFileSync(
      file,
      `<!doctype html><meta name="deck-size" content="landscape-16-9 1920x1080">`
    );
    try {
      assert.deepEqual(resolveConversionViewport(file, {}), {
        width: 1920,
        height: 1080,
      });
      assert.deepEqual(
        resolveConversionViewport(file, {
          viewportWidth: 1280,
          viewportHeight: 720,
        }),
        { width: 1280, height: 720 }
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to defaults when undeclared', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deckhtml-vp-'));
    const file = join(dir, 'plain.html');
    writeFileSync(file, `<!doctype html><title>x</title>`);
    try {
      assert.deepEqual(resolveConversionViewport(file, {}), {
        width: DEFAULT_VIEWPORT_WIDTH,
        height: DEFAULT_VIEWPORT_HEIGHT,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('detects SVG viewBox', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deckhtml-vp-'));
    const file = join(dir, 'icon.svg');
    writeFileSync(
      file,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"></svg>`
    );
    try {
      assert.deepEqual(detectViewportFromFile(file), {
        width: 800,
        height: 600,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
