/**
 * Platform / language generic font mapping for PPTX conversion.
 * Maps CSS generic font-family keywords to OS-specific fonts.
 *
 * Data: platformFontMap.data.ts (synced from @deckflow/html2pptx)
 */
import { splitFontStack } from './chineseFonts';
import { GENERIC_FONT_OS_MAP, PlatformFontMappingEntry } from './platformFontMap.data';

/** PPTX target platforms with full mapping tables. */
export type PlatformTarget = 'win' | 'mac' | 'ios' | 'android' | 'linux';

/** Default platform when callers omit `platform` (programmatic API). */
export const DEFAULT_PLATFORM_TARGET: PlatformTarget = 'win';

export type PlatformFontLang = 'sc' | 'tc' | 'jp' | 'kr' | 'ar' | 'he' | 'latin';

/** CSS generic font-family keywords (each may map to a different OS font). */
export type GenericFontName =
  | 'serif'
  | 'sans-serif'
  | 'monospace'
  | 'cursive'
  | 'fantasy'
  | 'system-ui'
  | 'ui-serif'
  | 'ui-sans-serif'
  | 'ui-monospace'
  | 'math';

/** Collapsed family category for script-slot logic (sans vs serif vs mono, etc.). */
export type GenericFontKind = 'serif' | 'sans' | 'monospace' | 'cursive' | 'fantasy' | 'math';

export interface PlatformFontContext {
  platform: PlatformTarget;
}

/** CSS token (incl. vendor aliases) → CSV generic_name key. */
const TOKEN_TO_GENERIC_NAME: Record<string, GenericFontName> = {
  serif: 'serif',
  'ui-serif': 'ui-serif',
  'sans-serif': 'sans-serif',
  'system-ui': 'system-ui',
  'ui-sans-serif': 'ui-sans-serif',
  '-apple-system': 'system-ui',
  blinkmacsystemfont: 'system-ui',
  monospace: 'monospace',
  'ui-monospace': 'ui-monospace',
  cursive: 'cursive',
  fantasy: 'fantasy',
  math: 'math',
};

/** generic_name → collapsed kind for applyPlatformScriptSlots. */
const GENERIC_NAME_TO_KIND: Record<GenericFontName, GenericFontKind> = {
  serif: 'serif',
  'ui-serif': 'serif',
  'sans-serif': 'sans',
  'system-ui': 'sans',
  'ui-sans-serif': 'sans',
  monospace: 'monospace',
  'ui-monospace': 'monospace',
  cursive: 'cursive',
  fantasy: 'fantasy',
  math: 'math',
};

/** Default generic_name when resolving by collapsed kind only. */
const KIND_CANONICAL_NAME: Record<GenericFontKind, GenericFontName> = {
  serif: 'serif',
  sans: 'sans-serif',
  monospace: 'monospace',
  cursive: 'cursive',
  fantasy: 'fantasy',
  math: 'math',
};

const ALL_GENERIC_TOKENS = new Set(Object.keys(TOKEN_TO_GENERIC_NAME));

