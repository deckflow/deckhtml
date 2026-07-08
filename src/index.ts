/**
 * Main entry point
 * Re-exports API for programmatic use
 */

export { convertHtmlToPptx } from './api';
export * from './types';
export {
  buildConversionReport,
  buildElementStats,
  buildFontStats,
  EMPTY_CONVERSION_STATS,
  type ConversionReport,
  type ConversionStats,
  type ConversionElementStats,
  type ConversionFontStats,
  type ElementTypeCounts,
  type SlideElementStats,
} from './conversion-report';
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
