import {
  AnimationConversionOptions,
  AnimationTrigger,
  ElementAnimation,
  NormalizedAnimationEffect,
} from '../types';

/**
 * Normalizes animation declarations from capture sources (explicit data
 * attributes, CSS @keyframes, class-gated CSS transitions, intercepted anime.js
 * calls) onto the cross-player stable PPTX entrance subset:
 * appear / fade / fly / zoom / spin / wipe.
 *
 * Anything outside that subset (exit/emphasis semantics, compound rotation,
 * motion paths, infinite loops, per-letter staggering) normalizes to
 * `unmapped` with a human-readable reason; the caller turns those into
 * DECKHTML_ANIMATION_UNMAPPED diagnostics and the element keeps its frozen
 * end-state, matching pre-animation conversion behaviour.
 */

const DEFAULT_DURATION_MS = 500;

/** Parsed first/last keyframe geometry, produced browser-side. */
export interface KeyframeSnapshot {
  opacity: number | null;
  translateXPx: number;
  translateYPx: number;
  scaleX: number;
  scaleY: number;
  rotateDeg: number;
  /** Frame touched properties outside opacity/transform (e.g. color, width). */
  hasNonMotionProps: boolean;
}

/** Raw CSS animation capture for one element (browser-side). */
export interface CssAnimationRaw {
  name: string;
  durationMs: number;
  delayMs: number;
  /** null = infinite */
  iterationCount: number | null;
  first: KeyframeSnapshot;
  last: KeyframeSnapshot;
}

/** Intercepted anime.js animate()/timeline.add() call (browser-side). */
export interface AnimeCallRaw {
  durationMs?: number;
  delayMs?: number;
  /** Unknown easing/delay shapes are captured verbatim for diagnostics. */
  staggered?: boolean;
  params: Record<string, unknown>;
}

/** Parse "600" | "600ms" | "0.6s" into milliseconds. */
export function parseTimeMs(raw: string | undefined | null): number | undefined {
  if (raw == null) return undefined;
  const v = String(raw).trim();
  if (!v) return undefined;
  const m = v.match(/^(-?\d+(?:\.\d+)?)(ms|s)?$/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n) || n < 0) return undefined;
  return m[2] === 's' ? Math.round(n * 1000) : Math.round(n);
}

/** Map declared trigger words onto PPTX triggers; undefined when absent/unknown. */
export function normalizeTrigger(raw: string | undefined | null): AnimationTrigger | undefined {
  if (raw == null) return undefined;
  switch (raw.trim().toLowerCase()) {
    case 'click':
    case 'onclick':
      return 'onClick';
    case 'with':
    case 'withprevious':
      return 'withPrevious';
    case 'after':
    case 'afterprevious':
      return 'afterPrevious';
    default:
      return undefined;
  }
}

/** Normalize a declared `data-animation` effect string. */
export function normalizeDeclaredEffect(raw: string): NormalizedAnimationEffect {
  const v = raw.trim().toLowerCase().replace(/[\s_]+/g, '-');
  const unmapped = (reason: string): NormalizedAnimationEffect => ({
    kind: 'unmapped',
    raw,
    reason,
  });

  switch (v) {
    case 'appear':
      return { kind: 'appear' };
    case 'fade':
    case 'fade-in':
      return { kind: 'fade' };
    case 'fly-in-left':
    case 'fly-left':
      return { kind: 'fly', direction: 'left' };
    case 'fly-in-right':
    case 'fly-right':
      return { kind: 'fly', direction: 'right' };
    case 'fly-in-top':
    case 'fly-top':
      return { kind: 'fly', direction: 'top' };
    case 'fly-in-bottom':
    case 'fly-bottom':
      return { kind: 'fly', direction: 'bottom' };
    case 'zoom':
    case 'zoom-in':
      return { kind: 'zoom' };
    case 'spin':
      return { kind: 'spin' };
    case 'spin-quarter':
      return { kind: 'spin', angleDeg: 90 };
    case 'spin-half':
      return { kind: 'spin', angleDeg: 180 };
    case 'spin-double':
      return { kind: 'spin', angleDeg: 720 };
    case 'wipe-left':
      return { kind: 'wipe', direction: 'left' };
    case 'wipe-right':
      return { kind: 'wipe', direction: 'right' };
    case 'wipe-top':
      return { kind: 'wipe', direction: 'top' };
    case 'wipe-bottom':
      return { kind: 'wipe', direction: 'bottom' };
    default:
      if (/-out\b|exit/.test(v)) {
        return unmapped('exit animations are not supported yet');
      }
      return unmapped(`unknown effect "${raw}"`);
  }
}