function unquoteToken(token: string): string {
  return token.trim().replace(/^['"]|['"]$/g, '');
}

function tokenCore(token: string): string {
  return unquoteToken(token).toLowerCase();
}

export function genericNameFromToken(token: string): GenericFontName | undefined {
  return TOKEN_TO_GENERIC_NAME[tokenCore(token)];
}

export function genericKindFromToken(token: string): GenericFontKind | undefined {
  const name = genericNameFromToken(token);
  return name ? GENERIC_NAME_TO_KIND[name] : undefined;
}

export function isGenericFontToken(token: string): boolean {
  return ALL_GENERIC_TOKENS.has(tokenCore(token));
}

export function isPlatformFontContextActive(
  ctx?: PlatformFontContext
): ctx is PlatformFontContext {
  return ctx?.platform != null;
}

export function getPlatformFontMappingByName(
  genericName: GenericFontName,
  ctx: PlatformFontContext,
  lang: PlatformFontLang = 'latin'
): PlatformFontMappingEntry {
  return GENERIC_FONT_OS_MAP[ctx.platform][lang][genericName];
}

export function getPlatformFontMapping(
  kind: GenericFontKind,
  ctx: PlatformFontContext,
  lang: PlatformFontLang = 'latin'
): PlatformFontMappingEntry {
  return getPlatformFontMappingByName(KIND_CANONICAL_NAME[kind], ctx, lang);
}

/** Primary PPTX font for a CSS generic token on the target platform/locale. */
export function getPlatformMappedFontByToken(
  token: string,
  ctx: PlatformFontContext,
  lang: PlatformFontLang = 'latin'
): string | undefined {
  const name = genericNameFromToken(token);
  if (!name) return undefined;
  return getPlatformFontMappingByName(name, ctx, lang).primary;
}

/** Primary PPTX font for a collapsed kind (uses canonical generic_name). */
export function getPlatformMappedFont(
  kind: GenericFontKind,
  ctx: PlatformFontContext,
  lang: PlatformFontLang = 'latin'
): string {
  return getPlatformFontMapping(kind, ctx, lang).primary;
}

/** Primary + fallback stack as a CSS-like comma-separated list. */
export function getPlatformMappedFontStack(
  kind: GenericFontKind,
  ctx: PlatformFontContext,
  lang: PlatformFontLang = 'latin'
): string {
  const { primary, fallbacks } = getPlatformFontMapping(kind, ctx, lang);
  return [primary, ...fallbacks].join(', ');
}

export function isGenericSansToken(token: string): boolean {
  return genericKindFromToken(token) === 'sans';
}

export function isGenericSerifToken(token: string): boolean {
  return genericKindFromToken(token) === 'serif';
}

/** Last generic kind in stack wins (CSS fallback order). */
export function detectStackGenericKind(
  fontFamily: string | undefined
): GenericFontKind | undefined {
  if (!fontFamily) return undefined;
  let last: GenericFontKind | undefined;
  for (const tok of splitFontStack(fontFamily)) {
    const kind = genericKindFromToken(tok);
    if (kind) last = kind;
  }
  return last;
}

/** Last generic token name in stack wins (preserves sans-serif vs system-ui distinction). */
export function detectStackGenericName(
  fontFamily: string | undefined
): GenericFontName | undefined {
  if (!fontFamily) return undefined;
  let last: GenericFontName | undefined;
  for (const tok of splitFontStack(fontFamily)) {
    const name = genericNameFromToken(tok);
    if (name) last = name;
  }
  return last;
}

export function stackHasNamedFont(fontFamily: string | undefined): boolean {
  if (!fontFamily) return false;
  return splitFontStack(fontFamily).some((tok) => {
    const core = tokenCore(tok);
    return core && !ALL_GENERIC_TOKENS.has(core);
  });
}

export function replaceGenericFontTokensInStack(
  fontFamily: string,
  ctx: PlatformFontContext,
  lang: PlatformFontLang = 'latin'
): string {
  const tokens = splitFontStack(fontFamily);
  if (!tokens.length) return fontFamily;

  let changed = false;
  const replaced = tokens.map((tok) => {
    const mapped = getPlatformMappedFontByToken(tok, ctx, lang);
    if (mapped) {
      changed = true;
      return mapped;
    }
    return tok;
  });

  return changed ? replaced.join(', ') : fontFamily;
}

/**
 * Merge specified + computed font stacks and apply platform generic mapping.
 */
export function resolveFontFamilyForPlatform(
  computedFamily: string | undefined,
  specifiedFamily: string | undefined,
  ctx: PlatformFontContext,
  lang: PlatformFontLang = 'latin'
): string {
  const specifiedName = detectStackGenericName(specifiedFamily);
  const computedName = detectStackGenericName(computedFamily);
  const specifiedKind = specifiedName ? GENERIC_NAME_TO_KIND[specifiedName] : undefined;
  const computedKind = computedName ? GENERIC_NAME_TO_KIND[computedName] : undefined;

  if (specifiedName && specifiedFamily && !stackHasNamedFont(specifiedFamily)) {
    return getPlatformFontMappingByName(specifiedName, ctx, lang).primary;
  }

  const base = computedFamily ?? specifiedFamily ?? '';
  if (!base) {
    const fallbackName =
      specifiedName ??
      computedName ??
      KIND_CANONICAL_NAME[specifiedKind ?? computedKind ?? 'sans'];
    return getPlatformFontMappingByName(fallbackName, ctx, lang).primary;
  }

  let resolved = replaceGenericFontTokensInStack(base, ctx, lang);

  if (
    specifiedName &&
    specifiedFamily &&
    stackHasNamedFont(specifiedFamily) &&
    !computedName
  ) {
    resolved = replaceGenericFontTokensInStack(specifiedFamily, ctx, lang);
  }

  return resolved;
}

/** Map Node.js `process.platform` to a PPTX font-mapping target. */
export function detectCurrentPlatformTarget(): PlatformTarget {
  switch (process.platform) {
    case 'win32':
      return 'win';
    case 'darwin':
      return 'mac';
    case 'linux':
      return 'linux';
    default:
      return DEFAULT_PLATFORM_TARGET;
  }
}

export function buildPlatformFontContext(options: {
  platform?: PlatformTarget;
} = {}): PlatformFontContext {
  return { platform: options.platform ?? DEFAULT_PLATFORM_TARGET };
}

export { GENERIC_FONT_OS_MAP, type PlatformFontMappingEntry };
