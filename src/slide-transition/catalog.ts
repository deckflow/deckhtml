/**
 * PowerPoint slide-to-slide transition catalog (OOXML `p:transition`).
 *
 * These are transitions between slides — not element entrance animations
 * (`data-animation` / `p:timing`).
 *
 * Three tiers, mirroring what PowerPoint itself writes:
 *
 * - **base** — ISO/IEC 29500 `p:*` child elements (`p:fade`, `p:push`, …).
 *   Understood by every OOXML renderer.
 * - **ext** — Office extension transitions, wrapped in `mc:AlternateContent`
 *   with a base `mc:Fallback`:
 *   - `p14:*` (PowerPoint 2010) — vortex, flip, ripple, glitter, …
 *   - `p15:prstTrans` (PowerPoint 2013) — preset transitions: fallOver,
 *     drape, curtains, wind, prestige, fracture, crush, peelOff,
 *     pageCurlSingle/Double, airplane, origami
 *   - `p159:morph` (PowerPoint 2019 / Microsoft 365)
 *
 * Renderers without the extension play the base fallback instead.
 */

export type TransitionSpeed = 'slow' | 'med' | 'fast';

export type SideDirection = 'l' | 'r' | 'u' | 'd';
export type CornerDirection = 'ld' | 'lu' | 'rd' | 'ru';
export type EightDirection = SideDirection | CornerDirection;
export type LeftRight = 'l' | 'r';
export type Orient = 'horz' | 'vert';
export type InOut = 'in' | 'out';
export type CornerOrCenter = CornerDirection | 'center';
export type GlitterPattern = 'diamond' | 'hexagon';
export type ShredPattern = 'strip' | 'rectangle';
export type MorphOption = 'byObject' | 'byWord' | 'byChar';

/** Extension namespace for `tier: 'ext'` effects. */
export type TransitionExtNamespace = 'p14' | 'p15' | 'p159';

export const TRANSITION_EXT_NS_URIS: Record<TransitionExtNamespace, string> = {
  p14: 'http://schemas.microsoft.com/office/powerpoint/2010/main',
  p15: 'http://schemas.microsoft.com/office/powerpoint/2012/main',
  p159: 'http://schemas.microsoft.com/office/powerpoint/2015/09/main',
};

const MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';

export interface TransitionFallbackSpec {
  /** Base catalog effect name used in `mc:Fallback`. */
  effect: string;
  params?: Partial<ResolvedTransitionParams>;
}

export interface SlideTransitionEffectDef {
  /** User-facing name (CLI / API). */
  name: string;
  /** Short description. */
  description: string;
  /** OOXML child element local name under `p:transition`. */
  ooxml: string;
  /**
   * `base` (default): plain `<p:xxx/>` child.
   * `ext`: `<ns:xxx/>` inside `mc:AlternateContent` with a base fallback.
   */
  tier?: 'base' | 'ext';
  /** Extension namespace prefix (required when tier is `ext`). */
  ns?: TransitionExtNamespace;
  /** Build attribute string for the OOXML child (may be empty). */
  attrs?: (opts: ResolvedTransitionParams) => string;
  /** Base fallback for ext effects (renderer without the extension). */
  fallback?: (opts: ResolvedTransitionParams) => TransitionFallbackSpec;
  /** Eligible for generation-time random pick (excludes meta `random`). */
  randomPool?: boolean;
}

export interface ResolvedTransitionParams {
  speed: TransitionSpeed;
  /** Side / corner / in-out / left-right / center direction resolved for this effect. */
  dir?: string;
  orient?: Orient;
  thruBlk?: boolean;
  spokes?: number;
  /** glitter / shred shape pattern. */
  pattern?: string;
  /** morph option: byObject / byWord / byChar. */
  option?: string;
  isContent?: boolean;
  isInverted?: boolean;
  hasBounce?: boolean;
  invX?: boolean;
  invY?: boolean;
}

export interface ResolvedSlideTransition {
  effect: string;
  speed: TransitionSpeed;
  params: ResolvedTransitionParams;
  /** Serialized OOXML fragment: `<p:transition …>…</p:transition>` (base) or
   *  `<mc:AlternateContent>…</mc:AlternateContent>` (ext). */
  xml: string;
}

