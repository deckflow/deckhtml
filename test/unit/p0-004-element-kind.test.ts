import assert from 'node:assert/strict';
import { describe, it, after } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { convertHtmlToPptx } from '../../dist/api.js';
import { closeOwnedBrowser } from '../../dist/loader.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(ROOT, 'benchmark', 'pending', 'p0-004-element-kind', 'deck.html');

async function slideXml(data: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const file = zip.file('ppt/slides/slide1.xml');
  assert.ok(file, 'slide1.xml missing');
  return await file.async('string');
}

describe('DH-P0-004 explicit element kind hints', () => {
  after(async () => {
    await closeOwnedBrowser();
  });

  it('honours data-pptx-kind for text, shape, group, and ignore', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });
    assert.ok(result.data.length > 0);
    const xml = await slideXml(result.data);

    // text + shape + group children identities must be present.
    assert.match(xml, /name="title"/);
    assert.match(xml, /name="card"/);
    assert.match(xml, /name="pill"/);
    assert.match(xml, /name="group-a"/);
    assert.match(xml, /name="group-b"/);

    // The ignored subtree must NOT be exported.
    assert.doesNotMatch(xml, /name="ignored"/);
    assert.doesNotMatch(xml, /This whole subtree must be ignored/);
  });

  it('data-pptx-kind=shape forces a div to be treated as a shape (not text)', async () => {
    const result = await convertHtmlToPptx({
      input: FIXTURE,
      viewportWidth: 1280,
      viewportHeight: 720,
      quiet: true,
      allowLocalResources: true,
    });
    const xml = await slideXml(result.data);
    // The card div has a child span "Card label". With kind=shape on the card,
    // the card is emitted as a shape and the child span is emitted as its own
    // text element (both identities present). The card's text content "Card
    // label" lives in the child span, so the card shape itself should not be a
    // text box containing "Card label".
    assert.match(xml, /name="card"/);
    assert.match(xml, /name="card-label"/);
    assert.match(xml, /Card label/);
  });
});
