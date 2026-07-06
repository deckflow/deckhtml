/**
 * Platform / language generic font mapping for PPTX conversion.
 * Maps sans-serif, serif, and system UI generics to OS-specific fonts.
 */
import { splitFontStack } from './chineseFonts';

export type PlatformTarget = 'win' | 'mac';
export type PlatformFontLang = 'sc' | 'tc' | 'jp' | 'kr' | 'ar' | 'he' | 'latin';

export interface PlatformFontContext {
  platform: PlatformTarget;
  lang: PlatformFontLang;
}

interface PlatformFontRow {
  sansWin: string;
  sansMac: string;
  serifWin: string;
  serifMac: string;
}

const PLATFORM_LANG_FONT_MAP: Record<PlatformFontLang, PlatformFontRow> = {
  latin: {
    sansWin: 'Arial',
    sansMac: 'San Francisco',
    serifWin: 'Times New Roman',
    serifMac: 'Times New Roman',
  },
  sc: {
    sansWin: 'Microsoft YaHei',
    sansMac: 'PingFang SC',
    serifWin: 'SimSun',
    serifMac: 'Songti SC',
  },
  tc: {
    sansWin: 'Microsoft JhengHei',
    sansMac: 'PingFang TC',
    serifWin: 'PMingLiU',
    serifMac: 'Songti TC',
  },
  jp: {
    sansWin: 'MS PGothic',
    sansMac: 'YuGothic',
    serifWin: 'MS PMincho',
    serifMac: 'YuMincho',
  },
  kr: {
    sansWin: 'Malgun Gothic',
    sansMac: 'Apple SD Gothic Neo',
    serifWin: 'Batang',
    serifMac: 'AppleMyungjo',
  },
  ar: {
    sansWin: 'Segoe UI Arabic',
    sansMac: 'Geeza Pro',
    serifWin: 'Traditional Arabic',
    serifMac: 'Baghdad',
  },
  he: {
    sansWin: 'Segoe UI',
    sansMac: 'Arial',
    serifWin: 'David',
    serifMac: 'Corsiva Hebrew',
  },
};

const GENERIC_SANS =
  /^(sans-serif|system-ui|ui-sans-serif|-apple-system|blinkmacsystemfont)$/i;
const GENERIC_SERIF = /^(serif|ui-serif)$/i;

function unquoteToken(token: string): string {
  return token.trim().replace(/^['"]|['"]$/g, '');
}

export function isPlatformFontContextActive(
  ctx?: PlatformFontContext
): ctx is PlatformFontContext {
  return ctx?.platform != null && ctx?.lang != null;
}

export function getPlatformMappedFont(
  generic: 'sans' | 'serif',
  ctx: PlatformFontContext
): string {
  const row = PLATFORM_LANG_FONT_MAP[ctx.lang];
  if (generic === 'serif') {
    return ctx.platform === 'win' ? row.serifWin : row.serifMac;
  }
  return ctx.platform === 'win' ? row.sansWin : row.sansMac;
}

export function isGenericSansToken(token: string): boolean {
  return GENERIC_SANS.test(unquoteToken(token).toLowerCase());
}

export function isGenericSerifToken(token: string): boolean {
  return GENERIC_SERIF.test(unquoteToken(token).toLowerCase());
}

/** Last generic kind in stack wins (CSS fallback order). */
export function detectStackGenericKind(
  fontFamily: string | undefined
): 'sans' | 'serif' | undefined {
  if (!fontFamily) return undefined;
  let last: 'sans' | 'serif' | undefined;
  for (const tok of splitFontStack(fontFamily)) {
    if (isGenericSansToken(tok)) last = 'sans';
    else if (isGenericSerifToken(tok)) last = 'serif';
  }
  return last;
}

export function stackHasNamedFont(fontFamily: string | undefined): boolean {
  if (!fontFamily) return false;
  return splitFontStack(fontFamily).some((tok) => {
    const core = unquoteToken(tok).toLowerCase();
    return core && !GENERIC_SANS.test(core) && !GENERIC_SERIF.test(core);
  });
}

export function replaceGenericFontTokensInStack(
  fontFamily: string,
  ctx: PlatformFontContext
): string {
  const tokens = splitFontStack(fontFamily);
  if (!tokens.length) return fontFamily;

  let changed = false;
  const replaced = tokens.map((tok) => {
    if (isGenericSansToken(tok)) {
      changed = true;
      return getPlatformMappedFont('sans', ctx);
    }
    if (isGenericSerifToken(tok)) {
      changed = true;
      return getPlatformMappedFont('serif', ctx);
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
  ctx: PlatformFontContext
): string {
  const specifiedGeneric = detectStackGenericKind(specifiedFamily);
  const computedGeneric = detectStackGenericKind(computedFamily);

  if (specifiedGeneric && specifiedFamily && !stackHasNamedFont(specifiedFamily)) {
    return getPlatformMappedFont(specifiedGeneric, ctx);
  }

  const base = computedFamily ?? specifiedFamily ?? '';
  if (!base) {
    return getPlatformMappedFont(specifiedGeneric ?? computedGeneric ?? 'sans', ctx);
  }

  let resolved = replaceGenericFontTokensInStack(base, ctx);

  if (
    specifiedGeneric &&
    specifiedFamily &&
    stackHasNamedFont(specifiedFamily) &&
    !computedGeneric
  ) {
    resolved = replaceGenericFontTokensInStack(specifiedFamily, ctx);
  }

  return resolved;
}

export function buildPlatformFontContext(options: {
  platform?: PlatformTarget;
  lang?: PlatformFontLang;
}): PlatformFontContext | undefined {
  if (options.platform && options.lang) {
    return { platform: options.platform, lang: options.lang };
  }
  return undefined;
}
