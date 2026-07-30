/**
 * PowerPoint slide-to-slide transition catalog (OOXML `p:transition`).
 *
 * These are transitions between slides — not element entrance animations
 * (`data-animation` / `p:timing`).
 */

export type TransitionSpeed = 'slow' | 'med' | 'fast';

export type SideDirection = 'l' | 'r' | 'u' | 'd';
export type CornerDirection = 'ld' | 'lu' | 'rd' | 'ru';
export type EightDirection = SideDirection | CornerDirection;
export type Orient = 'horz' | 'vert';
export type InOut = 'in' | 'out';

export interface SlideTransitionEffectDef {
  /** User-facing name (CLI / API). */
  name: string;
  /** Short description. */
  description: string;
  /** OOXML child element local name under `p:transition`. */
  ooxml: string;
  /** Build attribute string for the OOXML child (may be empty). */
  attrs?: (opts: ResolvedTransitionParams) => string;
  /** Eligible for generation-time random pick (excludes meta `random`). */
  randomPool?: boolean;
}

export interface ResolvedTransitionParams {
  speed: TransitionSpeed;
  /** Side / corner / in-out / orient extras resolved for this effect. */
  dir?: string;
  orient?: Orient;
  thruBlk?: boolean;
  spokes?: number;
}

export interface ResolvedSlideTransition {
  effect: string;
  speed: TransitionSpeed;
  params: ResolvedTransitionParams;
  /** Serialized OOXML fragment: `<p:transition …>…</p:transition>` */
  xml: string;
}

const SIDE_DIRS: SideDirection[] = ['l', 'r', 'u', 'd'];
const CORNER_DIRS: CornerDirection[] = ['ld', 'lu', 'rd', 'ru'];
const EIGHT_DIRS: EightDirection[] = [...SIDE_DIRS, ...CORNER_DIRS];
const ORIENTS: Orient[] = ['horz', 'vert'];
const IN_OUTS: InOut[] = ['in', 'out'];

function attr(name: string, value: string | number | boolean | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'boolean') return ` ${name}="${value ? '1' : '0'}"`;
  return ` ${name}="${value}"`;
}

/** Canonical catalog of slide transition effects. */
export const SLIDE_TRANSITION_EFFECTS: readonly SlideTransitionEffectDef[] = [
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
    name: 'random',
    description: 'PowerPoint picks a random transition at show time',
    ooxml: 'random',
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

/** Build `<p:transition …>…</p:transition>` for a catalog effect. */
export function buildTransitionXml(
  effect: SlideTransitionEffectDef,
  options: BuildTransitionXmlOptions = {}
): string {
  const speed = options.speed ?? 'med';
  const params: ResolvedTransitionParams = {
    speed,
    ...options.params,
  };
  const childAttrs = effect.attrs?.(params) ?? '';
  const child = childAttrs
    ? `<p:${effect.ooxml}${childAttrs}/>`
    : `<p:${effect.ooxml}/>`;
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
      if (params.spokes === undefined) params.spokes = pick([1, 2, 3, 4, 8]);
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
    default:
      break;
  }

  return params;
}