const SIDE_DIRS: SideDirection[] = ['l', 'r', 'u', 'd'];
const CORNER_DIRS: CornerDirection[] = ['ld', 'lu', 'rd', 'ru'];
const EIGHT_DIRS: EightDirection[] = [...SIDE_DIRS, ...CORNER_DIRS];
const LEFT_RIGHTS: LeftRight[] = ['l', 'r'];
const ORIENTS: Orient[] = ['horz', 'vert'];
const IN_OUTS: InOut[] = ['in', 'out'];
const CORNER_CENTER_DIRS: CornerOrCenter[] = [...CORNER_DIRS, 'center'];
const GLITTER_PATTERNS: GlitterPattern[] = ['diamond', 'hexagon'];
const SHRED_PATTERNS: ShredPattern[] = ['strip', 'rectangle'];
const WHEEL_SPOKES = [1, 2, 3, 4, 8] as const;

function attr(name: string, value: string | number | boolean | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'boolean') return ` ${name}="${value ? '1' : '0'}"`;
  return ` ${name}="${value}"`;
}

/** Same side dir for the fallback push/pull as the ext effect. */
function pushFallback(dirFrom: (p: ResolvedTransitionParams) => string | undefined) {
  return (p: ResolvedTransitionParams): TransitionFallbackSpec => ({
    effect: 'push',
    params: { dir: dirFrom(p) ?? 'l' },
  });
}

