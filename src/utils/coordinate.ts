/**
 * Coordinate and unit conversion utilities
 *
 * The HTML viewport is mapped to a fixed PPTX slide of 10in × 5.625in
 * (standard 16:9). The reference (1×) viewport is 1280px × 720px:
 *   1px → 10/1280 inch horizontally, 1px → 5.625/720 inch vertically.
 *
 * Larger viewports (e.g. 1920 × 1080) are projected onto the same slide,
 * so positions/sizes are scaled down automatically by `pxToInchX/Y`.
 *
 * Font-related lengths (px → pt for fontSize, padding, border, shadow,
 * letter-spacing, line-height, …) live in a different unit space (points)
 * that does not vary with `slideWidthPx`. To keep their visual size in
 * sync with positions/sizes, we apply a `fontScaleFactor = 1280 / slideWidthPx`
 * inside `pxToPoints`. So when the source HTML is 1920×1080, every px → pt
 * conversion is automatically scaled down by 1.5×, matching the geometry.
 */

export const SLIDE_WIDTH_INCH = 10;
export const SLIDE_HEIGHT_INCH = 5.625;

/** Reference viewport that the empirical px→pt ratio (0.58) was calibrated for. */
const STANDARD_WIDTH_PX = 1280;
const STANDARD_HEIGHT_PX = 720;

let slideWidthPx = STANDARD_WIDTH_PX;
let slideHeightPx = STANDARD_HEIGHT_PX;
let fontScaleFactor = 1;

/**
 * Set HTML viewport size used for this conversion (Playwright + px→inch mapping).
 * Call before loading the page / inspecting. Height defaults to 720.
 *
 * Also derives the default font scale factor from the new viewport width so
 * px → pt conversions (font size, padding, border, shadow, …) stay consistent
 * with px → inch positions when the viewport is not 1280×720.
 */
export function setViewportPixels(widthPx: number, heightPx: number = STANDARD_HEIGHT_PX): void {
  const w = Number(widthPx);
  const h = Number(heightPx);
  if (!Number.isFinite(w) || w <= 0) {
    slideWidthPx = STANDARD_WIDTH_PX;
    slideHeightPx = STANDARD_HEIGHT_PX;
  } else {
    slideWidthPx = Math.round(w);
    if (!Number.isFinite(h) || h <= 0) {
      slideHeightPx = STANDARD_HEIGHT_PX;
    } else {
      slideHeightPx = Math.round(h);
    }
  }
  fontScaleFactor = STANDARD_WIDTH_PX / slideWidthPx;
}

export function getSlideWidthPx(): number {
  return slideWidthPx;
}

export function getSlideHeightPx(): number {
  return slideHeightPx;
}

/**
 * Horizontal px → inches (maps viewport width to slide width in inches)
 */
export function pxToInchX(px: number): number {
  return (px * SLIDE_WIDTH_INCH) / slideWidthPx;
}

/**
 * Vertical px → inches (maps viewport height to slide height in inches)
 */
export function pxToInchY(px: number): number {
  return (px * SLIDE_HEIGHT_INCH) / slideHeightPx;
}

/**
 * Neutral lengths (blur radius, uniform border-radius when scales match): average of axis scales.
 */
export function pxToInch(px: number): number {
  return (pxToInchX(px) + pxToInchY(px)) / 2;
}

/**
 * Convert pixels to points (for font sizes, padding, border, shadow, …).
 *
 * 0.58 is the empirically calibrated ratio at the 1280px reference viewport.
 * The active `fontScaleFactor` (defaults to `1280 / slideWidthPx`) keeps the
 * conversion consistent across non-standard viewports — e.g. a 48px font in
 * a 1920px-wide HTML becomes the same PPT point size as a 32px font in a
 * 1280px-wide HTML.
 */
export function pxToPoints(px: number): number {
  return px * 0.58 * fontScaleFactor;
}

/**
 * Convert inches to points
 */
export function inchToPoints(inch: number): number {
  return inch * 72;
}
