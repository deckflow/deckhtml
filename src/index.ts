/**
 * Main entry point
 * Re-exports API for programmatic use
 */

export { convertHtmlToPptx } from './api';
export * from './types';
export {
  isChineseFont,
  matchChineseFontAlias,
  splitFontStack,
  extractCoreFontName,
  type IsChineseFontOptions,
} from './utils/chineseFonts';
export {
  buildPlatformFontContext,
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
