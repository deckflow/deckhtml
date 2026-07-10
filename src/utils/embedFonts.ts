import { extractCoreFontName, splitFontStack } from './chineseFonts';
import { EMBED_FONT_INDEX_META, EMBED_FONT_SEARCH_INDEX } from './embedFonts.index';

export { EMBED_FONT_INDEX_META };

export interface FontEmbedMatch {
  /** Font family name used in the presentation */
  used: string;
  /** Matched family name in the cloud embed font library */
  matchedFamily: string;
}

export interface FontEmbedProbeResult {
  matched: FontEmbedMatch[];
  unmatched: string[];
  indexMeta: typeof EMBED_FONT_INDEX_META;
}

function toSearchKey(name: string): string {
  return name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '');
}

function lookupFamily(name: string): string | null {
  const candidates = [
    toSearchKey(name),
    toSearchKey(extractCoreFontName(name)),
  ].filter((key) => key.length >= 2);

  for (const key of candidates) {
    const family = EMBED_FONT_SEARCH_INDEX[key];
    if (family) return family;
  }
  return null;
}

/** Match a single font-family token or stack against the embed font library. */
export function matchEmbeddableFont(fontNameOrStack: string): string | null {
  const tokens =
    fontNameOrStack.includes(',') ? splitFontStack(fontNameOrStack) : [fontNameOrStack];

  for (const raw of tokens) {
    const family = lookupFamily(raw);
    if (family) return family;
  }
  return null;
}

/** Probe which presentation font families can be embedded from the cloud library. */
export function probeEmbeddableFonts(usedFamilies: string[]): FontEmbedProbeResult {
  const matched: FontEmbedMatch[] = [];
  const unmatched: string[] = [];
  const seenMatched = new Set<string>();
  const seenUnmatched = new Set<string>();

  for (const used of usedFamilies) {
    const family = matchEmbeddableFont(used);
    if (family) {
      const key = `${used}\0${family}`;
      if (!seenMatched.has(key)) {
        seenMatched.add(key);
        matched.push({ used, matchedFamily: family });
      }
    } else if (!seenUnmatched.has(used)) {
      seenUnmatched.add(used);
      unmatched.push(used);
    }
  }

  matched.sort((a, b) => a.used.localeCompare(b.used));
  unmatched.sort((a, b) => a.localeCompare(b));

  return {
    matched,
    unmatched,
    indexMeta: EMBED_FONT_INDEX_META,
  };
}