/** Canonical catalog of slide transition effects. */
export const SLIDE_TRANSITION_EFFECTS: readonly SlideTransitionEffectDef[] = [
  // ------------------------------------------------------------------
  // Base tier — ISO/IEC 29500 `p:*` transitions (universal support)
  // ------------------------------------------------------------------
  {
    name: 'fade',
    description: 'Fade from previous slide into the next',
    ooxml: 'fade',
    attrs: (p) => attr('thruBlk', p.thruBlk ?? false),
    randomPool: true,
  },
  {
    name: 'fade-through-black',
    description: 'Fade through black into the next slide',
    ooxml: 'fade',
    attrs: () => attr('thruBlk', true),
    randomPool: true,
  },
  {
    name: 'push',
    description: 'New slide pushes the previous one off-screen',
    ooxml: 'push',
    attrs: (p) => attr('dir', p.dir ?? 'l'),
    randomPool: true,
  },
  {
    name: 'wipe',
    description: 'Wipe the new slide over the previous from one edge',
    ooxml: 'wipe',
    attrs: (p) => attr('dir', p.dir ?? 'l'),
    randomPool: true,
  },
  {
    name: 'cover',
    description: 'New slide covers the previous from one direction',
    ooxml: 'cover',
    attrs: (p) => attr('dir', p.dir ?? 'l'),
    randomPool: true,
  },
  {
    name: 'pull',
    description: 'Pull the previous slide away to reveal the next',
    ooxml: 'pull',
    attrs: (p) => attr('dir', p.dir ?? 'l'),
    randomPool: true,
  },
  {
    name: 'split',
    description: 'Split open / close to reveal the next slide',
    ooxml: 'split',
    attrs: (p) => attr('orient', p.orient ?? 'horz') + attr('dir', p.dir ?? 'out'),
    randomPool: true,
  },
  {
    name: 'blinds',
    description: 'Venetian-blinds reveal',
    ooxml: 'blinds',
    attrs: (p) => attr('dir', p.orient ?? 'horz'),
    randomPool: true,
  },
  {
    name: 'checker',
    description: 'Checkerboard reveal',
    ooxml: 'checker',
    attrs: (p) => attr('dir', p.orient ?? 'horz'),
    randomPool: true,
  },
  {
    name: 'comb',
    description: 'Comb / interlocking bars',
    ooxml: 'comb',
    attrs: (p) => attr('dir', p.orient ?? 'horz'),
    randomPool: true,
  },
  {
    name: 'random-bar',
    description: 'Random bars wipe across the slide',
    ooxml: 'randomBar',
    attrs: (p) => attr('dir', p.orient ?? 'horz'),
    randomPool: true,
  },
  {
    name: 'strips',
    description: 'Diagonal strips reveal',
    ooxml: 'strips',
    attrs: (p) => attr('dir', p.dir ?? 'rd'),
    randomPool: true,
  },
  {
    name: 'wheel',
    description: 'Clock-spoke wheel reveal',
    ooxml: 'wheel',
    attrs: (p) => attr('spokes', p.spokes ?? 4),
    randomPool: true,
  },
  {
    name: 'wedge',
    description: 'Wedge / pie-slice reveal',
    ooxml: 'wedge',
    randomPool: true,
  },
  {
    name: 'circle',
    description: 'Expanding / collapsing circle',
    ooxml: 'circle',
    randomPool: true,
  },
  {
    name: 'diamond',
    description: 'Expanding / collapsing diamond',
    ooxml: 'diamond',
    randomPool: true,
  },
  {
    name: 'plus',
    description: 'Expanding / collapsing plus shape',
    ooxml: 'plus',
    randomPool: true,
  },
  {
    name: 'newsflash',
    description: 'Newsflash spin-and-zoom',
    ooxml: 'newsflash',
    randomPool: true,
  },
  {
    name: 'dissolve',
    description: 'Pixel dissolve into the next slide',
    ooxml: 'dissolve',
    randomPool: true,
  },
  {
    name: 'zoom',
    description: 'Zoom in or out into the next slide',
    ooxml: 'zoom',
    attrs: (p) => attr('dir', p.dir ?? 'in'),
    randomPool: true,
  },
  {
    name: 'cut',
    description: 'Hard cut (optionally through black)',
    ooxml: 'cut',
    attrs: (p) => attr('thruBlk', p.thruBlk ?? false),
    randomPool: true,
  },
  {
    name: 'none',
    description: 'Explicit no-transition marker (instant change)',
    ooxml: 'none',
    randomPool: false,
  },
  {
    name: 'random',
    description: 'PowerPoint picks a random transition at show time',
    ooxml: 'random',
    randomPool: false,
  },

  // ------------------------------------------------------------------
  // Ext tier — p14 (PowerPoint 2010) extended transitions
  // ------------------------------------------------------------------
  {
    name: 'conveyor',
    description: 'Conveyor belt — content rides in like a belt (PPT 2010+)',
    ooxml: 'conveyor',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('dir', p.dir ?? 'r'),
    fallback: pushFallback((p) => p.dir),
    randomPool: true,
  },
  {
    name: 'doors',
    description: 'Elevator-style doors open to reveal the next slide (PPT 2010+)',
    ooxml: 'doors',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('dir', p.orient ?? 'vert'),
    fallback: (p) => ({
      effect: 'split',
      params: { orient: p.orient === 'horz' ? 'vert' : 'horz', dir: 'out' },
    }),
    randomPool: true,
  },
  {
    name: 'ferris',
    description: 'Ferris wheel — swing around a horizontal axis (PPT 2010+)',
    ooxml: 'ferris',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('dir', p.dir ?? 'r'),
    fallback: pushFallback((p) => p.dir),
    randomPool: true,
  },
  {
    name: 'flash',
    description: 'Flash — quick bright blink into the next slide (PPT 2010+)',
    ooxml: 'flash',
    tier: 'ext',
    ns: 'p14',
    fallback: () => ({ effect: 'fade' }),
    randomPool: true,
  },
  {
    name: 'flip',
    description: 'Flip the slide over like a card (PPT 2010+)',
    ooxml: 'flip',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('dir', p.dir ?? 'l'),
    fallback: pushFallback((p) => p.dir),
    randomPool: true,
  },
  {
    name: 'flythrough',
    description: 'Fly through — swoop into / out of the screen (PPT 2010+)',
    ooxml: 'flythrough',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('dir', p.dir ?? 'in') + attr('hasBounce', p.hasBounce ?? false),
    fallback: (p) => ({ effect: 'zoom', params: { dir: p.dir ?? 'in' } }),
    randomPool: true,
  },
  {
    name: 'gallery',
    description: 'Gallery — rotate around a vertical axis like a gallery wall (PPT 2010+)',
    ooxml: 'gallery',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('dir', p.dir ?? 'l'),
    fallback: pushFallback((p) => p.dir),
    randomPool: true,
  },
  {
    name: 'glitter',
    description: 'Glitter — sparkle across in diamond / hexagon pieces (PPT 2010+)',
    ooxml: 'glitter',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) =>
      attr('dir', p.dir ?? 'l') + attr('pattern', p.pattern ?? 'diamond'),
    fallback: () => ({ effect: 'dissolve' }),
    randomPool: true,
  },
  {
    name: 'honeycomb',
    description: 'Honeycomb — tumble out as hexagonal cells (PPT 2010+)',
    ooxml: 'honeycomb',
    tier: 'ext',
    ns: 'p14',
    fallback: () => ({ effect: 'dissolve' }),
    randomPool: true,
  },
  {
    name: 'pan',
    description: 'Pan — camera pans across into the next slide (PPT 2010+)',
    ooxml: 'pan',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('dir', p.dir ?? 'u'),
    fallback: pushFallback((p) => p.dir),
    randomPool: true,
  },
  {
    name: 'prism',
    description: 'Prism — 3D prism rotates the new slide in (PPT 2010+)',
    ooxml: 'prism',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) =>
      attr('dir', p.dir ?? 'l') +
      attr('isContent', p.isContent ?? false) +
      attr('isInverted', p.isInverted ?? false),
    fallback: pushFallback((p) => p.dir),
    randomPool: true,
  },
  {
    name: 'reveal',
    description: 'Reveal — softly reveal the next slide from one side (PPT 2010+)',
    ooxml: 'reveal',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('thruBlk', p.thruBlk ?? false) + attr('dir', p.dir ?? 'l'),
    fallback: () => ({ effect: 'fade' }),
    randomPool: true,
  },
  {
    name: 'ripple',
    description: 'Ripple — water ripples spread from a corner / the center (PPT 2010+)',
    ooxml: 'ripple',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('dir', p.dir ?? 'center'),
    fallback: (p) => (p.dir === 'center' ? { effect: 'circle' } : { effect: 'fade' }),
    randomPool: true,
  },
  {
    name: 'shred',
    description: 'Shred — shred the slide into strips / rectangles (PPT 2010+)',
    ooxml: 'shred',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) =>
      attr('pattern', p.pattern ?? 'strip') + attr('dir', p.dir ?? 'in'),
    fallback: () => ({ effect: 'blinds', params: { orient: 'horz' } }),
    randomPool: true,
  },
  {
    name: 'switch',
    description: 'Switch — slides swap places with a spin (PPT 2010+)',
    ooxml: 'switch',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('dir', p.dir ?? 'r'),
    fallback: pushFallback((p) => p.dir),
    randomPool: true,
  },
  {
    name: 'vortex',
    description: 'Vortex — swirl the slide away toward one edge (PPT 2010+)',
    ooxml: 'vortex',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('dir', p.dir ?? 'l'),
    fallback: () => ({ effect: 'fade' }),
    randomPool: true,
  },
  {
    name: 'warp',
    description: 'Warp — warp in / out like a sci-fi jump (PPT 2010+)',
    ooxml: 'warp',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('dir', p.dir ?? 'in'),
    fallback: (p) => ({ effect: 'zoom', params: { dir: p.dir ?? 'in' } }),
    randomPool: true,
  },
  {
    name: 'wheel-reverse',
    description: 'Wheel reverse — counter-clockwise clock-spoke wheel (PPT 2010+)',
    ooxml: 'wheelReverse',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('spokes', p.spokes ?? 4),
    fallback: (p) => ({ effect: 'wheel', params: { spokes: p.spokes ?? 4 } }),
    randomPool: true,
  },
  {
    name: 'window',
    description: 'Window — next slide appears inside a rotating window frame (PPT 2010+)',
    ooxml: 'window',
    tier: 'ext',
    ns: 'p14',
    attrs: (p) => attr('dir', p.orient ?? 'vert'),
    fallback: (p) => ({
      effect: 'split',
      params: { orient: p.orient ?? 'vert', dir: 'in' },
    }),
    randomPool: true,
  },

  // ------------------------------------------------------------------
  // Ext tier — p15 (PowerPoint 2013) preset transitions (`p15:prstTrans`)
  // ------------------------------------------------------------------
  {
    name: 'fall-over',
    description: 'Fall over — the old slide tips over and falls (PPT 2013+)',
    ooxml: 'prstTrans',
    tier: 'ext',
    ns: 'p15',
    attrs: (p) => attr('prst', 'fallOver') + attr('invX', p.invX) + attr('invY', p.invY),
    fallback: () => ({ effect: 'push', params: { dir: 'd' } }),
    randomPool: true,
  },
  {
    name: 'drape',
    description: 'Drape — the new slide drapes over the old like cloth (PPT 2013+)',
    ooxml: 'prstTrans',
    tier: 'ext',
    ns: 'p15',
    attrs: (p) => attr('prst', 'drape') + attr('invX', p.invX) + attr('invY', p.invY),
    fallback: () => ({ effect: 'cover', params: { dir: 'l' } }),
    randomPool: true,
  },
  {
    name: 'curtains',
    description: 'Curtains — theatre curtains part to reveal the next slide (PPT 2013+)',
    ooxml: 'prstTrans',
    tier: 'ext',
    ns: 'p15',
    attrs: (p) => attr('prst', 'curtains') + attr('invX', p.invX) + attr('invY', p.invY),
    fallback: () => ({ effect: 'split', params: { orient: 'horz', dir: 'out' } }),
    randomPool: true,
  },
  {
    name: 'wind',
    description: 'Wind — the old slide is blown away (PPT 2013+)',
    ooxml: 'prstTrans',
    tier: 'ext',
    ns: 'p15',
    attrs: (p) => attr('prst', 'wind') + attr('invX', p.invX) + attr('invY', p.invY),
    fallback: () => ({ effect: 'push', params: { dir: 'r' } }),
    randomPool: true,
  },
  {
    name: 'prestige',
    description: 'Prestige — the old slide shatters and floats away (PPT 2013+)',
    ooxml: 'prstTrans',
    tier: 'ext',
    ns: 'p15',
    attrs: (p) => attr('prst', 'prestige') + attr('invX', p.invX) + attr('invY', p.invY),
    fallback: () => ({ effect: 'dissolve' }),
    randomPool: true,
  },
  {
    name: 'fracture',
    description: 'Fracture — the old slide cracks apart (PPT 2013+)',
    ooxml: 'prstTrans',
    tier: 'ext',
    ns: 'p15',
    attrs: (p) => attr('prst', 'fracture') + attr('invX', p.invX) + attr('invY', p.invY),
    fallback: () => ({ effect: 'fade' }),
    randomPool: true,
  },
  {
    name: 'crush',
    description: 'Crush — the old slide is crushed away (PPT 2013+)',
    ooxml: 'prstTrans',
    tier: 'ext',
    ns: 'p15',
    attrs: (p) => attr('prst', 'crush') + attr('invX', p.invX) + attr('invY', p.invY),
    fallback: () => ({ effect: 'fade' }),
    randomPool: true,
  },
  {
    name: 'peel-off',
    description: 'Peel off — peel the old slide off like a sticker (PPT 2013+)',
    ooxml: 'prstTrans',
    tier: 'ext',
    ns: 'p15',
    attrs: (p) => attr('prst', 'peelOff') + attr('invX', p.invX) + attr('invY', p.invY),
    fallback: () => ({ effect: 'pull', params: { dir: 'lu' } }),
    randomPool: true,
  },
  {
    name: 'page-curl-single',
    description: 'Page curl (single) — curl one corner like turning a page (PPT 2013+)',
    ooxml: 'prstTrans',
    tier: 'ext',
    ns: 'p15',
    attrs: (p) => attr('prst', 'pageCurlSingle') + attr('invX', p.invX) + attr('invY', p.invY),
    fallback: () => ({ effect: 'pull', params: { dir: 'lu' } }),
    randomPool: true,
  },
  {
    name: 'page-curl-double',
    description: 'Page curl (double) — curl two corners like a magazine (PPT 2013+)',
    ooxml: 'prstTrans',
    tier: 'ext',
    ns: 'p15',
    attrs: (p) => attr('prst', 'pageCurlDouble') + attr('invX', p.invX) + attr('invY', p.invY),
    fallback: () => ({ effect: 'pull', params: { dir: 'lu' } }),
    randomPool: true,
  },
  {
    name: 'airplane',
    description: 'Airplane — the old slide folds into a paper plane and flies off (PPT 2013+)',
    ooxml: 'prstTrans',
    tier: 'ext',
    ns: 'p15',
    attrs: (p) => attr('prst', 'airplane') + attr('invX', p.invX) + attr('invY', p.invY),
    fallback: () => ({ effect: 'push', params: { dir: 'l' } }),
    randomPool: true,
  },
  {
    name: 'origami',
    description: 'Origami — the old slide folds away like paper (PPT 2013+)',
    ooxml: 'prstTrans',
    tier: 'ext',
    ns: 'p15',
    attrs: (p) => attr('prst', 'origami') + attr('invX', p.invX) + attr('invY', p.invY),
    fallback: () => ({ effect: 'push', params: { dir: 'l' } }),
    randomPool: true,
  },

  // ------------------------------------------------------------------
  // Ext tier — p159 (PowerPoint 2019 / Microsoft 365) morph
  // ------------------------------------------------------------------
  {
    name: 'morph',
    description:
      'Morph — animate shared objects smoothly between slides (PPT 2019 / M365; ' +
      'needs matching objects on consecutive slides)',
    ooxml: 'morph',
    tier: 'ext',
    ns: 'p159',
    attrs: (p) => attr('option', p.option ?? 'byObject'),
    fallback: () => ({ effect: 'fade' }),
    // Excluded from random: looks wrong without shared objects across slides.
    randomPool: false,
  },
] as const;

