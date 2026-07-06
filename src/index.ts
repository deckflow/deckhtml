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
  type PlatformFontContext,
  type PlatformFontLang,
  type PlatformTarget,
} from './utils/platformFontMap';