function isIdentityFrame(f: KeyframeSnapshot): boolean {
  return (
    f.translateXPx === 0 &&
    f.translateYPx === 0 &&
    f.scaleX === 1 &&
    f.scaleY === 1 &&
    f.rotateDeg === 0
  );
}

/**
 * Infer the entrance effect from first/last @keyframes frames.
 * Returns 0..2 effects: fade combined with a single-axis motion is emitted as
 * two entries played in parallel; anything more complex is `unmapped`.
 */
export function normalizeCssAnimation(raw: CssAnimationRaw): NormalizedAnimationEffect[] {
  const fail = (reason: string): NormalizedAnimationEffect[] => [
    { kind: 'unmapped', raw: raw.name, reason },
  ];

  if (raw.iterationCount === null) {
    return fail('infinite-loop animations map to emphasis effects, which are not supported yet');
  }
  if (raw.first.hasNonMotionProps || raw.last.hasNonMotionProps) {
    return fail('keyframes animate properties outside opacity/transform');
  }

  const dx = raw.last.translateXPx - raw.first.translateXPx;
  const dy = raw.last.translateYPx - raw.first.translateYPx;
  const dScaleX = raw.last.scaleX - raw.first.scaleX;
  const dScaleY = raw.last.scaleY - raw.first.scaleY;
  const dRotate = raw.last.rotateDeg - raw.first.rotateDeg;

  const fadesIn =
    raw.first.opacity !== null &&
    raw.first.opacity <= 0.01 &&
    (raw.last.opacity === null || raw.last.opacity > raw.first.opacity);
  const moves = Math.abs(dx) > 1 || Math.abs(dy) > 1;
  const scales = Math.abs(dScaleX) > 0.01 || Math.abs(dScaleY) > 0.01;
  const rotates = Math.abs(dRotate) > 0.5;

  if (!fadesIn && !moves && !scales && !rotates) {
    return fail('keyframes produce no visible motion (already at end state)');
  }
  if ((scales && rotates) || (moves && (scales || rotates))) {
    return fail('compound animations combining motion, scale and rotation are not supported yet');
  }

  const effects: NormalizedAnimationEffect[] = [];
  if (fadesIn) effects.push({ kind: 'fade' });
  if (moves) {
    const direction =
      Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'left' : 'right') : dy > 0 ? 'top' : 'bottom';
    effects.push({ kind: 'fly', direction });
  } else if (scales) {
    effects.push({ kind: 'zoom' });
  } else if (rotates) {
    const angle = Math.round(dRotate);
    effects.push({ kind: 'spin', angleDeg: angle === 0 ? undefined : angle });
  }
  return effects;
}

/** anime.js numeric param forms: 200 | "200px" | {to: 200} | [from, to]. */
function readAnimeNumeric(v: unknown): { from: number; to: number } | undefined {
  const num = (x: unknown): number | undefined => {
    if (typeof x === 'number' && Number.isFinite(x)) return x;
    if (typeof x === 'string') {
      const m = x.trim().match(/^(-?\d+(?:\.\d+)?)(px|deg)?$/);
      if (m) return parseFloat(m[1]);
    }
    return undefined;
  };
  if (Array.isArray(v) && v.length === 2) {
    const from = num(v[0]);
    const to = num(v[1]);
    if (from !== undefined && to !== undefined) return { from, to };
    return undefined;
  }
  if (v && typeof v === 'object') {
    const rec = v as Record<string, unknown>;
    const to = num(rec.to);
    const from = num(rec.from);
    if (to !== undefined) return { from: from ?? 0, to };
    return undefined;
  }
  const to = num(v);
  return to !== undefined ? { from: 0, to } : undefined;
}

const ANIME_UNSUPPORTED_KEYS = [
  'motionPath',
  'path',
  'points',
  'split',
  'splitText',
  'borderRadius',
  'backgroundColor',
  'color',
  'width',
  'height',
];

