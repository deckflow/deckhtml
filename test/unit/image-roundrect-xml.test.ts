import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyImageRoundRectToXml } from '../../dist/enhancer/image-roundrect-xml.js';

const rectPic = (name: string) =>
  `<p:pic><p:nvPicPr><p:cNvPr name="${name}"/></p:nvPicPr><p:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
const ellipsePic = (name: string) =>
  `<p:pic><p:nvPicPr><p:cNvPr name="${name}"/></p:nvPicPr><p:spPr><a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;

const enhancement = {
  imageBorderRadiusPx: 64,
  imageWidthInch: 2,
  imageHeightInch: 1,
  elementIndex: 0,
};

const roundRect = '<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val 50000"/></a:avLst></a:prstGeom>';

describe('applyImageRoundRectToXml', () => {
  it('modifies only the second picture for picIndex=1', () => {
    const first = rectPic('background');
    const second = rectPic('content');
    const result = applyImageRoundRectToXml(`<p:spTree>${first}${second}</p:spTree>`, {
      ...enhancement,
      picIndex: 1,
    });

    assert.equal(result, `<p:spTree>${first}${second.replace(/<a:prstGeom[\s\S]*?<\/a:prstGeom>/, roundRect)}</p:spTree>`);
  });

  it('modifies only the first picture for picIndex=0', () => {
    const first = rectPic('background');
    const second = rectPic('content');
    const result = applyImageRoundRectToXml(`<p:spTree>${first}${second}</p:spTree>`, {
      ...enhancement,
      picIndex: 0,
    });

    assert.equal(result, `<p:spTree>${first.replace(/<a:prstGeom[\s\S]*?<\/a:prstGeom>/, roundRect)}${second}</p:spTree>`);
  });

  it('does nothing for an explicit out-of-range picIndex', () => {
    const xml = `<p:spTree>${rectPic('only')}</p:spTree>`;
    assert.equal(applyImageRoundRectToXml(xml, { ...enhancement, picIndex: 2 }), xml);
  });

  it('does nothing when the targeted picture is not rect', () => {
    const xml = `<p:spTree>${rectPic('background')}${ellipsePic('content')}</p:spTree>`;
    assert.equal(applyImageRoundRectToXml(xml, { ...enhancement, picIndex: 1 }), xml);
  });

  it('falls back to the first picture when picIndex is omitted', () => {
    const first = rectPic('first');
    const second = rectPic('second');
    const result = applyImageRoundRectToXml(`<p:spTree>${first}${second}</p:spTree>`, enhancement);

    assert.equal(result, `<p:spTree>${first.replace(/<a:prstGeom[\s\S]*?<\/a:prstGeom>/, roundRect)}${second}</p:spTree>`);
  });
});