const BY_NAME = new Map(
  SLIDE_TRANSITION_EFFECTS.map((e) => [e.name.toLowerCase(), e] as const)
);

/** All user-facing effect names (stable order). */
export function listSlideTransitionEffectNames(): string[] {
  return SLIDE_TRANSITION_EFFECTS.map((e) => e.name);
}

/** Effect names of one tier (`base` = ISO; `ext` = Office extensions). */
export function listSlideTransitionEffectNamesByTier(tier: 'base' | 'ext'): string[] {
  return SLIDE_TRANSITION_EFFECTS.filter(
    (e) => (e.tier ?? 'base') === tier
  ).map((e) => e.name);
}

export function getSlideTransitionEffect(
  name: string
): SlideTransitionEffectDef | undefined {
  return BY_NAME.get(name.trim().toLowerCase());
}

export function isSlideTransitionEffectName(name: string): boolean {
  return BY_NAME.has(name.trim().toLowerCase());
}

/** Effects eligible when generation-time random is requested. */
export function listRandomPoolEffects(): SlideTransitionEffectDef[] {
  return SLIDE_TRANSITION_EFFECTS.filter((e) => e.randomPool !== false);
}

export interface BuildTransitionXmlOptions {
  speed?: TransitionSpeed;
  /** Override direction / orient / etc. after resolve. */
  params?: Partial<ResolvedTransitionParams>;
}