/** Infer effects from one intercepted anime.js call. */
export function normalizeAnimeParams(call: AnimeCallRaw): NormalizedAnimationEffect[] {
  const rawLabel = JSON.stringify(Object.keys(call.params));
  const fail = (reason: string): NormalizedAnimationEffect[] => [
    { kind: 'unmapped', raw: rawLabel, reason },
  ];

  if (call.staggered) {
    return fail('stagger() delays cannot be expressed per-element without timeline expansion');
  }
  for (const k of ANIME_UNSUPPORTED_KEYS) {
    if (k in call.params) {
      return fail(`anime.js property "${k}" is outside the PPTX entrance subset`);
    }
  }

  const tx = readAnimeNumeric(call.params.translateX ?? call.params.x);
  const ty = readAnimeNumeric(call.params.translateY ?? call.params.y);
  const scale = readAnimeNumeric(call.params.scale ?? call.params.scaleX);
  const rotate = readAnimeNumeric(call.params.rotate);
  const opacity = readAnimeNumeric(call.params.opacity);

  const moves = (tx && Math.abs(tx.to - tx.from) > 1) || (ty && Math.abs(ty.to - ty.from) > 1);
  const scales = scale && Math.abs(scale.to - scale.from) > 0.01;
  const rotates = rotate && Math.abs(rotate.to - rotate.from) > 0.5;
  const fadesIn = opacity && opacity.from <= 0.01 && opacity.to > opacity.from;

  if (!moves && !scales && !rotates && !fadesIn) {
    return fail('anime.js call has no mappable entrance motion');
  }
  if ((scales && rotates) || (moves && (scales || rotates))) {
    return fail('compound animations combining motion, scale and rotation are not supported yet');
  }

  const effects: NormalizedAnimationEffect[] = [];
  if (fadesIn) effects.push({ kind: 'fade' });
  if (moves) {
    const dx = tx ? tx.to - tx.from : 0;
    const dy = ty ? ty.to - ty.from : 0;
    const direction =
      Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'left' : 'right') : dy > 0 ? 'top' : 'bottom';
    effects.push({ kind: 'fly', direction });
  } else if (scales) {
    effects.push({ kind: 'zoom' });
  } else if (rotates) {
    const angle = Math.round(rotate!.to - rotate!.from);
    effects.push({ kind: 'spin', angleDeg: angle === 0 ? undefined : angle });
  }
  return effects;
}

export interface BuildAnimationsInput {
  declared?: {
    effect: string;
    durationMs?: number;
    delayMs?: number;
    trigger?: string;
  };
  css?: CssAnimationRaw;
  animeCalls?: AnimeCallRaw[];
  options?: AnimationConversionOptions;
}

export interface BuiltAnimations {
  animations: ElementAnimation[];
  /** One entry per source animation that could not be mapped. */
  unmapped: { source: ElementAnimation['source']; raw: string; reason: string }[];
}

/**
 * Merge all capture sources for one element into a single animation list.
 * An explicit declaration wins over css/animejs captures for the same element
 * (authors use it to override ambient animations).
 */
export function buildElementAnimations(input: BuildAnimationsInput): BuiltAnimations {
  const defaultTrigger = input.options?.defaultTrigger ?? 'afterPrevious';
  const animations: ElementAnimation[] = [];
  const unmapped: BuiltAnimations['unmapped'] = [];

  // Effects derived from a single source animation (a CSS @keyframes rule or
  // one anime.js call) that combine fade with a single-axis motion must play in
  // parallel. The first mapped effect honors the source trigger; every
  // subsequent mapped effect rides on it as withPrevious so timing-xml emits
  // them inside the same parallel first-par instead of chaining them as
  // afterPrevious siblings (which would serialize fade→fly→…).
  const push = (
    source: ElementAnimation['source'],
    effects: NormalizedAnimationEffect[],
    durationMs: number,
    delayMs: number,
    trigger: AnimationTrigger
  ): void => {
    let firstMapped = true;
    for (const effect of effects) {
      if (effect.kind === 'unmapped') {
        unmapped.push({ source, raw: effect.raw, reason: effect.reason });
        continue;
      }
      const effTrigger = firstMapped ? trigger : 'withPrevious';
      animations.push({ source, effect, trigger: effTrigger, durationMs, delayMs });
      firstMapped = false;
    }
  };

  if (input.declared) {
    const effect = normalizeDeclaredEffect(input.declared.effect);
    push(
      'declared',
      [effect],
      input.declared.durationMs ?? DEFAULT_DURATION_MS,
      input.declared.delayMs ?? 0,
      normalizeTrigger(input.declared.trigger) ?? defaultTrigger
    );
    return { animations, unmapped };
  }

  if (input.css) {
    push(
      'css',
      normalizeCssAnimation(input.css),
      input.css.durationMs || DEFAULT_DURATION_MS,
      input.css.delayMs || 0,
      defaultTrigger
    );
  }

  for (const call of input.animeCalls ?? []) {
    push(
      'animejs',
      normalizeAnimeParams(call),
      call.durationMs ?? DEFAULT_DURATION_MS,
      call.delayMs ?? 0,
      defaultTrigger
    );
  }

  return { animations, unmapped };
}

/** True when the snapshot carries no motion (used to skip trivial captures). */
export function isTrivialKeyframes(first: KeyframeSnapshot, last: KeyframeSnapshot): boolean {
  return isIdentityFrame(first) && isIdentityFrame(last);
}
