/**
 * PPTX Generator Module
 * Creates PowerPoint presentations using pptxgenjs
 */

import PptxGenJS from 'pptxgenjs';
import { ElementInfo, UsedFontDescriptor } from './types';
import { ElementConverter } from './converter';
import { SLIDE_WIDTH_INCH, SLIDE_HEIGHT_INCH, getSlideHeightPx } from './utils/coordinate';
import { PlatformFontContext } from './utils/platformFontMap';
import { StyleEnhancementRegistry } from './enhancer/registry';
import { applyStyleEnhancements } from './enhancer/processor';
import { parseColor } from './utils/style';
import { fixPresentationXmlOrderInPptx } from './utils/pptx-presentation-xml-fix';
import { validateImageUrl, validateDataImageUrl } from './utils/resource-policy';
import { getPlaceholderForMediaType } from './utils/placeholder-assets';

export interface PPTXGeneratorOptions {
  fontResolver?: (d: UsedFontDescriptor) => string;
  platformFontContext?: PlatformFontContext;
  /** When true, slide N starts at N × viewport height (long HTML split). */
  splitByHeight?: boolean;
  /** CSS selector grouping multiple slides in one HTML file. */
  slideSelector?: string;
  /** Coordinates already normalized per slide (multi-slide isolation path). */
  slideCoordsNormalized?: boolean;
}

export class PPTXGenerator {
  private pptx: InstanceType<typeof PptxGenJS>;
  private converter: ElementConverter;
  private splitByHeight: boolean;
  private slideSelector?: string;
  private slideCoordsNormalized: boolean;
  private registry: StyleEnhancementRegistry;

  constructor(options: PPTXGeneratorOptions = {}) {
    this.pptx = new PptxGenJS();
    this.registry = new StyleEnhancementRegistry();
    this.converter = new ElementConverter(
      this.registry,
      options.fontResolver,
      options.platformFontContext
    );

    // Set presentation layout (16:9 aspect ratio)
    this.pptx.layout = 'LAYOUT_16x9';
    this.pptx.defineLayout({
      name: 'HTML_LAYOUT',
      width: SLIDE_WIDTH_INCH,
      height: SLIDE_HEIGHT_INCH,
    });
    this.pptx.layout = 'HTML_LAYOUT';
    this.splitByHeight = options.splitByHeight ?? false;
    this.slideSelector = options.slideSelector;
    this.slideCoordsNormalized = options.slideCoordsNormalized ?? false;
  }

  /**
   * Generate PPTX from grouped slide elements
   */
  async generate(
    slidesMap: Map<number, ElementInfo[]>,
  ): Promise<Buffer> {
    const slideIndices = Array.from(slidesMap.keys()).sort((a, b) => a - b);

    // Phase 1: Create slides through pptxgenjs
    for (const slideIndex of slideIndices) {
      const elements = slidesMap.get(slideIndex);
      if (!elements || elements.length === 0) continue;
      await this.createSlide(elements, slideIndex);
    }

    // Phase 2: Apply style enhancements if needed
    if (this.registry.count() > 0) {
      console.log(`\n🎨 Applying ${this.registry.count()} style enhancements...`);
      return this.generateWithEnhancements();
    } else {
      // No enhancements, write file normally
      const buf = (await this.pptx.write({ outputType: 'nodebuffer' })) as Buffer;
      return fixPresentationXmlOrderInPptx(buf);
    }
  }

  /**
   * Generate PPTX with XML post-processing for style enhancements
   */
  private async generateWithEnhancements(): Promise<Buffer> {
    // Get pptxgenjs generated ZIP content as NodeJS.ReadableStream
    const zipData = await this.pptx.stream() as any;

    // Convert to ArrayBuffer
    const zipBuffer = await this.streamToArrayBuffer(zipData);

    // Apply style enhancements (modify XML)
    const modifiedZipBuffer = await applyStyleEnhancements(
      zipBuffer,
      this.registry,
      this.pptx
    );

    // Write to file
    console.log('✅ Style enhancements applied successfully');
    return fixPresentationXmlOrderInPptx(Buffer.from(modifiedZipBuffer));
  }

  /**
   * Convert stream to ArrayBuffer
   */
  private async streamToArrayBuffer(stream: any): Promise<ArrayBuffer> {
    // If it's already a Buffer or ArrayBuffer, convert directly
    if (Buffer.isBuffer(stream)) {
      const buf = stream.buffer.slice(stream.byteOffset, stream.byteOffset + stream.byteLength);
      return buf as ArrayBuffer;
    }
    if (stream instanceof ArrayBuffer) {
      return stream;
    }
    if (stream instanceof Uint8Array) {
      return stream.buffer as ArrayBuffer;
    }

    // If it's a stream, collect chunks
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const buf = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    return buf as ArrayBuffer;
  }

