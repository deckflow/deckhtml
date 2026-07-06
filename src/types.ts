/**
 * Type definitions for HTML to PPTX converter
 */

export interface ConversionOptions {
  input: string;
  slideSelector?: string;
  splitByHeight?: boolean;
  /** Browser viewport width in pixels (default 1280). Must match how the HTML is laid out. */
  viewportWidth?: number;
  /** Browser viewport height in pixels (default 720). */
  viewportHeight?: number;
  /** Allow loading local file:// subresources in Playwright (default: false). */
  allowLocalResources?: boolean;
  /** Target PPTX platform for generic font mapping (requires lang). */
  platform?: 'win' | 'mac';
  /** Target language/script for generic font mapping (requires platform). */
  lang?: 'sc' | 'tc' | 'jp' | 'kr' | 'ar' | 'he' | 'latin';
}

export interface ElementInfo {
  type: ElementType;
  tag: string;
  x: number;
  y: number;
  width: number;
  height: number;
  styles: ComputedStyles;
  content?: string;
  richText?: TextRun[]; // For multi-styled text (like h1 with colored spans)
  src?: string;
  /** Video poster URL when type is video */
  poster?: string;
  dataUrl?: string;
  /** Media failed to load or was blocked; use placeholder in PPTX */
  resourceUnavailable?: boolean;
  /** Original computed opacity on the SVG element itself (before ancestor multiplication). */
  svgSelfOpacity?: number;
  imageNaturalWidth?: number;  // Original image width in pixels
  imageNaturalHeight?: number; // Original image height in pixels
  /** Parent's border-radius in px when img has no own radius but parent clips with overflow-hidden */
  parentBorderRadiusPx?: number;
  tableData?: TableData;
  isIcon?: boolean; // For Font Awesome icons
  /** For li: space (px) reserved by parent ul/ol for bullet (margin-left + padding-left); subtract from x when positioning */
  listMarkerOffset?: number;
  /** For li: in-flow ::before horizontal footprint (px): margin-left + width + margin-right — added to PPT text margin-left (padding/border already in getTextOptions) */
  beforePseudoWidthPx?: number;
  /**
   * When the text box keeps the full border-box (e.g. pill with background) but in-flow siblings
   * (::before, SVG, img, …) push the first glyph right of padding+border, add this (px) on top
   * of PPT margin-left so text clears those decorations.
   */
  textFlowExtraMarginLeftPx?: number;
  /**
   * Text align for a flex item when parent uses justify-content: space-* (row).
   * Last in-flow item → right; first → left (row-reverse swaps ends).
   */
  flexItemTextAlign?: 'left' | 'right' | 'center';
  /** Element needs isolated Playwright screenshot (e.g. tiled gradient grid background) */
  needsScreenshot?: boolean;
  /** CSS selector for Playwright locator when needsScreenshot is true */
  screenshotSelector?: string;
  /** Playwright element screenshot already includes element opacity in PNG pixels */
  screenshotBakesOpacity?: boolean;
  /** Standalone SVG hybrid: rasterize graphics, extract text separately */
  svgHybridRaster?: boolean;
  /** Keep host background in Playwright screenshot (standalone SVG root fill) */
  screenshotPreserveBackground?: boolean;
  /** SVG <text>/<tspan> extracted for hybrid or decomposed conversion */
  svgText?: boolean;
  /** SVG hybrid: HTML label inside foreignObject (Mermaid etc.) — font metrics differ from native SVG text */
  svgForeignObjectText?: boolean;
  /** Decomposed native SVG tag (rect, circle, path, line, …) */
  svgTag?: string;
  /** SVG &lt;line&gt; endpoints in viewport px (absolute, same space as x/y) */
  svgLineEndpoints?: { x1: number; y1: number; x2: number; y2: number };
  /** Whether a decomposed SVG path/polygon should close (fill); false = open stroke polyline */
  svgPathClosed?: boolean;
  /** Raw SVG stroke-dasharray (e.g. "6,4") for PPT line dashType */
  svgStrokeDasharray?: string;
  /** SVG marker-start present (url(#…)) → PPT beginArrowType (fallback) */
  svgMarkerStart?: boolean;
  /** SVG marker-end present (url(#…)) → PPT endArrowType (fallback) */
  svgMarkerEnd?: boolean;
  /** Decomposed SVG marker arrowheads — preferred over PPT line arrows for color/size fidelity */
  svgMarkerShapes?: SvgMarkerShapeInfo[];
  /** SVG path commands in px relative to x/y (multi-subpath safe) */
  svgPathCommandsPx?: SvgPathCommandPx[];
  /**
   * Vertices in px, relative to x/y (same origin as width/height bbox).
   */
  clipPathPolygonPx?: { x: number; y: number }[];
  /** Serialized MathML (`<math>` outerHTML) for equation → OMML conversion */
  mathml?: string;
  /** block = display equation; inline = in-flow formula */
  mathDisplayMode?: 'block' | 'inline';
  /** OMML fragment (`<m:oMath>…</m:oMath>`) after MathML conversion */
  ommlXml?: string;
  /** Plain text for mc:Fallback when embedding OMML in PPT */
  mathFallbackText?: string;
}

