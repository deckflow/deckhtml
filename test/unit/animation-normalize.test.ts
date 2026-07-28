import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildElementAnimations,
  normalizeAnimeParams,
  normalizeCssAnimation,
  normalizeDeclaredEffect,
  normalizeTrigger,
  parseTimeMs,
  type CssAnimationRaw,
  type KeyframeSnapshot,
} from '../../dist/animation/normalize.js';

function frame(partial: Partial<KeyframeSnapshot>): KeyframeSnapshot {
  return {
    opacity: null,
    translateXPx: 0,
    translateYPx: 0,
    scaleX: 1,
    scaleY: 1,
    rotateDeg: 0,
    hasNonMotionProps: false,
    ...partial,
  };
}

function cssRaw(partial: Partial<CssAnimationRaw>): CssAnimationRaw {
  return {
    name: 'k',
    durationMs: 600,
    delayMs: 0,
    iterationCount: 1,
    first: frame({}),
    last: frame({}),
    ...partial,
  };
}

describe('parseTimeMs', () => {
  it('parses plain numbers as ms', () => {
    assert.equal(parseTimeMs('600'), 600);
  });
  it('parses ms and s suffixes', () => {
    assert.equal(parseTimeMs('600ms'), 600);
    assert.equal(parseTimeMs('0.6s'), 600);
    assert.equal(parseTimeMs('1.5s'), 1500);
  });
  it('rejects invalid input', () => {
    assert.equal(parseTimeMs('fast'), undefined);
    assert.equal(parseTimeMs('-5'), undefined);
    assert.equal(parseTimeMs(''), undefined);
    assert.equal(parseTimeMs(null), undefined);
  });
});

describe('normalizeTrigger', () => {
  it('maps declared words', () => {
    assert.equal(normalizeTrigger('click'), 'onClick');
    assert.equal(normalizeTrigger('with'), 'withPrevious');
    assert.equal(normalizeTrigger('after'), 'afterPrevious');
  });
  it('returns undefined for unknown values', () => {
    assert.equal(normalizeTrigger('hover'), undefined);
    assert.equal(normalizeTrigger(undefined), undefined);
  });
});

describe('normalizeDeclaredEffect', () => {
  it('maps the supported entrance vocabulary', () => {
    assert.deepEqual(normalizeDeclaredEffect('appear'), { kind: 'appear' });
    assert.deepEqual(normalizeDeclaredEffect('fade-in'), { kind: 'fade' });
    assert.deepEqual(normalizeDeclaredEffect('fly-in-left'), {
      kind: 'fly',
      direction: 'left',
    });
    assert.deepEqual(normalizeDeclaredEffect('fly-in-bottom'), {
      kind: 'fly',
      direction: 'bottom',
    });
    assert.deepEqual(normalizeDeclaredEffect('zoom-in'), { kind: 'zoom' });
    assert.deepEqual(normalizeDeclaredEffect('spin'), { kind: 'spin' });
    assert.deepEqual(normalizeDeclaredEffect('spin-half'), {
      kind: 'spin',
      angleDeg: 180,
    });
    assert.deepEqual(normalizeDeclaredEffect('wipe-right'), {
      kind: 'wipe',
      direction: 'right',
    });
  });

  it('is case-insensitive and tolerates underscores', () => {
    assert.deepEqual(normalizeDeclaredEffect('Fly_In_Top'), {
      kind: 'fly',
      direction: 'top',
    });
  });

  it('marks exit and unknown effects as unmapped', () => {
    const exit = normalizeDeclaredEffect('fade-out');
    assert.equal(exit.kind, 'unmapped');
    const unknown = normalizeDeclaredEffect('tada');
    assert.equal(unknown.kind, 'unmapped');
  });
});

