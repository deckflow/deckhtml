import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildTransitionXml,
  getSlideTransitionEffect,
  listSlideTransitionEffectNames,
  SLIDE_TRANSITION_EFFECTS,
} from '../../dist/slide-transition/catalog.js';
import { resolveSlideTransition, resolveSlideTransitionPlan } from '../../dist/slide-transition/resolve.js';
import {
  applySlideTransitionToXml,
  injectTransitionXml,
} from '../../dist/enhancer/transition-xml.js';

const SLIDE_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
  'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
  '<p:cSld><p:spTree>' +
  '<p:sp><p:nvSpPr><p:cNvPr id="2" name="title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>' +
  '<p:spPr/><p:txBody><a:p><a:r><a:t>Hello</a:t></a:r></a:p></p:txBody></p:sp>' +
  '</p:spTree></p:cSld><p:clrMapOvr><a:overrideClrMapping bg1="lt1"/></p:clrMapOvr>' +
  '</p:sld>';

const SLIDE_WITH_TIMING =
  SLIDE_XML.replace(
    '</p:clrMapOvr>',
    '</p:clrMapOvr><p:timing><p:tnLst/></p:timing>'
  );

describe('slide transition catalog', () => {
  it('exposes a stable non-empty effect list', () => {
    const names = listSlideTransitionEffectNames();
    assert.ok(names.length >= 15);
    assert.ok(names.includes('fade'));
    assert.ok(names.includes('push'));
    assert.ok(names.includes('wipe'));
    assert.ok(names.includes('dissolve'));
    assert.equal(names.length, SLIDE_TRANSITION_EFFECTS.length);
  });

  it('builds OOXML for fade / push / wipe', () => {
    const fade = getSlideTransitionEffect('fade')!;
    const push = getSlideTransitionEffect('push')!;
    const wipe = getSlideTransitionEffect('wipe')!;

    assert.match(
      buildTransitionXml(fade, { speed: 'med', params: { speed: 'med', thruBlk: false } }),
      /<p:transition spd="med"><p:fade thruBlk="0"\/><\/p:transition>/
    );
    assert.match(
      buildTransitionXml(push, { speed: 'fast', params: { speed: 'fast', dir: 'r' } }),
      /<p:transition spd="fast"><p:push dir="r"\/><\/p:transition>/
    );
    assert.match(
      buildTransitionXml(wipe, { params: { speed: 'med', dir: 'd' } }),
      /<p:wipe dir="d"\/>/
    );
  });
});

describe('resolveSlideTransition', () => {
  it('disables when false / none', () => {
    assert.equal(resolveSlideTransition(false), null);
    assert.equal(resolveSlideTransition('none'), null);
    assert.equal(resolveSlideTransition({ enabled: false }), null);
  });

  it('uses a named effect when specified', () => {
    const resolved = resolveSlideTransition('fade');
    assert.ok(resolved);
    assert.equal(resolved!.effect, 'fade');
    assert.ok(resolved!.xml.includes('<p:fade'));
  });

  it('rejects unknown effect names', () => {
    assert.throws(
      () => resolveSlideTransition('not-a-real-effect'),
      /Unknown slide transition/
    );
  });
});