  /**
   * Embed fonts using pptx-embed-fonts library
   */

  /**
   * Create a single slide from elements
   */
  private async createSlide(
    elements: ElementInfo[],
    slideIndex: number
  ): Promise<void> {
    const slide = this.pptx.addSlide();

    // Origin Y for this slide's elements. For a single long HTML split by height or
    // slide selector, use the topmost element; for merged multi-file inputs each file
    // starts at y≈0 so slideIndex*height would wrongly offset later slides off-canvas.
    const slideStartY = this.resolveSlideStartY(elements, slideIndex);

    // Keep inspector traversal order (DOM paint order approximation).
    // Global z-index sorting breaks stacking-context semantics, e.g. a parent
    // background with z-index can be moved above its own children.
    const sortedElements = [...elements];

    // Add each element to the slide
    let elementCount = 0;
    let elementIndex = 0; // Global index (all slide objects: sp, pic, table, etc.)
    let shapeIndex = 0; // Index among p:sp only - gradient/softEdge/singleCornerRect target p:sp
    let picIndex = 0; // Index among p:pic only - image sizing/roundRect target p:pic

    for (const element of sortedElements) {
      try {
        const convertedElements = this.converter.convertElement(
          element,
          slideStartY,
          slideIndex,
          elementIndex
        );
        if (!convertedElements || convertedElements.length === 0) continue;

        elementCount++;
        // Add all converted elements (main element + border decorations)
        for (const converted of convertedElements) {
          // Handle slide background with image + gradient overlay
          if (converted.type === 'slideBackgroundWithGradient') {
            const imagePath = converted.options.path;
            const sourceElement = converted._sourceElement as ElementInfo;
            const fallbackColor = parseColor(sourceElement?.styles?.backgroundColor)?.color ?? '1A1818';

            const useImage = imagePath && (await validateImageUrl(imagePath));
            if (imagePath && !useImage) {
              console.warn(`⚠️  Background image unavailable or invalid (404/non-image), using fallback color: ${imagePath}`);
            }
            if (useImage && imagePath.startsWith('data:')) {
              slide.background = { data: imagePath };
            } else {
              slide.background = useImage
                ? { path: imagePath }
                : { color: fallbackColor };
            }
            const gradientData = converted._gradientData;
            const overlayShape = {
              type: 'rect',
              options: {
                x: converted.options.x,
                y: converted.options.y,
                w: converted.options.w,
                h: converted.options.h,
                fill: { color: '000000' }, // Placeholder, will be replaced by gradient enhancement
                line: { type: 'none' },
              },
            };
            if (gradientData) {
              this.registry.register({
                slideIndex,
                elementIndex: shapeIndex,
                type: 'gradient',
                sourceElement: converted._sourceElement,
                gradientData,
              });
            }
            await this.addElementToSlide(slide, overlayShape, shapeIndex);
            elementIndex++;
            shapeIndex++;
            continue;
          }

          // Check if this element has gradient metadata attached
          const isShapeElement =
            converted.type === 'text' ||
            converted.type === 'rect' ||
            converted.type === 'roundRect' ||
            converted.type === 'ellipse' ||
            converted.type === 'round1Rect' ||
            converted.type === 'round2SameRect' ||
            converted.type === 'line';
          const isImageElement = converted.type === 'image';
          const currentShapeIndex = isShapeElement ? shapeIndex : undefined;
          const currentPicIndex = isImageElement ? picIndex : undefined;

          if (converted._gradientData) {
            this.registry.register({
              slideIndex,
              elementIndex: currentShapeIndex ?? elementIndex,
              type: 'gradient',
              sourceElement: converted._sourceElement,
              gradientData: converted._gradientData,
            });
            // Clean up metadata
            delete converted._gradientData;
            delete converted._sourceElement;
          }

          if (converted._textGradientData) {
            this.registry.register({
              slideIndex,
              elementIndex: currentShapeIndex ?? elementIndex,
              type: 'textGradient',
              sourceElement: converted._sourceElement,
              gradientData: converted._textGradientData,
            });
            delete converted._textGradientData;
            delete converted._sourceElement;
          }

          if (converted._scriptFontsMeta) {
            this.registry.register({
              slideIndex,
              elementIndex: currentShapeIndex ?? elementIndex,
              type: 'scriptFonts',
              scriptFontsMeta: converted._scriptFontsMeta,
              scriptFontFaces: converted._scriptFontsMeta.scriptFontFaces,
            });
            delete converted._scriptFontsMeta;
          }

          if (converted._bodyPrVert) {
            this.registry.register({
              slideIndex,
              elementIndex: currentShapeIndex ?? elementIndex,
              type: 'writingMode',
              bodyPrVert: converted._bodyPrVert,
            });
            delete converted._bodyPrVert;
          }

          if (converted._equationOmml) {
            this.registry.register({
              slideIndex,
              elementIndex: currentShapeIndex ?? elementIndex,
              type: 'equation',
              ommlXml: converted._equationOmml,
              mathDisplayMode: converted._mathDisplayMode ?? 'inline',
              mathJc: converted._mathJc,
              mathColorHex: converted._mathColorHex,
              mathSzHalfPt: converted._mathSzHalfPt,
              mathFallbackText: converted._mathFallbackText,
              sourceElement: converted._sourceElement,
            });
            delete converted._equationOmml;
            delete converted._mathDisplayMode;
            delete converted._mathJc;
            delete converted._mathColorHex;
            delete converted._mathSzHalfPt;
            delete converted._mathFallbackText;
            delete converted._sourceElement;
          }

          // Register glow effect (box-shadow wrapping 3-4 sides)
          if (converted._glowData) {
            this.registry.register({
              slideIndex,
              elementIndex: currentShapeIndex ?? elementIndex,
              type: 'glow',
              glowData: converted._glowData,
            });
            delete converted._glowData;
          }

          // Check if this element has single-corner rounded rect
          if (converted._singleCornerRadii && converted.type === 'rect') {
            this.registry.register({
              slideIndex,
              elementIndex: currentShapeIndex ?? elementIndex,
              type: 'singleCornerRect',
              cornerRadii: converted._singleCornerRadii,
              shapeWidthInch: converted._shapeWidthInch,
              shapeHeightInch: converted._shapeHeightInch,
            });
            delete converted._singleCornerRadii;
            delete converted._shapeWidthInch;
            delete converted._shapeHeightInch;
          }

          if (
            (converted._clipPathCommandsNormalized || converted._clipPathPolygonNormalized) &&
            converted.type === 'rect'
          ) {
            this.registry.register({
              slideIndex,
              elementIndex: currentShapeIndex ?? elementIndex,
              type: 'clipPathPolygon',
              clipPathCommandsNormalized: converted._clipPathCommandsNormalized,
              clipPathPolygonNormalized: converted._clipPathPolygonNormalized,
              clipPathPolygonClosed: converted._clipPathPolygonClosed !== false,
            });
            delete converted._clipPathCommandsNormalized;
            delete converted._clipPathPolygonNormalized;
            delete converted._clipPathPolygonClosed;
          }

          // Check if this is a single-side border decoration (custGeom for rounded corners)
          if ((converted as any)._singleSideBorder && converted.type === 'rect') {
            const data = (converted as any)._singleSideBorder;
            this.registry.register({
              slideIndex,
              elementIndex: currentShapeIndex ?? elementIndex,
              type: 'singleSideBorder',
              side: data.side,
              borderWidthInch: data.borderWidthInch,
              elementWidthInch: data.elementWidthInch,
              elementHeightInch: data.elementHeightInch,
              cornerRadiiInch: data.cornerRadiiInch,
            });
            delete (converted as any)._singleSideBorder;
          }

          // Register tableCellMargin for tables (pptxgenjs ignores margin:0)
          if (converted.type === 'table') {
            this.registry.register({
              slideIndex,
              elementIndex,
              type: 'tableCellMargin',
              tableCellMarginPt: 0,
            });
          }

          // Register imageSizing for images with object-fit (pptxgenjs may not fully support sizing)
          if (converted.type === 'image' && converted.options.sizing) {
            const objectFit = converted.options.sizing.type;
            if (objectFit === 'cover' || objectFit === 'contain') {
              // Get original element info for image dimensions
              const sourceElement = element as any;
              this.registry.register({
                slideIndex,
                elementIndex,
                type: 'imageSizing',
                objectFit: objectFit,
                picIndex: currentPicIndex,
                imageNaturalWidth: sourceElement.imageNaturalWidth,
                imageNaturalHeight: sourceElement.imageNaturalHeight,
                containerWidth: converted.options.w,
                containerHeight: converted.options.h,
              });
            }
          }

          // Register imageRoundRect for images with border-radius (own or from parent with overflow-hidden)
          if (converted.type === 'image') {
            const ownRadius = (element as any).styles?.borderRadius;
            let radiusPx = ownRadius ? parseFloat(ownRadius) : 0;
            if (radiusPx <= 0) {
              radiusPx = (element as any).parentBorderRadiusPx ?? 0;
            }
            if (radiusPx > 0) {
              this.registry.register({
                slideIndex,
                elementIndex,
                type: 'imageRoundRect',
                picIndex: currentPicIndex,
                imageBorderRadiusPx: radiusPx,
                imageWidthInch: converted.options.w,
                imageHeightInch: converted.options.h,
              });
            }
          }

          await this.addElementToSlide(slide, converted, currentShapeIndex);
          elementIndex++;
          if (isShapeElement) shapeIndex++;
          if (isImageElement) picIndex++;
        }
      } catch (error) {
        console.warn(`Failed to convert element:`, error);
      }
    }
    console.log(`Slide ${slideIndex + 1}: Added ${elementCount} source elements (${elementIndex} total elements)`);
  }

