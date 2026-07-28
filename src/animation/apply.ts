import { ConversionOptions, ElementInfo } from '../types';
import { Diagnostic, RULE_IDS } from '../utils/diagnostics';
import {
  AnimeCallRaw,
  buildElementAnimations,
  CssAnimationRaw,
} from './normalize';

export interface ApplyAnimationsContext {
  /** ConversionOptions.animations verbatim (false disables the whole pipeline). */
  animationsOption: ConversionOptions['animations'];
  /** Per-slide CSS animation capture, keyed by data-dh-anim-css. */
  cssCapture?: ReadonlyMap<string, CssAnimationRaw>;
  /** Intercepted anime.js calls for the page (indices from data-dh-anim-anime). */
  animeCalls?: readonly AnimeCallRaw[];
  /** Slide id (or 1-based index) attached to diagnostics. */
  slideId?: string | null;
}

/**
 * Normalize raw browser-side animation captures into ElementInfo.animations.
 * Runs on the Node side after inspection; clears animationRaw afterwards.
 * Returns DECKHTML_ANIMATION_UNMAPPED diagnostics for effects outside the
 * native PPTX subset (those elements keep their frozen end-state).
 */
export function applyAnimationsToElements(
  elements: ElementInfo[],
  ctx: ApplyAnimationsContext
): Diagnostic[] {
  if (ctx.animationsOption === false) {
    for (const el of elements) delete el.animationRaw;
    return [];
  }
  const options =
    typeof ctx.animationsOption === 'object' && ctx.animationsOption !== null
      ? ctx.animationsOption
      : undefined;

  const diagnostics: Diagnostic[] = [];
  for (const el of elements) {
    const raw = el.animationRaw;
    if (!raw) continue;

    const css =
      raw.cssRaw ?? (raw.cssAnimationKey ? ctx.cssCapture?.get(raw.cssAnimationKey) : undefined);
    const animeCalls =
      raw.animeRaws && raw.animeRaws.length > 0
        ? raw.animeRaws
        : (raw.animeCallIndices ?? [])
            .map((i) => ctx.animeCalls?.[i])
            .filter((c): c is AnimeCallRaw => Boolean(c));

    const built = buildElementAnimations({
      declared: raw.declaredEffect
        ? {
            effect: raw.declaredEffect,
            durationMs: raw.declaredDurationMs,
            delayMs: raw.declaredDelayMs,
            trigger: raw.declaredTrigger,
          }
        : undefined,
      css,
      animeCalls: animeCalls.length ? animeCalls : undefined,
      options,
    });

    if (built.animations.length > 0) {
      el.animations = built.animations;
    }
    for (const u of built.unmapped) {
      diagnostics.push({
        rule_id: RULE_IDS.ANIMATION_UNMAPPED,
        severity: 'warning',
        element_id: el.elementId ?? null,
        slide_id: ctx.slideId ?? null,
        message:
          `Animation from ${u.source} is outside the native PPTX entrance subset: ` +
          `${u.reason} (raw: ${u.raw}). The element keeps its frozen end-state.`,
        recovery:
          'Declare the animation explicitly with data-animation using a supported ' +
          'entrance effect: appear, fade-in, fly-in-left/right/top/bottom, zoom-in, spin, wipe-left/right/top/bottom.',
      });
    }
    delete el.animationRaw;
  }
  return diagnostics;
}
