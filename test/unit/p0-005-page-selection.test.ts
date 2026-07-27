import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { convertHtmlToPptx } from '../../dist/api.js';
import { closeOwnedBrowser } from '../../dist/loader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'benchmark', 'pending', 'p0-005-page-selection', 'deck.html');

async function slideXml(data: Buffer, slideNum: number): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const file = zip.file(`ppt/slides/slide${slideNum}.xml`);
  assert.ok(file, `slide${slideNum}.xml missing`);
  return await file.async('string');
}

describe('DH-P0-005 page selection & runtime exclusion', () => {
  after(async () => {
    await closeOwnedBrowser();
  });

  it('excludes runtime navigation via --exclude and data-pptx-kind=ignore', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
      excludeSelector: '.player-nav, .toolbar',
    });
    assert.equal(result.slideCount, 2, 'expected two slides from the two .slide-container sections');

    const slide1 = await slideXml(result.data, 1);
    const slide2 = await slideXml(result.data, 2);

    // The navigation text must NOT appear in any slide.
    for (const xml of [slide1, slide2]) {
      assert.doesNotMatch(xml, /to navigate/, 'navigation hint leaked into PPTX');
      assert.doesNotMatch(xml, /Host toolbar/, 'ignored toolbar leaked into PPTX');
    }

    // Real slide content must still be present.
    assert.match(slide1, /Slide One/);
    assert.match(slide2, /Slide Two/);
  });

  it('without excludeSelector, the navigation text leaks into the output (regression baseline)', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });
    assert.equal(result.slideCount, 2);
    const slide1 = await slideXml(result.data, 1);
    // The nav lives inside slide 1 and is only removed by excludeSelector, so
    // without it the nav text leaks. (The toolbar carries data-pptx-kind=ignore
    // which is a declarative opt-out and is always honored, so it never leaks.)
    assert.match(slide1, /to navigate/, 'expected nav text to leak when no excludeSelector is set');
  });
});
