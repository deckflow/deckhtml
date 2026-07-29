import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  collectLocalStylesheetHrefs,
  detectViewportFromFile,
  detectViewportFromHtml,
  parseDeckCssVariables,
  parseDeckSizeMeta,
  parseFixedSlideHostSize,
  parseStageJson,
  parseViewportMeta,
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

describe('parseViewportMeta', () => {
  it('reads numeric width and defaults height to 16:9', () => {
    const html = `<meta name="viewport" content="width=1920, initial-scale=1" />`;
    assert.deepEqual(parseViewportMeta(html), { width: 1920, height: 1080 });
  });

  it('ignores device-width', () => {
    const html = `<meta name="viewport" content="width=device-width, initial-scale=1">`;
    assert.equal(parseViewportMeta(html), null);
  });

  it('supports explicit height', () => {
    const html = `<meta content="width=1600, height=900" name="viewport">`;
    assert.deepEqual(parseViewportMeta(html), { width: 1600, height: 900 });
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

  it('reads --page-width / --page-height', () => {
    const css = `
:root {
  --page-width: 1920px;
  --page-height: 1080px;
}`;
    assert.deepEqual(parseDeckCssVariables(css), {
      width: 1920,
      height: 1080,
    });
  });

  it('reads --slide-width / --slide-height', () => {
    const css = `:root { --slide-width: 1280px; --slide-height: 720px; }`;
    assert.deepEqual(parseDeckCssVariables(css), {
      width: 1280,
      height: 720,
    });
  });
});

describe('parseFixedSlideHostSize', () => {
  it('reads .slide-container fixed px', () => {
    const css = `.slide-container { width: 1280px; height: 720px; position: relative; }`;
    assert.deepEqual(parseFixedSlideHostSize(css), {
      width: 1280,
      height: 720,
    });
  });

  it('reads .slide-page fixed px', () => {
    const css = `.slide-page { width: 1920px; height: 1080px; overflow: hidden; }`;
    assert.deepEqual(parseFixedSlideHostSize(css), {
      width: 1920,
      height: 1080,
    });
  });

  it('ignores tiny decorative boxes', () => {
    const css = `.slide { width: 10px; height: 10px; }`;
    assert.equal(parseFixedSlideHostSize(css), null);
  });
});

describe('parseStageJson', () => {
  it('reads stage width/height from embedded JSON', () => {
    const html = `"stage": {"id": "landscape-16-9", "width": 1920, "height": 1080}`;
    assert.deepEqual(parseStageJson(html), { width: 1920, height: 1080 });
  });
});

describe('detectViewportFromHtml', () => {
  it('prefers meta deck-size over CSS vars', () => {
    const html = `
<meta name="deck-size" content="1920x1080">
<style>:root { --deck-width: 1280px; --deck-height: 720px; }</style>`;
    assert.deepEqual(detectViewportFromHtml(html), {
      width: 1920,
      height: 1080,
    });
  });

  it('prefers CSS size vars over viewport meta', () => {
    const html = `
<meta name="viewport" content="width=1280, initial-scale=1">
<style>:root { --page-width: 1920px; --page-height: 1080px; }</style>`;
    assert.deepEqual(detectViewportFromHtml(html), {
      width: 1920,
      height: 1080,
    });
  });

  it('falls back to viewport meta when no deck-size or CSS vars', () => {
    const html = `<!doctype html><meta name="viewport" content="width=1920, initial-scale=1"><title>x</title>`;
    assert.deepEqual(detectViewportFromHtml(html), {
      width: 1920,
      height: 1080,
    });
  });
});

describe('linked stylesheets', () => {
  it('collects local stylesheet hrefs and skips remote', () => {
    const html = `
<link rel="stylesheet" href="../runtime/page.css" />
<link rel="stylesheet" href="https://cdn.example/font.css" />
<link rel="icon" href="favicon.ico" />`;
    assert.deepEqual(collectLocalStylesheetHrefs(html), [
      '../runtime/page.css',
    ]);
  });

  it('detects --page-width from linked local CSS', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deckhtml-vp-css-'));
    const runtime = join(dir, 'runtime');
    const pages = join(dir, 'pages');
    mkdirSync(runtime);
    mkdirSync(pages);
    writeFileSync(
      join(runtime, 'page.css'),
      `:root { --page-width: 1920px; --page-height: 1080px; }`
    );
    const file = join(pages, 'page-001.html');
    writeFileSync(
      file,
      `<!doctype html>
<html><head>
<meta name="viewport" content="width=1920, initial-scale=1" />
<link rel="stylesheet" href="../runtime/page.css" />
</head><body><article class="slide-page"></article></body></html>`
    );
    try {
      assert.deepEqual(detectViewportFromFile(file), {
        width: 1920,
        height: 1080,
      });
      // CSS vars from linked sheet beat viewport meta (same result here).
      assert.deepEqual(resolveConversionViewport(file, {}), {
        width: 1920,
        height: 1080,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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