/** SVG path command in OOXML path space 0–21600 */
export type SvgPathCommandNormalized =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | {
      type: 'A';
      rx: number;
      ry: number;
      rot: number;
      large: boolean;
      sweep: boolean;
      x: number;
      y: number;
    }
  | { type: 'Z' };

/** SVG path command in px relative to element bbox origin */
export type SvgPathCommandPx =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | {
      type: 'A';
      rx: number;
      ry: number;
      rot: number;
      large: boolean;
      sweep: boolean;
      x: number;
      y: number;
    }
  | { type: 'Z' };

/** Filled SVG marker arrowhead in viewport px (custGeom triangle/polygon) */
export interface SvgMarkerShapeInfo {
  x: number;
  y: number;
  width: number;
  height: number;
  clipPathPolygonPx: { x: number; y: number }[];
  atStart?: boolean;
  styles: Pick<ComputedStyles, 'backgroundColor' | 'opacity'>;
}

export interface TextRun {
  text: string;
  styles: ComputedStyles;
  /** display:block child tail → separate OOXML paragraph (pptxgen breakLine) */
  breakLine?: boolean;
  /** HTML &lt;br&gt; / soft wrap: same paragraph, pptxgen emits &lt;a:br/&gt; */
  softBreakBefore?: boolean;
}

export type ElementType =
  | 'text'
  | 'icon'
  | 'image'
  | 'video'
  | 'audio'
  | 'canvas'
  | 'svg'
  | 'math'
  | 'table'
  | 'shape'
  | 'container';

export interface ComputedStyles {
  // Text properties
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  /** Cascaded specified font-family stack (may contain sans-serif/serif generics). */
  fontFamilySpecified?: string;
  fontWeight?: string;
  fontStyle?: string;
  textDecoration?: string;
  textTransform?: string;
  textAlign?: string;
  /** CSS writing-mode (e.g. vertical-rl) */
  writingMode?: string;
  lineHeight?: string;
  letterSpacing?: string;
  listStyleType?: string;

  // Background properties
  backgroundColor?: string;
  /**
   * Rich-text runs only: CSS color string (rgb/rgba/hex) for OOXML a:highlight when the run still
   * carries pill-like styles (inline-block + border-radius + bg) where backgroundColor must not
   * drive highlight (converter suppresses highlight for isPillBox).
   */
  glyphHighlightColor?: string;
  /** Opaque ancestor fill used to composite semi-transparent text backgrounds → highlight */
  highlightBackdropColor?: string;
  backgroundImage?: string;
  filter?: string;
  backgroundClip?: string;
  webkitBackgroundClip?: string;
  opacity?: number;
  webkitTextFillColor?: string;
  /** e.g. `1.5px rgb(234, 193, 90)` — maps to PPT text outline */
  webkitTextStroke?: string;
  webkitTextStrokeWidth?: string;
  webkitTextStrokeColor?: string;
  
  // Image properties
  objectFit?: string;

  // Border properties
  borderColor?: string;
  borderWidth?: number;
  borderStyle?: string;
  borderRadius?: string;
  // Individual border sides
  borderLeftWidth?: string;
  borderRightWidth?: string;
  borderTopWidth?: string;
  borderBottomWidth?: string;
  borderLeftColor?: string;
  borderRightColor?: string;
  borderTopColor?: string;
  borderBottomColor?: string;
  borderLeftStyle?: string;
  borderRightStyle?: string;
  borderTopStyle?: string;
  borderBottomStyle?: string;

  // Shadow properties
  boxShadow?: string;
  textShadow?: string;

  // Layout
  display?: string;
  visibility?: string;
  zIndex?: number;

  // Transform (e.g. rotate(45deg))
  transform?: string;

  // Flexbox properties
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  justifyItems?: string;
  placeItems?: string;

  // Spacing
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;

  // Margins
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
}

export interface TableData {
  rows: TableRow[];
  colW?: number[]; // column widths in px (from getBoundingClientRect)
  rowH?: number[]; // row heights in px
  borderColor?: string;
  borderWidth?: number;
}

export interface TableRow {
  cells: TableCell[];
}

export interface TableCell {
  text: string;
  colSpan?: number;
  rowSpan?: number;
  styles?: ComputedStyles;
}

export interface SlideInfo {
  elements: ElementInfo[];
  index: number;
  startY: number;
  endY: number;
}

/** Font descriptor: web name + bold/italic, used when resolving to final font name (with or without suffix) */
export interface UsedFontDescriptor {
  fontFamily: string;
  bold?: boolean;
  italic?: boolean;
}

export interface ConversionResult {
  data: Buffer;
  slideCount?: number;
  /** Resolved font names (with Bold/Italic suffix only when exactly matched in registry) */
  usedFonts?: string[];
}

