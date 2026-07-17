/**
 * Main entry point
 * Re-exports API for programmatic use
 */

export { convertHtmlToPptx, inspectHtmlFonts } from './api';
export { convertHtmlToPng, type PngConversionResult } from './png-export';
export { buildPngOutputPaths } from './utils/png-output-path';
export * from './types';
export {
  buildConversionReport,
  buildElementStats,
  buildFontStats,
  buildSimplifiedStats,
  EMPTY_CONVERSION_STATS,
  type ConversionReport,
  type ConversionStats,
  type ConversionElementStats,
  type ConversionFontStats,
  type ConversionSimplifiedStats,
  type ElementTypeCounts,
  type FontEmbedMatch,
  type FontEmbedProbeResult,
  type SimplifiedElementEntry,
  type SlideElementStats,
  type SlideSimplifiedStats,
} from './conversion-report';
export {
  probeEmbeddableFonts,
  matchEmbeddableFont,
  EMBED_FONT_INDEX_META,
} from './utils/embedFonts';
export { embedFontAwesomeFonts } from './utils/fa-font-embedder';
export {
  normalizeFontAwesomeFreeFamily,
  normalizeFontAwesomeFamily,
} from './utils/style';
export {
  isChineseFont,
  matchChineseFontAlias,
  splitFontStack,
  extractCoreFontName,
  type IsChineseFontOptions,
} from './utils/chineseFonts';
export {
  buildPlatformFontContext,
  DEFAULT_PLATFORM_TARGET,
  detectCurrentPlatformTarget,
  type GenericFontKind,
  type GenericFontName,
  type PlatformFontContext,
  type PlatformFontLang,
  type PlatformFontMappingEntry,
  type PlatformTarget,
  GENERIC_FONT_OS_MAP,
  detectStackGenericKind,
  detectStackGenericName,
  genericKindFromToken,
  genericNameFromToken,
  getPlatformFontMapping,
  getPlatformFontMappingByName,
  getPlatformMappedFont,
  getPlatformMappedFontByToken,
  getPlatformMappedFontStack,
  isGenericFontToken,
} from './utils/platformFontMap';