function buildChildXml(tag: string, attrs: string): string {
  return attrs ? `<${tag}${attrs}/>` : `<${tag}/>`;
}

/**
 * Serialize an ext-tier effect as `mc:AlternateContent`:
 * the extension transition inside `mc:Choice` (requires p14 / p15 / p159),
 * a plain base transition inside `mc:Fallback` for renderers without it.
 */
function buildExtTransitionXml(
  effect: SlideTransitionEffectDef,
  params: ResolvedTransitionParams
): string {
  const ns = effect.ns!;
  const child = buildChildXml(`${ns}:${effect.ooxml}`, effect.attrs?.(params) ?? '');

  const fallbackSpec = effect.fallback?.(params) ?? { effect: 'fade' };
  const fallbackDef = getSlideTransitionEffect(fallbackSpec.effect);
  if (!fallbackDef || (fallbackDef.tier ?? 'base') !== 'base') {
    throw new Error(
      `Slide transition "${effect.name}" has an invalid fallback "${fallbackSpec.effect}"`
    );
  }
  const fallbackParams: ResolvedTransitionParams = {
    speed: params.speed,
    ...fallbackSpec.params,
  };
  const fallbackChild = buildChildXml(
    `p:${fallbackDef.ooxml}`,
    fallbackDef.attrs?.(fallbackParams) ?? ''
  );

  return (
    `<mc:AlternateContent xmlns:mc="${MC_NS}">` +
    `<mc:Choice xmlns:${ns}="${TRANSITION_EXT_NS_URIS[ns]}" Requires="${ns}">` +
    `<p:transition spd="${params.speed}">${child}</p:transition>` +
    `</mc:Choice>` +
    `<mc:Fallback>` +
    `<p:transition spd="${params.speed}">${fallbackChild}</p:transition>` +
    `</mc:Fallback>` +
    `</mc:AlternateContent>`
  );
}