describe('resolveSlideTransitionPlan (per-slide random)', () => {
  it('fixed mode repeats the same effect', () => {
    const plan = resolveSlideTransitionPlan('wipe');
    assert.equal(plan.mode, 'fixed');
    if (plan.mode !== 'fixed') return;
    assert.equal(plan.transition.effect, 'wipe');
  });

  it('random mode draws independently per slide (seeded)', () => {
    const plan = resolveSlideTransitionPlan({ effect: 'random', seed: 42 });
    assert.equal(plan.mode, 'random');
    if (plan.mode !== 'random') return;

    const draws = [plan.next(), plan.next(), plan.next(), plan.next(), plan.next(), plan.next()];
    const effects = draws.map((d) => d.effect);
    for (const name of effects) {
      assert.ok(listSlideTransitionEffectNames().includes(name));
      assert.notEqual(name, 'random');
    }
    // With a decent pool, six draws should not all be identical.
    assert.ok(
      new Set(effects).size > 1,
      `expected varied effects, got ${effects.join(', ')}`
    );

    // Same seed → same sequence
    const plan2 = resolveSlideTransitionPlan({ effect: 'random', seed: 42 });
    assert.equal(plan2.mode, 'random');
    if (plan2.mode !== 'random') return;
    const again = [plan2.next(), plan2.next(), plan2.next(), plan2.next(), plan2.next(), plan2.next()];
    assert.deepEqual(
      again.map((d) => d.xml),
      draws.map((d) => d.xml)
    );
  });

  it('disabled mode', () => {
    assert.equal(resolveSlideTransitionPlan(false).mode, 'disabled');
  });

  it('cycles through comma-separated effect names', () => {
    const plan = resolveSlideTransitionPlan('fade,push,wipe');
    assert.equal(plan.mode, 'cycle');
    if (plan.mode !== 'cycle') return;
    assert.deepEqual(plan.effects, ['fade', 'push', 'wipe']);
    assert.equal(plan.next().effect, 'fade');
    assert.equal(plan.next().effect, 'push');
    assert.equal(plan.next().effect, 'wipe');
    assert.equal(plan.next().effect, 'fade'); // wraps
  });

  it('accepts effects array on options object', () => {
    const plan = resolveSlideTransitionPlan({ effects: ['dissolve', 'zoom'] });
    assert.equal(plan.mode, 'cycle');
    if (plan.mode !== 'cycle') return;
    assert.deepEqual(plan.effects, ['dissolve', 'zoom']);
  });

  it('rejects mixing random into a cycle list', () => {
    assert.throws(
      () => resolveSlideTransitionPlan('fade,random'),
      /cannot be mixed/
    );
  });
});

describe('injectTransitionXml', () => {
  it('injects after clrMapOvr when no timing present', () => {
    const out = injectTransitionXml(
      SLIDE_XML,
      '<p:transition spd="med"><p:fade thruBlk="0"/></p:transition>'
    );
    assert.ok(out.includes('<p:transition spd="med">'));
    assert.ok(
      out.indexOf('<p:transition') > out.indexOf('</p:clrMapOvr>'),
      'transition after clrMapOvr'
    );
    assert.ok(
      out.indexOf('<p:transition') < out.indexOf('</p:sld>'),
      'transition inside sld'
    );
  });

  it('places transition before existing timing', () => {
    const out = injectTransitionXml(
      SLIDE_WITH_TIMING,
      '<p:transition spd="slow"><p:push dir="l"/></p:transition>'
    );
    assert.ok(out.indexOf('<p:transition') < out.indexOf('<p:timing'));
    assert.ok(out.includes('<p:push dir="l"/>'));
  });

  it('replaces a prior transition', () => {
    const once = injectTransitionXml(
      SLIDE_XML,
      '<p:transition spd="med"><p:fade thruBlk="0"/></p:transition>'
    );
    const twice = injectTransitionXml(
      once,
      '<p:transition spd="fast"><p:wipe dir="u"/></p:transition>'
    );
    assert.equal((twice.match(/<p:transition/g) || []).length, 1);
    assert.ok(twice.includes('<p:wipe dir="u"/>'));
    assert.ok(!twice.includes('<p:fade'));
  });

  it('applySlideTransitionToXml reads enhancement payload', () => {
    const out = applySlideTransitionToXml(SLIDE_XML, {
      slideIndex: 0,
      elementIndex: 0,
      type: 'slideTransition',
      slideTransitionXml:
        '<p:transition spd="med"><p:dissolve/></p:transition>',
    });
    assert.ok(out.includes('<p:dissolve/>'));
  });
});
