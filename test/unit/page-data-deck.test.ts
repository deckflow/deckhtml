import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  extractPageDataDeck,
  resolvePageDataDeckFromHtml,
  countPageDataSlides,
  countTopLevelSlideHosts,
  buildPageDataHtml,
} from '../../dist/page-data-deck.js';

describe('page-data courseware deck', () => {
  it('extracts and sorts template.page-data pages', () => {
    const html = `
      <template class="page-shared"><link rel="stylesheet" href="x.css"></template>
      <template class="page-data" data-id="2" data-name="B"><div class="page">b</div></template>
      <template class="page-data" data-id="1" data-name="A"><div class="page">a</div></template>
    `;
    const deck = extractPageDataDeck(html);
    assert.ok(deck);
    assert.equal(deck.pages.length, 2);
    assert.equal(deck.pages[0]?.id, 1);
    assert.equal(deck.pages[0]?.name, 'A');
    assert.equal(deck.source, 'document');
    assert.ok(deck.sharedHead.includes('x.css'));
    assert.equal(countPageDataSlides(html), 2);
  });

  it('ignores a single page-data template', () => {
    const html = `<template class="page-data" data-id="1"><div class="page">only</div></template>`;
    assert.equal(extractPageDataDeck(html), null);
    assert.equal(countPageDataSlides(html), 0);
  });

  it('does not treat ordinary .slide decks as page-data', () => {
    const html = `<!DOCTYPE html><html><body>
      <div class="slide" style="width:1280px;height:720px">A</div>
      <div class="slide" style="width:1280px;height:720px">B</div>
      <div class="slide" style="width:1280px;height:720px">C</div>
    </body></html>`;
    assert.equal(extractPageDataDeck(html), null);
    assert.equal(countTopLevelSlideHosts(html), 3);
  });

  it('promotes page-data inside a near-full-viewport iframe srcdoc', () => {
    const inner =
      '<template class="page-data" data-id="1" data-name="封面"><div class="page">封面</div></template>' +
      '<template class="page-data" data-id="2" data-name="目录"><div class="page">目录</div></template>';
    const encoded = inner
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const html = `<!DOCTYPE html><html><head>
      <style>.content-iframe{width:100%;height:100%}</style>
    </head><body>
      <iframe class="content-iframe" srcdoc="${encoded}"></iframe>
    </body></html>`;
    const deck = resolvePageDataDeckFromHtml(html, { width: 1280, height: 720 });
    assert.ok(deck);
    assert.equal(deck.source, 'iframe-srcdoc');
    assert.equal(deck.pages.length, 2);
    assert.equal(deck.pages[0]?.name, '封面');
    assert.equal(countTopLevelSlideHosts(html), 1);
  });

  it('does not promote a small iframe with page-data', () => {
    const inner =
      '<template class="page-data" data-id="1">a</template>' +
      '<template class="page-data" data-id="2">b</template>';
    const encoded = inner
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const html = `<iframe style="width:300px;height:200px" srcdoc="${encoded}"></iframe>`;
    assert.equal(
      resolvePageDataDeckFromHtml(html, { width: 1280, height: 720 }),
      null
    );
  });

  it('keeps outer .slide hosts when a nested iframe also has page-data', () => {
    const inner =
      '<template class="page-data" data-id="1">x</template>' +
      '<template class="page-data" data-id="2">y</template>';
    const encoded = inner
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const html = `<!DOCTYPE html><html><body>
      <div class="slide" style="width:1280px;height:720px">A</div>
      <div class="slide" style="width:1280px;height:720px">B</div>
      <div class="slide" style="width:1280px;height:720px">C</div>
      <iframe class="content-iframe" style="width:100%;height:100%" srcdoc="${encoded}"></iframe>
    </body></html>`;
    const deck = resolvePageDataDeckFromHtml(html, { width: 1280, height: 720 });
    assert.ok(deck && deck.source === 'iframe-srcdoc');
    assert.equal(countTopLevelSlideHosts(html), 3);
  });

  it('builds isolated page HTML at the courseware canvas', () => {
    const html = buildPageDataHtml(
      { id: 1, name: 'A', innerHtml: '<div class="page">hello</div>' },
      '<link href="shared.css">',
      { width: 960, height: 540 }
    );
    assert.match(html, /width:960px/);
    assert.match(html, /height:540px/);
    assert.match(html, /hello/);
    assert.match(html, /shared\.css/);
    assert.match(html, /__CW_MODE__="main"/);
  });
});
