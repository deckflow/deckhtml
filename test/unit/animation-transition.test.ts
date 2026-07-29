import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { convertHtmlToPptx } from '../../dist/api.js';
import { closeOwnedBrowser } from '../../dist/loader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'html', 'animation-transition.html');

describe('class-gated CSS transition entrances', () => {
  after(async () => {
    await closeOwnedBrowser();
  });

  it('exports fade + fly timing for data-enter / is-entered transitions', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });

    const zip = await JSZip.loadAsync(result.data);
    const slide = zip.file('ppt/slides/slide1.xml');
    assert.ok(slide, 'slide1.xml missing');
    const xml = await slide.async('string');

    assert.ok(xml.includes('<p:timing>'), 'expected p:timing for entrance transitions');
    assert.ok(xml.includes('filter="fade"'), 'expected fade effect from opacity 0→1');
    assert.ok(xml.includes('ppt_y'), 'expected vertical fly-in (ppt_y) from translateY entrance');

    // Animated enter elements become animation groups (dh-grp-*).
    assert.match(xml, /name="dh-grp-tr-title"/);
    assert.match(xml, /name="dh-grp-tr-lead"/);
    assert.match(xml, /name="dh-grp-tr-card"/);
    // Staggered transition-delay under .is-entered is preserved.
    assert.ok(xml.includes('delay="90"'), 'expected 90ms stagger for data-enter=2');
    assert.ok(xml.includes('delay="180"'), 'expected 180ms stagger for data-enter=3');
    // Hover-only color transition is not an animation group target.
    assert.ok(xml.includes('name="tr-hover"'), 'hover chip still present as a shape');
    assert.ok(!xml.includes('dh-grp-tr-hover'), 'hover chip must not get an entrance animation group');
  });
});