/** Build the transition OOXML fragment for a catalog effect. */
export function buildTransitionXml(
  effect: SlideTransitionEffectDef,
  options: BuildTransitionXmlOptions = {}
): string {
  const speed = options.speed ?? 'med';
  const params: ResolvedTransitionParams = {
    speed,
    ...options.params,
  };

  if ((effect.tier ?? 'base') === 'ext') {
    return buildExtTransitionXml(effect, params);
  }

  const child = buildChildXml(`p:${effect.ooxml}`, effect.attrs?.(params) ?? '');
  return `<p:transition spd="${speed}">${child}</p:transition>`;
}

/**
 * Fill in directional / orient params for effects that need them.
 * Uses `pick` so callers can inject a seeded RNG.
 */
export function resolveEffectParams(
  effect: SlideTransitionEffectDef,
  pick: <T>(items: readonly T[]) => T,
  overrides: Partial<ResolvedTransitionParams> = {}
): ResolvedTransitionParams {
  const params: ResolvedTransitionParams = {
    speed: overrides.speed ?? 'med',
    ...overrides,
  };

  switch (effect.name) {
    // ---- base tier -------------------------------------------------
    case 'push':
    case 'wipe':
      if (!params.dir) params.dir = pick(SIDE_DIRS);
      break;
    case 'cover':
    case 'pull':
      if (!params.dir) params.dir = pick(EIGHT_DIRS);
      break;
    case 'strips':
      if (!params.dir) params.dir = pick(CORNER_DIRS);
      break;
    case 'split':
      if (!params.orient) params.orient = pick(ORIENTS);
      if (!params.dir) params.dir = pick(IN_OUTS);
      break;
    case 'blinds':
    case 'checker':
    case 'comb':
    case 'random-bar':
      if (!params.orient) params.orient = pick(ORIENTS);
      break;
    case 'wheel':
      if (params.spokes === undefined) params.spokes = pick(WHEEL_SPOKES);
      break;
    case 'zoom':
      if (!params.dir) params.dir = pick(IN_OUTS);
      break;
    case 'fade':
    case 'cut':
      if (params.thruBlk === undefined) params.thruBlk = false;
      break;
    case 'fade-through-black':
      params.thruBlk = true;
      break;

    // ---- p14 ext tier ----------------------------------------------
    case 'conveyor':
    case 'ferris':
    case 'flip':
    case 'gallery':
    case 'switch':
    case 'reveal':
      if (!params.dir) params.dir = pick(LEFT_RIGHTS);
      break;
    case 'doors':
    case 'window':
      if (!params.orient) params.orient = pick(ORIENTS);
      break;
    case 'pan':
    case 'vortex':
      if (!params.dir) params.dir = pick(SIDE_DIRS);
      break;
    case 'prism':
      if (!params.dir) params.dir = pick(SIDE_DIRS);
      if (params.isContent === undefined) params.isContent = false;
      if (params.isInverted === undefined) params.isInverted = false;
      break;
    case 'glitter':
      if (!params.dir) params.dir = pick(SIDE_DIRS);
      if (!params.pattern) params.pattern = pick(GLITTER_PATTERNS);
      break;
    case 'ripple':
      if (!params.dir) params.dir = pick(CORNER_CENTER_DIRS);
      break;
    case 'shred':
      if (!params.pattern) params.pattern = pick(SHRED_PATTERNS);
      if (!params.dir) params.dir = pick(IN_OUTS);
      break;
    case 'warp':
    case 'flythrough':
      if (!params.dir) params.dir = pick(IN_OUTS);
      break;
    case 'wheel-reverse':
      if (params.spokes === undefined) params.spokes = pick(WHEEL_SPOKES);
      break;

    // ---- p15 / p159 ext tier ---------------------------------------
    case 'morph':
      if (!params.option) params.option = 'byObject';
      break;
    default:
      break;
  }

  return params;
}
