/**
 * Resolve ConversionOptions.slideTransitions into per-slide transition specs.
 *
 * - Named effect → same transition on every slide
 * - Comma-separated names → cycle through the list in order
 * - random / default → a fresh random catalog effect per slide
 * - false / none → disabled
 */

import type { ConversionOptions, SlideTransitionOptions } from '../types';
import {
  buildTransitionXml,
  getSlideTransitionEffect,
  listRandomPoolEffects,
  listSlideTransitionEffectNames,
  resolveEffectParams,
  type ResolvedSlideTransition,
  type SlideTransitionEffectDef,
  type TransitionSpeed,
} from './catalog';

export type { ResolvedSlideTransition };

/** Mulberry32 — small seeded PRNG for deterministic tests. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function makePicker(seed?: number): <T>(items: readonly T[]) => T {
  const next =
    seed === undefined ? Math.random : mulberry32(seed | 0);
  return <T>(items: readonly T[]): T => {
    if (items.length === 0) {
      throw new Error('Cannot pick from an empty list');
    }
    return items[Math.floor(next() * items.length)]!;
  };
}

function normalizeSpeed(speed?: string): TransitionSpeed {
  if (speed === 'slow' || speed === 'med' || speed === 'fast') return speed;
  return 'med';
}

/** Split a comma-separated effect list; empty tokens dropped. */
export function parseEffectNameList(raw: string): string[] {
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function lookupEffect(name: string): SlideTransitionEffectDef {
  const def = getSlideTransitionEffect(name);
  if (!def) {
    const known = listSlideTransitionEffectNames().join(', ');
    throw new Error(
      `Unknown slide transition "${name}". Available: ${known}`
    );
  }
  return def;
}

function parseOptions(raw: ConversionOptions['slideTransitions']): {
  disabled: boolean;
  /** Raw effect token(s): 'random', single name, or comma-separated list. */
  effect?: string;
  /** Explicit list from SlideTransitionOptions.effects (takes precedence). */
  effects?: string[];
  speed: TransitionSpeed;
  seed?: number;
} {
  if (raw === false || raw === 'none') {
    return { disabled: true, speed: 'med' };
  }
  if (raw === undefined || raw === true || raw === 'random') {
    return { disabled: false, effect: 'random', speed: 'med' };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'none' || lower === 'off' || lower === 'false') {
      return { disabled: true, speed: 'med' };
    }
    return { disabled: false, effect: trimmed, speed: 'med' };
  }
  const opts = raw as SlideTransitionOptions;
  if (opts.enabled === false) {
    return { disabled: true, speed: normalizeSpeed(opts.speed), seed: opts.seed };
  }
  if (opts.effects?.length) {
    return {
      disabled: false,
      effects: opts.effects.map((e) => e.trim().toLowerCase()).filter(Boolean),
      speed: normalizeSpeed(opts.speed),
      seed: opts.seed,
    };
  }
  const effect = (opts.effect ?? 'random').trim();
  const lower = effect.toLowerCase();
  if (lower === 'none' || lower === 'off' || lower === 'false') {
    return { disabled: true, speed: normalizeSpeed(opts.speed), seed: opts.seed };
  }
  return {
    disabled: false,
    effect,
    speed: normalizeSpeed(opts.speed),
    seed: opts.seed,
  };
}

function buildResolved(
  def: SlideTransitionEffectDef,
  speed: TransitionSpeed,
  pick: <T>(items: readonly T[]) => T
): ResolvedSlideTransition {
  const params = resolveEffectParams(def, pick, { speed });
  return {
    effect: def.name,
    speed,
    params,
    xml: buildTransitionXml(def, { speed, params }),
  };
}

function makeCycleNext(
  defs: SlideTransitionEffectDef[],
  speed: TransitionSpeed,
  pick: <T>(items: readonly T[]) => T
): { names: string[]; next: () => ResolvedSlideTransition } {
  let i = 0;
  return {
    names: defs.map((d) => d.name),
    next: () => {
      const def = defs[i % defs.length]!;
      i += 1;
      return buildResolved(def, speed, pick);
    },
  };
}

export type SlideTransitionPlan =
  | { mode: 'disabled' }
  | {
      /** Same concrete (or PPT meta-random) effect on every slide. */
      mode: 'fixed';
      transition: ResolvedSlideTransition;
    }
  | {
      /** Cycle through a named list in order (wraps). */
      mode: 'cycle';
      effects: string[];
      next: () => ResolvedSlideTransition;
    }
  | {
      /** Fresh random catalog effect for each slide. */
      mode: 'random';
      speed: TransitionSpeed;
      next: () => ResolvedSlideTransition;
    };

/**
 * Resolve the conversion-level slide-transition option into a plan.
 *
 * Default (undefined / true / 'random'): each slide gets its own random effect.
 * Single named effect: that effect on every slide.
 * Comma-separated names (or `effects: [...]`): cycle through the list.
 * false / 'none': disabled.
 */
export function resolveSlideTransitionPlan(
  raw: ConversionOptions['slideTransitions']
): SlideTransitionPlan {
  const parsed = parseOptions(raw);
  if (parsed.disabled) return { mode: 'disabled' };

  const pick = makePicker(parsed.seed);

  const names =
    parsed.effects ??
    (parsed.effect ? parseEffectNameList(parsed.effect) : ['random']);

  if (names.length === 0) {
    throw new Error('slideTransitions effect list is empty');
  }

  // Lone "random" → per-slide random pool
  if (names.length === 1 && names[0] === 'random') {
    const pool = listRandomPoolEffects();
    return {
      mode: 'random',
      speed: parsed.speed,
      next: () => buildResolved(pick(pool), parsed.speed, pick),
    };
  }

  // Disallow mixing "random" into a cycle list — keep the API unambiguous.
  if (names.includes('random') && names.length > 1) {
    throw new Error(
      'slideTransitions: "random" cannot be mixed with named effects in a list; ' +
        'use "random" alone, or a comma-separated list of catalog names'
    );
  }

  const defs = names.map(lookupEffect);

  if (defs.length === 1) {
    return {
      mode: 'fixed',
      transition: buildResolved(defs[0]!, parsed.speed, pick),
    };
  }

  const cycle = makeCycleNext(defs, parsed.speed, pick);
  return {
    mode: 'cycle',
    effects: cycle.names,
    next: cycle.next,
  };
}

/**
 * Resolve a single transition (for fixed mode / tests).
 * In random/cycle mode returns one sample draw — prefer `resolveSlideTransitionPlan`
 * when applying across multiple slides.
 */
export function resolveSlideTransition(
  raw: ConversionOptions['slideTransitions']
): ResolvedSlideTransition | null {
  const plan = resolveSlideTransitionPlan(raw);
  if (plan.mode === 'disabled') return null;
  if (plan.mode === 'fixed') return plan.transition;
  return plan.next();
}