  /**
   * Add converted element to slide
   * @param shapeIndex - Index among p:sp only (for enhancements that target shapes); required for softEdge
   */
  private async addElementToSlide(slide: any, converted: any, shapeIndex?: number): Promise<void> {
    if (converted._prefersGradient) {
      delete converted._prefersGradient;
    }
    if (converted._softEdge) {
      this.registry.register({
        slideIndex: this.getSlideCount() - 1,
        elementIndex: shapeIndex ?? (slide as any)._slideObjects.length,
        type: 'softEdge',
        softEdgeRadiusPt: converted._softEdge.radiusPt,
        softEdgeShadow: converted._softEdge.shadow,
      });
      delete converted._softEdge;
    }

    switch (converted.type) {
      case 'text': {
        const textOpts = { ...converted.options };
        if (textOpts.shape === 'roundRect') {
          textOpts.shape = this.pptx.ShapeType.roundRect;
        }
        slide.addText(converted.text, textOpts);
        break;
      }

      case 'image': {
        const imageOpts = { ...converted.options };
        if (imageOpts.path) {
          const valid = await validateImageUrl(imageOpts.path);
          if (!valid) {
            console.warn(
              `⚠️  Image unavailable or invalid, using placeholder: ${imageOpts.path}`
            );
            imageOpts.data = getPlaceholderForMediaType('image');
            delete imageOpts.path;
          }
        } else if (imageOpts.data) {
          if (!validateDataImageUrl(imageOpts.data)) {
            console.warn('⚠️  Invalid inline image data, using placeholder');
            imageOpts.data = getPlaceholderForMediaType('image');
          }
        } else {
          imageOpts.data = getPlaceholderForMediaType('image');
        }
        slide.addImage(imageOpts);
        break;
      }

      case 'table': {
        const { rows, x, y, w, h, colW, rowH, margin } = converted.options;
        const tableOpts: any = { x, y, w, h };
        if (colW?.length) tableOpts.colW = colW;
        if (rowH?.length) tableOpts.rowH = rowH;
        if (margin !== undefined) tableOpts.margin = margin;
        else tableOpts.margin = 0;
        slide.addTable(rows, tableOpts);
        break;
      }

      case 'table': {
        const { rows, x, y, w, h, colW, rowH, margin } = converted.options;
        const tableOpts: any = { x, y, w, h };
        if (colW?.length) tableOpts.colW = colW;
        if (rowH?.length) tableOpts.rowH = rowH;
        if (margin !== undefined) tableOpts.margin = margin;
        else tableOpts.margin = 0;
        slide.addTable(rows, tableOpts);
        break;
      }

      case 'rect':
        slide.addShape(this.pptx.ShapeType.rect, converted.options);
        break;

      case 'roundRect':
        slide.addShape(this.pptx.ShapeType.roundRect, converted.options);
        break;

      case 'ellipse':
        slide.addShape(this.pptx.ShapeType.ellipse, converted.options);
        break;

      case 'round1Rect':
        slide.addShape(this.pptx.ShapeType.round1Rect, converted.options);
        break;

      case 'round2SameRect':
        slide.addShape(this.pptx.ShapeType.round2SameRect, converted.options);
        break;

      case 'line':
        slide.addShape(this.pptx.ShapeType.line, converted.options);
        break;

      default:
        console.warn(`Unknown element type: ${converted.type}`);
    }
  }

  /**
   * Top Y origin for converting element coordinates on this slide.
   */
  private resolveSlideStartY(elements: ElementInfo[], slideIndex: number): number {
    if (this.slideCoordsNormalized) {
      return 0;
    }
    if (this.splitByHeight) {
      return slideIndex * getSlideHeightPx();
    }
    if (this.slideSelector) {
      if (elements.length === 0) {
        return slideIndex * getSlideHeightPx();
      }
      let minY = Infinity;
      for (const el of elements) {
        if (el.y < minY) minY = el.y;
      }
      // Clamp so off-canvas decorations (negative y) on slide 0 do not shift layout down.
      return Number.isFinite(minY) ? Math.max(0, minY) : 0;
    }
    // Single viewport per slide (default multi-file merge): always origin at top.
    return 0;
  }

  /**
   * Get slide count
   */
  getSlideCount(): number {
    return (this.pptx as any).slides?.length || 0;
  }
}
