import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAnimationTimingToXml } from '../../dist/enhancer/timing-xml.js';
import type { ElementAnimation, SlideAnimationSpec } from '../../dist/types.js';

const SLIDE_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
  '<p:cSld><p:spTree>' +
  '<p:sp><p:nvSpPr><p:cNvPr id="2" name="title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' +
  '<p:spPr/><p:txBody><a:p><a:r><a:t>Hello</a:t></a:r></a:p></p:txBody></p:sp>' +
  '<p:sp><p:nvSpPr><p:cNvPr id="3" name="dh-anim-0-1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' +
  '<p:spPr/><p:txBody><a:p><a:r><a:t>World</a:t></a:r></a:p></p:txBody></p:sp>' +
  '</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1"/></p:clrMapOvr>' +
  '</p:sld>';

function anim(partial: Partial<ElementAnimation>): ElementAnimation {
  return {
    source: 'declared',
    effect: { kind: 'fade' },
    trigger: 'onClick',
    durationMs: 500,
    delayMs: 0,
    ...partial,
  };
}

function spec(entries: SlideAnimationSpec['entries']): SlideAnimationSpec {
  return { entries };
}

function apply(slideXml: string, spec: SlideAnimationSpec): string {
  return applyAnimationTimingToXml(slideXml, {
    slideIndex: 0,
    elementIndex: 0,
    type: 'animation',
    animationData: spec,
  });
}

/** Lightweight tag-balance check over p:/a: elements (catches broken nesting). */
function assertBalancedTags(xml: string): void {
  const stack: string[] = [];
  const re = /<(\/?)([pa]:[A-Za-z]+)((?:"[^"]*"|'[^']*'|[^"'/>])*)(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const [, closing, tag, , selfClose] = m;
    if (selfClose) continue;
    if (closing) {
      const top = stack.pop();
      assert.equal(top, tag, `mismatched closing tag </${tag}> (open: ${top ?? 'none'})`);
    } else {
      stack.push(tag);
    }
  }
  assert.deepEqual(stack, [], `unclosed tags: ${stack.join(', ')}`);
}

describe('applyAnimationTimingToXml', () => {
  it('returns the slide unchanged for empty specs', () => {
    assert.equal(apply(SLIDE_XML, spec([])), SLIDE_XML);
  });

  it('injects a timing tree before </p:sld> and resolves spids via cNvPr name', () => {
    const out = apply(
      SLIDE_XML,
      spec([{ objectName: 'title', animations: [anim({})] }])
    );
    assertBalancedTags(out);
    assert.ok(out.includes('<p:timing>'), 'timing injected');
    assert.ok(
      out.indexOf('<p:timing>') > out.indexOf('</p:cSld>'),
      'timing comes after cSld'
    );
    assert.ok(
      out.indexOf('<p:timing>') < out.indexOf('</p:sld>'),
      'timing inside p:sld'
    );
    assert.ok(out.includes('<p:spTgt spid="2"/>'), 'spid resolved from name "title"');
    assert.ok(out.includes('presetID="10" presetClass="entr"'), 'fade preset');
    assert.ok(out.includes('filter="fade"'), 'fade filter behavior');
    assert.ok(out.includes('nodeType="clickEffect"'), 'click trigger node type');
    assert.ok(out.includes('<p:bldP spid="2" grpId="0" animBg="1"/>'), 'bldLst entry');
    assert.ok(out.includes('delay="indefinite"'), 'click group waits for click');
  });

  it('skips unknown object names without corrupting the slide', () => {
    const out = apply(
      SLIDE_XML,
      spec([{ objectName: 'missing', animations: [anim({})] }])
    );
    assert.equal(out, SLIDE_XML);
  });

  it('keeps cTn ids unique across the whole timing tree', () => {
    const out = apply(
      SLIDE_XML,
      spec([
        {
          objectName: 'title',
          animations: [
            anim({ effect: { kind: 'fly', direction: 'left' } }),
            anim({ effect: { kind: 'fade' }, trigger: 'withPrevious' }),
          ],
        },
        {
          objectName: 'dh-anim-0-1',
          animations: [anim({ effect: { kind: 'zoom' }, trigger: 'afterPrevious' })],
        },
      ])
    );
    assertBalancedTags(out);
    const ids = [...out.matchAll(/<p:cTn id="(\d+)"/g)].map((m) => m[1]!);
    assert.equal(new Set(ids).size, ids.length, `duplicate cTn ids: ${ids}`);
    assert.ok(out.includes('0-#ppt_w/2'), 'fly-from-left start formula');
    assert.ok(out.includes('attrName>ppt_w<'), 'zoom animates width');
    assert.ok(out.includes('<p:bldP spid="3"'), 'second element in bldLst');
  });

  it('auto-plays afterPrevious sequences without a click wait', () => {
    const out = apply(
      SLIDE_XML,
      spec([
        {
          objectName: 'title',
          animations: [
            anim({ trigger: 'afterPrevious', durationMs: 600 }),
            anim({
              trigger: 'afterPrevious',
              durationMs: 400,
              effect: { kind: 'spin' },
            }),
          ],
        },
      ])
    );
    assert.ok(!out.includes('delay="indefinite"'), 'no click wait for auto groups');
    assert.ok(out.includes('nodeType="afterEffect"'));
    // Second effect waits for the first (600ms) in the after-chain.
    assert.ok(out.includes('<p:cond delay="600"/>'), 'cumulative after delay');
    assert.ok(out.includes('<p:animRot by="21600000">'), 'spin defaults to 360°');
  });

  it('honours spin angle and wipe direction', () => {
    const out = apply(
      SLIDE_XML,
      spec([
        {
          objectName: 'title',
          animations: [
            anim({ effect: { kind: 'spin', angleDeg: -90 } }),
            anim({
              effect: { kind: 'wipe', direction: 'right' },
              trigger: 'withPrevious',
            }),
          ],
        },
      ])
    );
    assert.ok(out.includes('<p:animRot by="-5400000">'), 'signed spin angle');
    assert.ok(out.includes('filter="wipe(right)"'), 'wipe direction filter');
    assert.ok(out.includes('presetID="22"'), 'wipe preset');
    assert.ok(out.includes('nodeType="withEffect"'), 'withPrevious node type');
  });

  it('inserts timing before p:extLst when the slide already has one', () => {
    const withExt = SLIDE_XML.replace('</p:sld>', '<p:extLst><p:ext uri="x"/></p:extLst></p:sld>');
    const out = apply(
      withExt,
      spec([{ objectName: 'title', animations: [anim({})] }])
    );
    assert.ok(
      out.indexOf('<p:timing>') < out.indexOf('<p:extLst>'),
      'timing precedes extLst per schema order'
    );
  });

  it('matches XML-escaped object names', () => {
    const escaped = SLIDE_XML.replace('name="title"', 'name="a &amp; b"');
    const out = apply(
      escaped,
      spec([{ objectName: 'a & b', animations: [anim({})] }])
    );
    assert.ok(out.includes('<p:spTgt spid="2"/>'), 'escaped name resolved');
  });
});