describe('normalizeCssAnimation', () => {
  it('detects fade from opacity 0 → visible', () => {
    const effects = normalizeCssAnimation(
      cssRaw({ first: frame({ opacity: 0 }), last: frame({ opacity: 1 }) })
    );
    assert.deepEqual(effects, [{ kind: 'fade' }]);
  });

  it('detects fly direction from net translation', () => {
    const fromLeft = normalizeCssAnimation(
      cssRaw({
        first: frame({ translateXPx: -200, opacity: 0 }),
        last: frame({ translateXPx: 0, opacity: 1 }),
      })
    );
    assert.deepEqual(fromLeft, [
      { kind: 'fade' },
      { kind: 'fly', direction: 'left' },
    ]);

    const fromTop = normalizeCssAnimation(
      cssRaw({
        first: frame({ translateYPx: -300 }),
        last: frame({ translateYPx: 0 }),
      })
    );
    assert.deepEqual(fromTop, [{ kind: 'fly', direction: 'top' }]);
  });

  it('detects zoom from scale and spin from rotation (signed)', () => {
    const zoom = normalizeCssAnimation(
      cssRaw({ first: frame({ scaleX: 0, scaleY: 0 }), last: frame({}) })
    );
    assert.deepEqual(zoom, [{ kind: 'zoom' }]);

    const spin = normalizeCssAnimation(
      cssRaw({ first: frame({ rotateDeg: -180 }), last: frame({ rotateDeg: 0 }) })
    );
    assert.deepEqual(spin, [{ kind: 'spin', angleDeg: 180 }]);
  });

  it('rejects infinite loops, non-motion props and compound animations', () => {
    assert.equal(
      normalizeCssAnimation(cssRaw({ iterationCount: null, first: frame({ opacity: 0 }), last: frame({ opacity: 1 }) }))[0]!
        .kind,
      'unmapped'
    );
    assert.equal(
      normalizeCssAnimation(cssRaw({ first: frame({ hasNonMotionProps: true, opacity: 0 }), last: frame({ opacity: 1 }) }))[0]!
        .kind,
      'unmapped'
    );
    assert.equal(
      normalizeCssAnimation(
        cssRaw({ first: frame({ translateXPx: -100, rotateDeg: -90 }), last: frame({}) })
      )[0]!.kind,
      'unmapped'
    );
  });
});

describe('normalizeAnimeParams', () => {
  it('maps opacity/translate/scale/rotate onto the subset', () => {
    assert.deepEqual(normalizeAnimeParams({ params: { opacity: [0, 1] } }), [
      { kind: 'fade' },
    ]);
    assert.deepEqual(normalizeAnimeParams({ params: { translateX: 250 } }), [
      { kind: 'fly', direction: 'left' },
    ]);
    assert.deepEqual(normalizeAnimeParams({ params: { translateY: { to: -100 } } }), [
      { kind: 'fly', direction: 'bottom' },
    ]);
    assert.deepEqual(normalizeAnimeParams({ params: { scale: { from: 0, to: 1 } } }), [
      { kind: 'zoom' },
    ]);
    assert.deepEqual(normalizeAnimeParams({ params: { rotate: 360 } }), [
      { kind: 'spin', angleDeg: 360 },
    ]);
  });

  it('rejects stagger, motion paths and compound calls', () => {
    assert.equal(
      normalizeAnimeParams({ staggered: true, params: { opacity: [0, 1] } })[0]!.kind,
      'unmapped'
    );
    assert.equal(
      normalizeAnimeParams({ params: { motionPath: '#p', opacity: [0, 1] } })[0]!.kind,
      'unmapped'
    );
    assert.equal(
      normalizeAnimeParams({ params: { translateX: 100, rotate: 90 } })[0]!.kind,
      'unmapped'
    );
  });
});

describe('buildElementAnimations', () => {
  it('prefers declared over captured sources', () => {
    const built = buildElementAnimations({
      declared: { effect: 'fade-in', trigger: 'click' },
      css: cssRaw({ first: frame({ opacity: 0 }), last: frame({ opacity: 1 }) }),
    });
    assert.equal(built.animations.length, 1);
    assert.equal(built.animations[0]!.source, 'declared');
    assert.equal(built.animations[0]!.trigger, 'onClick');
    assert.equal(built.animations[0]!.durationMs, 500);
  });

  it('defaults captured sources to afterPrevious and splits unmapped', () => {
    const built = buildElementAnimations({
      css: cssRaw({ iterationCount: null, first: frame({ opacity: 0 }), last: frame({ opacity: 1 }) }),
    });
    assert.equal(built.animations.length, 0);
    assert.equal(built.unmapped.length, 1);
    assert.equal(built.unmapped[0]!.source, 'css');

    const ok = buildElementAnimations({
      css: cssRaw({
        durationMs: 800,
        delayMs: 120,
        first: frame({ translateXPx: -50 }),
        last: frame({}),
      }),
    });
    assert.equal(ok.animations.length, 1);
    assert.equal(ok.animations[0]!.trigger, 'afterPrevious');
    assert.equal(ok.animations[0]!.durationMs, 800);
    assert.equal(ok.animations[0]!.delayMs, 120);
  });

  it('honours the configured defaultTrigger', () => {
    const built = buildElementAnimations({
      css: cssRaw({ first: frame({ opacity: 0 }), last: frame({ opacity: 1 }) }),
      options: { defaultTrigger: 'onClick' },
    });
    assert.equal(built.animations[0]!.trigger, 'onClick');
  });
});
