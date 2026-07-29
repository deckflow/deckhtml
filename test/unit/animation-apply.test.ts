import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyAnimationsToElements } from '../../dist/animation/apply.js';
import type { ElementInfo } from '../../dist/types.js';

function el(partial: Partial<ElementInfo> & { animationRaw?: ElementInfo['animationRaw'] }): ElementInfo {
  return {
    type: 'shape',
    tag: 'div',
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    styles: {} as ElementInfo['styles'],
    ...partial,
  };
}

describe('applyAnimationsToElements', () => {
  it('maps anime fade captures onto elements', () => {
    const elements = [
      el({
        elementId: 'a',
        animationRaw: {
          animeCallIndices: [0],
          animeRaws: [{ params: { opacity: [0, 1] }, durationMs: 500, delayMs: 0 }],
        },
      }),
    ];
    const diags = applyAnimationsToElements(elements, { animationsOption: true });
    assert.equal(diags.length, 0);
    assert.equal(elements[0].animations?.length, 1);
    assert.equal(elements[0].animations?.[0].effect.kind, 'fade');
    assert.equal(elements[0].animations?.[0].trigger, 'afterPrevious');
    assert.equal(elements[0].animationRaw, undefined);
  });

  it('plays co-targeted anime groups with withPrevious', () => {
    const fadeCall = { params: { opacity: [0, 1] }, durationMs: 500, delayMs: 0 };
    const elements = [
      el({
        animationGroupId: 'stage-1',
        animationRaw: { animeCallIndices: [1], animeRaws: [fadeCall] },
      }),
      el({
        animationGroupId: 'stage-1',
        animationRaw: { animeCallIndices: [1], animeRaws: [fadeCall] },
      }),
      el({
        animationGroupId: 'stage-2',
        animationRaw: { animeCallIndices: [1], animeRaws: [fadeCall] },
      }),
    ];
    applyAnimationsToElements(elements, { animationsOption: true });
    assert.equal(elements[0].animations?.[0].trigger, 'afterPrevious');
    assert.equal(elements[1].animations?.[0].trigger, 'afterPrevious'); // same group owner
    assert.equal(elements[2].animations?.[0].trigger, 'withPrevious'); // sibling group, same call
  });

  it('skips when animationsOption is false', () => {
    const elements = [
      el({
        elementId: 'a',
        animationRaw: {
          animeCallIndices: [0],
          animeRaws: [{ params: { opacity: [0, 1] }, durationMs: 400 }],
        },
      }),
    ];
    applyAnimationsToElements(elements, { animationsOption: false });
    assert.equal(elements[0].animations, undefined);
    assert.equal(elements[0].animationRaw, undefined);
  });
});