// Style enhancement types
export type StyleEnhancementType =
  | 'gradient'      // Gradient fill
  | 'textGradient'  // Gradient fill applied to text glyphs
  | 'scriptFonts'   // Text script fonts: latin/ea/cs
  | 'tableCellMargin'  // Table cell padding/margin
  | 'imageSizing'   // Image object-fit (cover/contain)
  | 'imageRoundRect'   // Image border-radius → roundRect preset shape
  | 'singleCornerRect' // Rect with only one rounded corner (e.g. border-bottom-left-radius)
  | 'singleSideBorder' // Single-side border with custGeom for rounded corners
  | 'softEdge'      // Soft edge effect (blurred shapes)
  | 'shadow'        // Complex shadow (future)
  | 'glow'          // Glow effect (box-shadow wrapping 3-4 sides)
  | 'clipPathPolygon' // clip-path polygon ∩ element rect → custGeom
  | 'writingMode'   // CSS writing-mode → a:bodyPr @vert
  | 'equation'      // MathML → OMML in text box (a14:m)
  | 'custom';       // Extensible

// Element record that needs post-processing
export interface StyleEnhancement {
  slideIndex: number;        // Slide index (0-based)
  elementIndex: number;      // Element index in slide._slideObjects (order-based lookup)
  type: StyleEnhancementType;
  sourceElement?: ElementInfo; // Original HTML element info
  gradientData?: GradientData;
  shadowData?: ShadowData;
  softEdgeRadiusPt?: number;
  softEdgeShadow?: {
    blurPt: number;
    distPt: number;
    angleDeg: number;
    color: string;
    opacity: number;
  };
  tableCellMarginPt?: number;  // Cell margin in points, 0 = compact
  objectFit?: 'cover' | 'contain';  // Image object-fit CSS property
  /** Index among `<p:pic>` nodes in the slide XML (0-based). */
  picIndex?: number;
  imageNaturalWidth?: number;  // Original image width for srcRect calculation
  imageNaturalHeight?: number; // Original image height for srcRect calculation
  containerWidth?: number;     // Container width in inches for srcRect calculation
  containerHeight?: number;    // Container height in inches for srcRect calculation
  imageBorderRadiusPx?: number;  // Image border-radius in px for roundRect adj
  imageWidthInch?: number;    // Image width in inches for adj calculation
  imageHeightInch?: number;   // Image height in inches for adj calculation
  /** [topLeft, topRight, bottomRight, bottomLeft] in inches - for singleCornerRect */
  cornerRadii?: [number, number, number, number];
  /** For singleSideBorder: 0=left, 1=top, 2=right, 3=bottom */
  side?: 0 | 1 | 2 | 3;
  borderWidthInch?: number;
  elementWidthInch?: number;
  elementHeightInch?: number;
  cornerRadiiInch?: [number, number, number, number];
  shapeWidthInch?: number;
  shapeHeightInch?: number;
  /** Add to gradient angle when path is rotated 180° (e.g. case 3 bottomLeft) - typically 180 */
  gradientAngleAdjustment?: number;
  /** clip-path ∩ box: polygon vertices in OOXML path space 0–21600 */
  clipPathPolygonNormalized?: { x: number; y: number }[];
  /** SVG path commands in OOXML path space 0–21600 (supports multiple subpaths) */
  clipPathCommandsNormalized?: SvgPathCommandNormalized[];
  /** When false, custGeom path stays open (stroke-only SVG polyline/path) */
  clipPathPolygonClosed?: boolean;
  /** Glow effect data (from box-shadow wrapping 3-4 sides) */
  glowData?: {
    radiusPt: number;   // glow radius in points
    color: string;      // hex RRGGBB
    alpha: number;      // 0-1
  };
  scriptFontFaces?: {
    latin: string;
    ea: string;
    cs: string;
  };
  /** OOXML ST_TextVerticalType for a:bodyPr @vert (e.g. eaVert, vert) */
  bodyPrVert?: string;
  /** OMML inner fragment for equation enhancement */
  ommlXml?: string;
  mathDisplayMode?: 'block' | 'inline';
  mathColorHex?: string;
  mathSzHalfPt?: number;
  mathJc?: 'left' | 'center' | 'right';
  mathFallbackText?: string;
}

// Gradient data
export interface GradientData {
  type: 'linear' | 'radial';
  angle?: number;            // Linear gradient angle (0-360 degrees)
  stops: GradientStop[];
  /** Radial: focal center as percentage 0–100 (maps to OOXML fillToRect) */
  radialCenterX?: number;
  radialCenterY?: number;
}

export interface GradientStop {
  color: string;             // Hex color (e.g. 'FF0000')
  position: number;          // Percentage position (0-100)
  alpha?: number;            // Transparency (0-1)
}

export interface ShadowData {
  offsetX: number;
  offsetY: number;
  blur: number;
  spread: number;
  color: string;
  alpha?: number;
}
