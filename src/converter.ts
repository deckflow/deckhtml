/**
 * Element Converter Module
 * Converts DOM elements to pptxgenjs objects
 */

import PptxGenJSBase from 'pptxgenjs';
import { ElementInfo, TextRun, UsedFontDescriptor } from './types';
import {
  pxToInch,
  pxToInchX,
  pxToInchY,
  pxToPoints,
  getSlideWidthPx,
  getSlideHeightPx,
} from './utils/coordinate';
import {
  getTextOptions,
  getOoxmlBodyPrVert,
  expandRunTextForInlineHighlightPadding,
  marginLeftPxToLeadingSpaces,
  getFillOptions,
  getLineOptions,
  getTableCellBorderOptions,
  sanitizeTextForXml,
  parseBoxShadow,
  parseBoxShadowClassified,
  parseBorderRadius,
  parseCornerRadii,
  parseBlurFilter,
  parseColor as parseColorUtil,
  parseGradientFull,
  parseLetterSpacing,
  parseBackgroundImageUrl,
  parseBorderStyleToDashType,
  parseTransparency,
  parseTransformRotate,
  ScriptFontFaces,
  parseScriptFontFaces,
  normalizeFontAwesomeFreeFamily,
  isBold,
  isItalic,
  isInlinePillBox,
} from './utils/style';
import { PlatformFontContext, PlatformFontLang } from './utils/platformFontMap';
import {
  ContainerScriptHints,
  detectContainerScriptHints,
  splitTextByScript,
} from './utils/textScript';
import { StyleEnhancementRegistry } from './enhancer/registry';
import { getMathPresentationMeta } from './utils/omml-style';
import {
  getPlaceholderForMediaType,
  type PlaceholderMediaType,
} from './utils/placeholder-assets';

export class ElementConverter {
  private registry: StyleEnhancementRegistry;
  private fontResolver?: (d: UsedFontDescriptor) => string;
  private platformFontContext?: PlatformFontContext;

  constructor(
    registry: StyleEnhancementRegistry,
    fontResolver?: (d: UsedFontDescriptor) => string,
    platformFontContext?: PlatformFontContext
  ) {
    this.registry = registry;
    this.fontResolver = fontResolver;
    this.platformFontContext = platformFontContext;
  }

  /** Resolve script faces with Bold/Italic suffix only when registry has exact match */
  private resolveScriptFontFaces(
    styles: {
      fontFamily?: string;
      fontFamilySpecified?: string;
      fontWeight?: string;
      fontStyle?: string;
    },
    textScript: PlatformFontLang = 'latin'
  ): ScriptFontFaces | undefined {
    if (!styles?.fontFamily) return undefined;
    const faFreeFace = normalizeFontAwesomeFreeFamily(
      styles.fontFamily,
      styles.fontWeight?.toString()
    );
    if (faFreeFace) {
      const latin = this.fontResolver
        ? this.fontResolver({
            fontFamily: faFreeFace,
            bold: false,
            italic: isItalic(styles.fontStyle),
          })
        : faFreeFace;
      return { latin, ea: latin, cs: 'Arial' };
    }

    const faces = parseScriptFontFaces(styles.fontFamily, {
      platformFontContext: this.platformFontContext,
      specifiedFontFamily: styles.fontFamilySpecified,
      textScript,
    });
    if (!this.fontResolver) return faces;

    const bold = isBold(styles.fontWeight);
    const italic = isItalic(styles.fontStyle);
    const latinResolved = this.fontResolver({
      fontFamily: faces.latin,
      bold,
      italic,
    });
    const eaResolved =
      faces.ea === faces.latin
        ? latinResolved
        : this.fontResolver({
            fontFamily: faces.ea,
            bold,
            italic,
          });
    return { latin: latinResolved, ea: eaResolved, cs: faces.cs };
  }

  private getContainerText(element: ElementInfo): string {
    if (element.richText?.length) {
      return element.richText.map((run) => run.text).join('');
    }
    return element.content ?? '';
  }

  private splitTextRunByScript(run: TextRun, hints: ContainerScriptHints): TextRun[] {
    const segments = splitTextByScript(run.text, hints);
    if (segments.length <= 1) {
      return [{ ...run, textScript: segments[0]?.script ?? 'latin' }];
    }
    return segments.map((seg, index) => ({
      ...run,
      text: seg.text,
      textScript: seg.script,
      softBreakBefore: run.softBreakBefore && index === 0,
      breakLine: run.breakLine && index === segments.length - 1,
    }));
  }

  private buildScriptSplitTextPieces(
    text: string,
    styles: ElementInfo['styles'],
    baseOptions: Record<string, unknown>,
    hints: ContainerScriptHints
  ): Array<{ text: string; options: Record<string, unknown> }> | string {
    const segments = splitTextByScript(text, hints);
    if (segments.length <= 1) return text;

    return segments.map((seg) => {
      const pieceOptions = getTextOptions(styles, this.platformFontContext, seg.text);
      const faces = this.resolveScriptFontFaces(styles, seg.script);
      if (faces !== undefined) {
        pieceOptions.fontFace = faces.latin;
      } else if (baseOptions.fontFace) {
        pieceOptions.fontFace = baseOptions.fontFace;
      }
      return { text: seg.text, options: pieceOptions };
    });
  }

  /**
   * Convert element to pptxgenjs object properties
   * Returns an array of converted elements (main element + any border decorations)
   */
  convertElement(
    element: ElementInfo,
    slideStartY: number = 0,
    slideIndex: number = 0,
    elementIndex: number = 0
  ): any[] {
    const baseProps = this.getBaseProperties(element, slideStartY);
    const results: any[] = [];

    // Detect gradient for registration
    const gradientData = parseGradientFull(element.styles.backgroundImage);

    let mainElement: any = null;

    switch (element.type) {
      case 'text':
        mainElement = this.convertTextElement(element, baseProps);
        break;
      case 'icon':
        mainElement = this.convertIconElement(element, baseProps);
        break;
      case 'image':
        mainElement = this.convertImageElement(element, baseProps);
        break;
      case 'video':
        mainElement = this.convertMediaPlaceholderElement(element, baseProps, 'video');
        break;
      case 'audio':
        mainElement = this.convertMediaPlaceholderElement(element, baseProps, 'audio');
        break;
      case 'canvas':
        mainElement = this.convertCanvasElement(element, baseProps);
        break;
      case 'svg':
        mainElement = this.convertImageElement(element, baseProps);
        break;
      case 'math':
        mainElement = this.convertMathElement(element, baseProps);
        break;
      case 'table':
        mainElement = this.convertTableElement(element, baseProps);
        break;
      case 'shape':
        // Check for full-slide background with image + gradient overlay (e.g. slide-container)
        const imageUrl = parseBackgroundImageUrl(element.styles.backgroundImage);
        const isFullSlide =
          slideStartY === 0 &&
          element.width >= getSlideWidthPx() * 0.9 &&
          element.height >= getSlideHeightPx() * 0.9;
        if (imageUrl && gradientData && isFullSlide) {
          mainElement = {
            type: 'slideBackgroundWithGradient',
            options: { ...baseProps, path: imageUrl },
            _gradientData: gradientData,
            _sourceElement: element,
          };
        } else {
          mainElement = this.convertShapeElement(
            element,
            baseProps,
            slideIndex,
            elementIndex,
            slideStartY
          );
        }
        break;
      default:
        return [];
    }

    if (mainElement) {
      // Handle both single element and array of elements (e.g., rounded background + text)
      if (Array.isArray(mainElement)) {
        results.push(...mainElement);
      } else {
        results.push(mainElement);
      }
    }

    // Add border decorations (single-side borders only)
    // Skip for images - pic element handles its own shape (roundRect etc.), no extra border shapes
    const borderType = this.getBorderType(element.styles);
    if (borderType === 'single' && element.type !== 'image') {
      const borderDecorations = this.createBorderDecorations(element, baseProps);
      results.push(...borderDecorations);
    }

    // Attach gradient metadata to the element that has the fill
    // The generator will register it with the correct index when adding to slide
    if (gradientData && results.length > 0) {
      // CSS allows layered backgrounds: background-color (base) + multiple gradients/images on top.
      // Our XML enhancer can only replace ONE <a:solidFill> with ONE <a:gradFill>.
      // When authors use "solid base + overlay gradients" (like bg-primary-pattern),
      // applying gradient enhancement would erase the base color entirely.
      const bgColor = parseColorUtil(element.styles.backgroundColor);
      const bgImg = String(element.styles.backgroundImage || '');
      const hasVisibleBgColor = !!bgColor;
      const hasLayeredBackgrounds = bgImg.includes(','); // multiple backgrounds separated by commas
      if (hasVisibleBgColor && hasLayeredBackgrounds) {
        return results;
      }

      let fillElementIndex = results.findIndex((el: any) => el?._prefersGradient);
      if (fillElementIndex < 0) {
        fillElementIndex = results.findIndex(
          (el: any) => el?.options && el.options.fill
        );
      }
      if (fillElementIndex < 0) {
        fillElementIndex = results.findIndex(
          (el: any) =>
            el.type === 'rect' ||
            el.type === 'roundRect' ||
            el.type === 'ellipse' ||
            el.type === 'shape'
        );
      }
      if (fillElementIndex >= 0) {
        results[fillElementIndex]._gradientData = gradientData;
        results[fillElementIndex]._sourceElement = element;
      }
    }

    return results;
  }

  /**
   * Get base properties (position, size, and rotation from CSS transform)
   */
  private getBaseProperties(element: ElementInfo, slideStartY: number): any {
    const base: any = {
      x: pxToInchX(element.x),
      y: pxToInchY(element.y - slideStartY),
      w: pxToInchX(element.width),
      h: pxToInchY(element.height),
    };
    const rotate = parseTransformRotate(element.styles?.transform);
    if (rotate !== undefined) {
      base.rotate = rotate;
    }
    return base;
  }

  /**
   * Placeholder text box for OMML equation injection (Phase 2 XML).
   */
  private convertMathElement(element: ElementInfo, baseProps: any): any | null {
    if (!element.ommlXml) {
      return null;
    }
    const presentation = getMathPresentationMeta(element);
    const w =
      element.width < 20 ? pxToInch(Math.max(element.width, element.height * 2, 48)) : baseProps.w;
    const h =
      element.height < 12 ? pxToInch(Math.max(element.height, 20)) : baseProps.h;
    return {
      type: 'text',
      text: '\u200B',
      options: {
        ...baseProps,
        w,
        h,
        margin: 0,
        fill: { type: 'none' },
        line: { type: 'none' },
      },
      _equationOmml: element.ommlXml,
      _mathDisplayMode: element.mathDisplayMode ?? 'inline',
      _mathJc: presentation.mathJc,
      _mathColorHex: presentation.colorHex,
      _mathSzHalfPt: presentation.szHalfPt,
      _mathFallbackText: element.mathFallbackText,
      _sourceElement: element,
    };
  }

  /**
   * Get line options for the "common" sides when one side is special
   * Returns style from the majority (top/right/bottom when left is special)
   * Returns undefined when only one side has border (no common)
   */
  private getCommonLineOptions(_styles: any): { color: string; width: number; dashType?: string; transparency?: number } | undefined {
    // pptxgenjs applies line to all four sides of a shape; partial borders use strip decorations only.
    return undefined;
  }

  /**
   * Determine border type: uniform (4 sides equal), single (some sides), none
   */
  private getBorderType(styles: any): 'uniform' | 'single' | 'none' {
    const parseBorderWidth = (width: string | undefined): number => {
      if (!width) return 0;
      return parseFloat(width) || 0;
    };

    const leftWidth = parseBorderWidth(styles.borderLeftWidth);
    const rightWidth = parseBorderWidth(styles.borderRightWidth);
    const topWidth = parseBorderWidth(styles.borderTopWidth);
    const bottomWidth = parseBorderWidth(styles.borderBottomWidth);

    const sidesWithBorder = [leftWidth, rightWidth, topWidth, bottomWidth]
      .filter(w => w >= 1).length;

    if (sidesWithBorder === 0) return 'none';

    // All 4 sides equal width and color?
    if (sidesWithBorder === 4 &&
        leftWidth === rightWidth &&
        rightWidth === topWidth &&
        topWidth === bottomWidth &&
        styles.borderLeftColor === styles.borderRightColor &&
        styles.borderRightColor === styles.borderTopColor &&
        styles.borderTopColor === styles.borderBottomColor) {
      return 'uniform';
    }

    return 'single';
  }

  /**
   * Convert icon element (Font Awesome icons)
   */
  private convertIconElement(element: ElementInfo, baseProps: any): any {
    const textOptions = getTextOptions(element.styles, this.platformFontContext);
    const textContent = sanitizeTextForXml(element.content || '');

    const options: any = {
      ...baseProps,
      ...textOptions,
      // Disable wrap for icons
      wrap: false,
    };

    return {
      type: 'text',
      options,
      text: textContent,
    };
  }

  /**
   * Convert text element
   */
  private convertTextElement(element: ElementInfo, baseProps: any): any {
    const textOptions = getTextOptions(element.styles, this.platformFontContext);
    const lineOptions = getLineOptions(element.styles);

    // Only add fill if there's an actual background color
    const fillOptions = getFillOptions(element.styles);
    const backgroundClip = element.styles.backgroundClip ?? element.styles.webkitBackgroundClip;
    const textGradientData =
      backgroundClip === 'text'
        ? parseGradientFull(element.styles.backgroundImage)
        : undefined;
    const options: any = {
      ...baseProps,
      ...textOptions,
    };

    let scriptFontFaces = this.resolveScriptFontFaces(element.styles);
    if (scriptFontFaces !== undefined) options.fontFace = scriptFontFaces.latin;

    // li: padding/border already in margin; add in-flow ::before width + horizontal margins so text clears the bullet
    if (
      element.tag === 'li' &&
      element.beforePseudoWidthPx != null &&
      element.beforePseudoWidthPx > 0 &&
      Array.isArray(options.margin)
    ) {
      const extraPt = pxToPoints(element.beforePseudoWidthPx);
      options.margin = [
        options.margin[0] + extraPt,
        options.margin[1],
        options.margin[2],
        options.margin[3],
      ];
    }

    if (
      element.textFlowExtraMarginLeftPx != null &&
      element.textFlowExtraMarginLeftPx > 0 &&
      Array.isArray(options.margin)
    ) {
      const extraPt = pxToPoints(element.textFlowExtraMarginLeftPx);
      options.margin = [
        options.margin[0] + extraPt,
        options.margin[1],
        options.margin[2],
        options.margin[3],
      ];
    }

    if (textGradientData && !options.color && textGradientData.stops?.length) {
      options.color = textGradientData.stops[0].color;
    }

    // Native list markers (disc/circle/decimal/…) are not ::before — extractPseudoElements does not
    // capture them. Emit pptx bullets for those. When an in-flow ::before already reserves width
    // (inspector `beforePseudoWidthPx`), a custom bullet is handled separately — skip to avoid doubles.
    if (element.tag === 'li') {
      const hasInFlowBeforeBulletGap =
        element.beforePseudoWidthPx != null && element.beforePseudoWidthPx > 0;
      if (!hasInFlowBeforeBulletGap) {
        const listStyleType = (element.styles.listStyleType || '').toLowerCase().trim();
        const bulletIndentPt = 8;
        if (listStyleType && listStyleType !== 'none') {
          const numberedTypes = [
            'decimal',
            'decimal-leading-zero',
            'lower-alpha',
            'upper-alpha',
            'lower-roman',
            'upper-roman',
          ];
          if (numberedTypes.includes(listStyleType)) {
            options.bullet = { type: 'number', indent: bulletIndentPt };
          } else {
            options.bullet = { indent: bulletIndentPt };
          }
        }
      }
    }

    // Add fill only if it exists
    if (fillOptions.fill) {
      options.fill = fillOptions.fill;
    }

    // Add transparency if exists
    if (fillOptions.transparency !== undefined) {
      options.transparency = fillOptions.transparency;
    }

    // Add line if it exists (only for uniform borders)
    const borderType = this.getBorderType(element.styles);
    if (borderType === 'uniform' && lineOptions) {
      options.line = lineOptions;
    }

    // Handle box-shadow: classify as glow (3-4 sides) or directional shadow (1-2 sides)
    const textBoxShadowInfo = parseBoxShadowClassified(element.styles.boxShadow);
    if (textBoxShadowInfo?.effect === 'shadow') {
      options.shadow = parseBoxShadow(element.styles.boxShadow);
    }
    const textGlowData = textBoxShadowInfo?.effect === 'glow' ? {
      radiusPt: Math.max(1, Math.min(100, pxToPoints(textBoxShadowInfo.blur))),
      color: textBoxShadowInfo.color,
      alpha: textBoxShadowInfo.alpha,
    } : undefined;

    // Check if element has border-radius with background/border
    // If yes, we need to render as a roundRect shape instead of text box
    // because PowerPoint text boxes don't support rounded corners
    const hasFill = fillOptions.fill !== undefined;
    const hasLine = lineOptions !== undefined;
    const borderRadius = parseBorderRadius(
      element.styles.borderRadius,
      element.width,
      element.height
    );
    const shouldUseRoundedShape = (hasFill || hasLine) && borderRadius;

    const applyHorizontalAlign = (value?: string) => {
      if (value === 'center') {
        options.align = 'center';
      } else if (value === 'flex-end' || value === 'end' || value === 'right') {
        options.align = 'right';
      } else if (value === 'flex-start' || value === 'start' || value === 'left') {
        options.align = 'left';
      }
    };
    const applyVerticalAlign = (value?: string) => {
      if (value === 'center') {
        options.valign = 'middle';
      } else if (value === 'flex-end' || value === 'end' || value === 'bottom') {
        options.valign = 'bottom';
      } else if (value === 'flex-start' || value === 'start' || value === 'top') {
        options.valign = 'top';
      }
    };

    // Add flexbox alignment support
    // Map CSS flexbox properties to PowerPoint text alignment
    const display = element.styles.display;
    const flexDirection = element.styles.flexDirection || 'row';

    if (display === 'flex' || display === 'inline-flex') {
      const justifyContent = element.styles.justifyContent;
      const alignItems = element.styles.alignItems;

      // For flex-direction: row (default), justify-content controls horizontal (align), align-items controls vertical (valign)
      // For flex-direction: column, justify-content controls vertical (valign), align-items controls horizontal (align)
      if (flexDirection === 'row' || flexDirection === 'row-reverse') {
        // Horizontal alignment from justify-content
        applyHorizontalAlign(justifyContent);

        // Vertical alignment from align-items
        applyVerticalAlign(alignItems);
      } else if (flexDirection === 'column' || flexDirection === 'column-reverse') {
        // Vertical alignment from justify-content
        applyVerticalAlign(justifyContent);

        // Horizontal alignment from align-items
        applyHorizontalAlign(alignItems);
      }
    }

    // Add grid alignment support (e.g. display:grid + place-items:center)
    if (display === 'grid' || display === 'inline-grid') {
      const placeItemsRaw = element.styles.placeItems;
      const justifyItems = element.styles.justifyItems;
      const alignItems = element.styles.alignItems;
      const placeItemsParts = placeItemsRaw?.trim().split(/\s+/).filter(Boolean) ?? [];
      const placeAlign = placeItemsParts[0];
      const placeJustify = placeItemsParts[1] ?? placeItemsParts[0];
      applyHorizontalAlign(placeJustify);
      applyVerticalAlign(placeAlign);
      applyHorizontalAlign(justifyItems);
      applyVerticalAlign(alignItems);
    }

    // When vertical alignment was not set by flex, default to top (HTML block default)
    if (options.valign === undefined) {
      options.valign = 'top';
    }

    // Flex space-* row: last in-flow item (inspector) → right-align text inside its box
    if (element.flexItemTextAlign) {
      options.align = element.flexItemTextAlign;
    }

    // Check if this is rich text (multiple styled runs)
    let textContent: any;
    const containerText = this.getContainerText(element);
    const containerHints = detectContainerScriptHints(containerText);

    if (element.richText && element.richText.length > 0) {
      // Convert rich text runs to pptxgenjs format
      textContent = element.richText.flatMap((run: any, index: number) => {
        const scriptRuns = this.splitTextRunByScript(run, containerHints);
        return scriptRuns.flatMap((scriptRun) => {
        const textScript = scriptRun.textScript ?? 'latin';
        const runOptions = getTextOptions(run.styles, this.platformFontContext, scriptRun.text);
        // Line spacing is paragraph-level (host element.options); per-run values stack badly on <a:br/>.
        delete runOptions.lineSpacing;
        delete runOptions.lineSpacingMultiple;
        const runScriptFaces = this.resolveScriptFontFaces(run.styles, textScript);
        if (runScriptFaces !== undefined) {
          runOptions.fontFace = runScriptFaces.latin;
          if (!scriptFontFaces) scriptFontFaces = runScriptFaces;
        }
        if (textGradientData && !runOptions.color && textGradientData.stops?.length) {
          runOptions.color = textGradientData.stops[0].color;
        }
        let runText = sanitizeTextForXml(scriptRun.text);
        if (element.styles.textTransform === 'uppercase') {
          runText = runText.toUpperCase();
        }
        runText = expandRunTextForInlineHighlightPadding(runText, run.styles);
        // HTML collapses consecutive whitespace to one space (do not strip single leading/trailing gaps).
        runText = runText.replace(/[\s\u00A0]{2,}/g, ' ');
        // Prepend space(s) for margin-left on inline/inline-block runs (e.g. indented <span>).
        // Block-level margin-left on the text host is already reflected in ElementInfo x/width — do not
        // inject spaces between rich-text runs (e.g. .title-line-2 { margin-left: 60px }).
        if (index > 0 && run.styles?.marginLeft) {
          const runDisplay = run.styles.display;
          const marginIsInline =
            runDisplay === 'inline' || runDisplay === 'inline-block';
          const marginLeftPx = marginIsInline
            ? parseFloat(String(run.styles.marginLeft)) || 0
            : 0;
          if (marginLeftPx > 0) {
            const fontSizePx =
              parseFloat(String(run.styles.fontSize || element.styles.fontSize || '16')) || 16;
            const spaces = marginLeftPxToLeadingSpaces(marginLeftPx, fontSizePx);
            if (spaces > 0) {
              runText = ' '.repeat(spaces) + runText;
            }
          }
        }
        // <br> is already softBreakBefore; leading \n in the same run (DOM whitespace after <br>) would
        // split to ['', '…'] and set softBreak on both pieces → duplicate <a:br/> in OOXML.
        if (scriptRun.softBreakBefore) {
          runText = runText.replace(/^\r?\n+/, '');
        }
        // pptxgen treats "\n" in run text as new a:p; split to soft breaks (a:br) within one paragraph
        let segments = runText.split(/\r?\n/);
        if (scriptRun.softBreakBefore) {
          while (segments.length > 1 && segments[0] === '') {
            segments.shift();
          }
        }
        const lastSi = segments.length - 1;
        return segments.map((seg, si) => {
          const pieceOpts: any = { ...runOptions };
          // <a:br/> lines without an explicit run sz use PPT default (~18pt) for line-height → oversized gaps.
          if (scriptRun.softBreakBefore && si === 0) {
            pieceOpts.softBreakBefore = true;
            pieceOpts.fontSize = options.fontSize;
            pieceOpts.fontFace = pieceOpts.fontFace ?? options.fontFace;
          }
          if (seg === '\u200b' || seg === '') {
            pieceOpts.fontSize = options.fontSize;
            pieceOpts.fontFace = pieceOpts.fontFace ?? options.fontFace;
          }
          if (si > 0) {
            pieceOpts.softBreakBefore = true;
          }
          if (scriptRun.breakLine && si === lastSi) {
            pieceOpts.breakLine = true;
          }
          return {
            text: seg,
            options: pieceOpts,
          };
        });
        });
      });
      // Remove color from base options when using rich text runs
      // Each run has its own color
      if (!textGradientData) {
        delete options.color;
      }
    } else {
      // Simple text (e.g. <p>…<br>…</p> from getTextContent as "\n") — use soft breaks so pptxgen emits a:br, not multiple a:p
      let simpleTextContent = sanitizeTextForXml(element.content || '');
      if (element.styles.textTransform === 'uppercase') {
        simpleTextContent = simpleTextContent.toUpperCase();
      }
      const softBreakOpts = {
        softBreakBefore: true,
        fontSize: options.fontSize,
        fontFace: options.fontFace,
        ...(options.color ? { color: options.color } : {}),
      };
      if (/\r?\n/.test(simpleTextContent)) {
        const normalized = simpleTextContent.replace(/\r?\n{2,}/g, '\n');
        const parts = normalized.split(/\r?\n/);
        textContent = parts.flatMap((part, i) => {
          const scriptPieces = this.buildScriptSplitTextPieces(
            part,
            element.styles,
            options,
            containerHints
          );
          if (typeof scriptPieces === 'string') {
            return i === 0
              ? [{ text: scriptPieces, options: {} }]
              : [{ text: scriptPieces, options: softBreakOpts }];
          }
          return scriptPieces.map((piece, pi) => ({
            text: piece.text,
            options: {
              ...piece.options,
              ...(i > 0 && pi === 0 ? softBreakOpts : {}),
            },
          }));
        });
      } else {
        const scriptPieces = this.buildScriptSplitTextPieces(
          simpleTextContent,
          element.styles,
          options,
          containerHints
        );
        textContent = scriptPieces;
      }
    }

    // Count paragraphs: in OOXML each paragraph becomes one a:p. Multiple paragraphs come from
    // display:block children (breakLine in richText), not from HTML <br> (handled as softBreakBefore / a:br).
    let paragraphCount: number;
    let visualLineCount: number;
    if (element.richText && element.richText.length > 0) {
      paragraphCount = 1 + element.richText.filter((r: any) => r.breakLine).length;
      visualLineCount = Math.max(
        paragraphCount,
        1 + element.richText.filter((r: any) => r.softBreakBefore).length
      );
    } else if (Array.isArray(textContent)) {
      const softBreakCount = textContent.filter((r: any) => r.options?.softBreakBefore).length;
      paragraphCount = 1;
      visualLineCount = 1 + softBreakCount;
    } else if (typeof textContent === 'string') {
      paragraphCount = textContent.split(/\r?\n/).length;
      visualLineCount = paragraphCount;
    } else {
      paragraphCount = 1;
      visualLineCount = 1;
    }

    // Detect if any paragraph wraps by comparing text content height with (line count * line height).
    // If total height <= visualLineCount * lineHeight * 1.5, every line is single-line → no wrap needed.
    const fontSizeStr = String(element.styles.fontSize || '16');
    const fontSize = parseFloat(fontSizeStr);
    const lineHeightStr = String(element.styles.lineHeight || 'normal');
    // When line-height is "normal", the actual rendered line-height varies by font.
    // CJK fonts (Noto Sans SC etc.) typically have normal ≈ 1.8x fontSize,
    // Latin fonts ≈ 1.15-1.25x. Use 1.5x as a conservative middle estimate.
    const lineHeightPx = lineHeightStr !== 'normal'
      ? parseFloat(lineHeightStr)
      : fontSize * 1.5;

    // foreignObject hybrid labels: derive line spacing from rendered box height (viewBox scale baked in).
    if (element.svgForeignObjectText && visualLineCount > 1 && element.height > 0) {
      const cssPx = parseFloat(fontSizeStr) || 16;
      const fontSizePx =
        cssPx > element.height * 1.08 ? element.height : cssPx;
      const perLinePx = element.height / visualLineCount;
      const multiple = perLinePx / fontSizePx;
      if (multiple >= 0.5 && multiple <= 10) {
        delete options.lineSpacing;
        options.lineSpacingMultiple = Math.round(multiple * 1000) / 1000;
      }
    }

    // Subtract vertical padding and border to get pure text content height
    const paddingTopPx = parseFloat(String(element.styles.paddingTop || '0')) || 0;
    const paddingBottomPx = parseFloat(String(element.styles.paddingBottom || '0')) || 0;
    const borderTopPx = parseFloat(String(element.styles.borderTopWidth || '0')) || 0;
    const borderBottomPx = parseFloat(String(element.styles.borderBottomWidth || '0')) || 0;
    const verticalChromePx = paddingTopPx + paddingBottomPx + borderTopPx + borderBottomPx;

    const elementHeightPx = element.height; // original px height from inspector
    const textContentHeightPx = elementHeightPx - verticalChromePx;
    const allParagraphsSingleLine = textContentHeightPx <= visualLineCount * lineHeightPx * 1.5;

    // listMarkerOffset logic removed - bullets are now handled via ::before pseudo-elements
    // if (element.tag === 'li' && element.listMarkerOffset) {
    //   const offsetInch = pxToInch(element.listMarkerOffset);
    //   options.x = (options.x ?? baseProps.x) - offsetInch;
    //   options.w = (options.w ?? baseProps.w) + offsetInch;
    // }

    // Disable wrap when every paragraph is single-line (including multiple a:p that are each one line)
    // to prevent unnecessary wrapping. Enable wrap when any paragraph has more than one line.
    if (allParagraphsSingleLine) {
      options.wrap = false;
    } else {
      options.wrap = true;
    }
    // Explicit <br> / softBreak runs already define line breaks — do not re-wrap (causes overflow).
    if (element.svgForeignObjectText && visualLineCount > 1) {
      options.wrap = false;
    }


    const bodyPrVert = getOoxmlBodyPrVert(element.styles.writingMode);

    const createTextElement = (customOptions?: any, skipGlow?: boolean): any => {
      const textElement: any = {
        type: 'text',
        options: customOptions ?? options,
        text: textContent,
      };
      if (textGradientData) {
        textElement._textGradientData = textGradientData;
        textElement._sourceElement = element;
      }
      if (textGlowData && !skipGlow) {
        textElement._glowData = textGlowData;
      }
      if (scriptFontFaces || element.styles.fontFamily || this.platformFontContext) {
        textElement._scriptFontsMeta = {
          fontFamily: element.styles.fontFamily,
          fontFamilySpecified: element.styles.fontFamilySpecified,
          platform: this.platformFontContext?.platform,
          scriptFontFaces,
        };
      }
      if (bodyPrVert) {
        textElement._bodyPrVert = bodyPrVert;
      }
      return textElement;
    };

    // clip-path polygon + background: text box cannot use custGeom — rect (gradient/solid) + text on top
    if (
      element.clipPathPolygonPx &&
      element.clipPathPolygonPx.length >= 3 &&
      fillOptions.fill
    ) {
      const wPx = element.width;
      const hPx = element.height;
      if (wPx > 0 && hPx > 0) {
        const normalized = element.clipPathPolygonPx.map((p) => ({
          x: Math.round(Math.min(21600, Math.max(0, (p.x / wPx) * 21600))),
          y: Math.round(Math.min(21600, Math.max(0, (p.y / hPx) * 21600))),
        }));
        const bt = this.getBorderType(element.styles);
        const backgroundOptions: any = {
          x: baseProps.x,
          y: baseProps.y,
          w: baseProps.w,
          h: baseProps.h,
          fill: fillOptions.fill,
        };
        if (baseProps.rotate !== undefined) {
          backgroundOptions.rotate = baseProps.rotate;
        }
        if (fillOptions.transparency !== undefined) {
          backgroundOptions.transparency = fillOptions.transparency;
        }
        if (bt === 'uniform' && lineOptions) {
          backgroundOptions.line = lineOptions;
        } else if (bt === 'single') {
          const commonLine = this.getCommonLineOptions(element.styles);
          if (commonLine) backgroundOptions.line = commonLine;
        }
        const bgShape: any = {
          type: 'rect',
          options: backgroundOptions,
          _clipPathPolygonNormalized: normalized,
        };
        if (parseGradientFull(element.styles.backgroundImage)) {
          bgShape._prefersGradient = true;
        }
        if (textGlowData) {
          bgShape._glowData = textGlowData;
        }
        const textBoxOptions: any = {
          ...options,
          x: baseProps.x,
          y: baseProps.y,
          w: baseProps.w,
          h: baseProps.h,
        };
        delete textBoxOptions.fill;
        delete textBoxOptions.transparency;
        delete textBoxOptions.line;
        delete textBoxOptions.shadow;
        delete textBoxOptions.highlight;

        return [
          bgShape,
          createTextElement(textBoxOptions, true),
        ];
      }
    }

    // Pill badges: one roundRect shape with text inside (matches HTML shrink-to-fit box)
    if (shouldUseRoundedShape && isInlinePillBox(element.styles)) {
      const pillOptions: any = {
        ...options,
        x: baseProps.x,
        y: baseProps.y,
        w: baseProps.w,
        h: baseProps.h,
        shape: 'roundRect',
        rectRadius: borderRadius,
        fit: 'none',
        wrap: false,
      };
      delete pillOptions.highlight;
      if (fillOptions.fill) pillOptions.fill = fillOptions.fill;
      if (fillOptions.transparency !== undefined) {
        pillOptions.transparency = fillOptions.transparency;
      }
      if (borderType === 'uniform' && lineOptions) {
        pillOptions.line = lineOptions;
      } else {
        pillOptions.line = { type: 'none' };
      }
      return createTextElement(pillOptions);
    }

    // If element has rounded corners with background/border, render as roundRect shape
    // PowerPoint shapes with text inside support rounded corners better than text boxes
    // We return TWO elements: background shape + text on top
    if (shouldUseRoundedShape) {
      // Background: rounded rectangle shape with fill
      const backgroundOptions: any = {
        x: baseProps.x,
        y: baseProps.y,
        w: baseProps.w,
        h: baseProps.h,
        fill: fillOptions.fill,
        rectRadius: borderRadius,
        line: { type: 'none' }, // No border by default
      };
      if (baseProps.rotate !== undefined) {
        backgroundOptions.rotate = baseProps.rotate;
      }

      // Add transparency if exists
      if (fillOptions.transparency !== undefined) {
        backgroundOptions.transparency = fillOptions.transparency;
      }

      // Add border if exists
      if (borderType === 'uniform' && lineOptions) {
        backgroundOptions.line = lineOptions;
      }

      // Foreground: text box on top with same position
      const textBoxOptions: any = {
        ...options,
        x: baseProps.x,
        y: baseProps.y,
        w: baseProps.w,
        h: baseProps.h,
      };
      delete textBoxOptions.fill;
      delete textBoxOptions.line;
      delete textBoxOptions.rectRadius;
      delete textBoxOptions.shadow;
      // Background is the roundRect shape — glyph highlight duplicates fill and breaks sizing
      delete textBoxOptions.highlight;

      // Return both elements: shape first (background), then text (foreground)
      const bgShape: any = {
        type: 'roundRect',
        options: backgroundOptions,
      };
      // Glow goes on the background shape (visual container), not text overlay
      if (textGlowData) {
        bgShape._glowData = textGlowData;
      }
      return [
        bgShape,
        createTextElement(textBoxOptions, true /* skipGlow: background handles it */),
      ];
    }

    return createTextElement();
  }

  private buildPlaceholderImage(baseProps: any, mediaType: PlaceholderMediaType): any {
    return {
      type: 'image',
      options: {
        ...baseProps,
        data: getPlaceholderForMediaType(mediaType),
      },
    };
  }

  /**
   * Convert image element
   */
  private convertImageElement(element: ElementInfo, baseProps: any): any {
    const imageSrc = element.src || element.dataUrl;
    if (!imageSrc || element.resourceUnavailable) {
      return this.buildPlaceholderImage(baseProps, 'image');
    }

    const options: any = { ...baseProps };
    if (imageSrc.startsWith('data:')) {
      options.data = imageSrc;
    } else {
      options.path = imageSrc;
    }

    // SVG from emitSvgAsImage bakes opacity into the data URL — do not apply twice.
    if (element.tag !== 'svg') {
      const transparency = parseTransparency(element.styles?.opacity);
      if (transparency > 0) {
        options.transparency = transparency;
      }
    }

    // Handle object-fit CSS property (cover/contain)
    const objectFit = element.styles.objectFit?.toLowerCase();
    if (objectFit === 'cover' || objectFit === 'contain') {
      options.sizing = {
        type: objectFit,
        w: baseProps.w,
        h: baseProps.h,
      };
    }

    return {
      type: 'image',
      options,
    };
  }

  /**
   * Convert video/audio to a slide image (placeholder when media unavailable).
   */
  private convertMediaPlaceholderElement(
    element: ElementInfo,
    baseProps: any,
    mediaType: 'video' | 'audio'
  ): any {
    if (!element.resourceUnavailable) {
      if (
        mediaType === 'video' &&
        element.poster &&
        !element.poster.startsWith('file:')
      ) {
        return {
          type: 'image',
          options: { ...baseProps, path: element.poster },
        };
      }
    }
    return this.buildPlaceholderImage(baseProps, mediaType);
  }

  /**
   * Convert canvas/SVG element (dataUrl is PNG from canvas or from SVG export) -> slide image
   */
  private convertCanvasElement(element: ElementInfo, baseProps: any): any {
    if (!element.dataUrl || element.resourceUnavailable) {
      return this.buildPlaceholderImage(baseProps, 'image');
    }

    const options: any = {
      ...baseProps,
      data: element.dataUrl,
    };

    // Native <canvas> pixels do not include element-level CSS opacity.
    // Playwright isolated screenshots already bake opacity into the PNG — do not apply twice.
    if (element.type === 'canvas' && !element.screenshotBakesOpacity) {
      const transparency = parseTransparency(element.styles?.opacity);
      if (transparency > 0) {
        options.transparency = transparency;
      }
    }

    return {
      type: 'image',
      options,
    };
  }

  /**
   * Convert table element
   */
  private convertTableElement(element: ElementInfo, baseProps: any): any {
    if (!element.tableData || element.tableData.rows.length === 0) {
      return null;
    }

    const rows = element.tableData.rows.map((row) =>
      row.cells.map((cell) => {
        const cellStyles = cell.styles || {};
        const cellText = sanitizeTextForXml(cell.text);
        const cellHints = detectContainerScriptHints(cellText);
        const scriptSegments = splitTextByScript(cellText, cellHints);
        const primaryScript = scriptSegments[0]?.script ?? 'latin';
        const cellOptions = getTextOptions(cellStyles, this.platformFontContext, cellText);
        const cellFaces = this.resolveScriptFontFaces(cellStyles, primaryScript);
        if (cellFaces !== undefined) cellOptions.fontFace = cellFaces.latin;
        const cellFill = getFillOptions(cellStyles);
        const cellBorder = getTableCellBorderOptions(
          cellStyles,
          cellStyles.effectiveBackgroundColor
        );

        const options: any = {
          ...cellOptions,
          ...cellFill,
          colspan: cell.colSpan,
          rowspan: cell.rowSpan,
        };
        if (cellBorder) options.border = cellBorder;

        let cellTextContent: string | Array<{ text: string; options: Record<string, unknown> }> =
          cellText;
        if (scriptSegments.length > 1) {
          cellTextContent = scriptSegments.map((seg) => {
            const segOptions = getTextOptions(cellStyles, this.platformFontContext, seg.text);
            const segFaces = this.resolveScriptFontFaces(cellStyles, seg.script);
            if (segFaces !== undefined) segOptions.fontFace = segFaces.latin;
            return { text: seg.text, options: segOptions };
          });
        }

        return {
          text: cellTextContent,
          options,
        };
      })
    );

    const opts: any = { ...baseProps, rows };

    // Pass column widths and row heights for compact layout (in inches)
    if (element.tableData.colW?.length) {
      opts.colW = element.tableData.colW.map((w: number) => pxToInchX(w));
    }
    if (element.tableData.rowH?.length) {
      opts.rowH = element.tableData.rowH.map((h: number) => pxToInchY(h));
    }

    return {
      type: 'table',
      options: opts,
    };
  }

  /**
   * Get which sides are "special" (differ from majority) for single-side border
   * Returns array of { side: 0|1|2|3, widthPx, colorResult, borderStyle } for sides needing decorations
   */
  private getSpecialBorderSides(styles: any): { side: 0 | 1 | 2 | 3; widthPx: number; colorResult: any; borderStyle: string | undefined }[] {
    const parseW = (w: string | undefined) => (w ? parseFloat(w) || 0 : 0);
    const key = (w: number, c: string) => `${w}-${c || ''}`;
    const getColor = (side: number) => (side === 0 ? styles.borderLeftColor : side === 1 ? styles.borderTopColor : side === 2 ? styles.borderRightColor : styles.borderBottomColor);
    const sides: { side: 0 | 1 | 2 | 3; w: number; c: string; s: string | undefined }[] = [
      { side: 0 as const, w: parseW(styles.borderLeftWidth), c: styles.borderLeftColor, s: styles.borderLeftStyle },
      { side: 1 as const, w: parseW(styles.borderTopWidth), c: styles.borderTopColor, s: styles.borderTopStyle },
      { side: 2 as const, w: parseW(styles.borderRightWidth), c: styles.borderRightColor, s: styles.borderRightStyle },
      { side: 3 as const, w: parseW(styles.borderBottomWidth), c: styles.borderBottomColor, s: styles.borderBottomStyle },
    ].filter((x) => x.w >= 1) as { side: 0 | 1 | 2 | 3; w: number; c: string; s: string | undefined }[];
    const toResult = (x: (typeof sides)[0]) => ({ side: x.side, widthPx: x.w, colorResult: parseColorUtil(getColor(x.side)), borderStyle: x.s });
    // L/T/U partial borders: every bordered side needs its own strip (not a full-rect outline).
    if (sides.length < 4) return sides.map(toResult);
    const counts: Record<string, number> = {};
    for (const x of sides) {
      const k = key(x.w, x.c);
      counts[k] = (counts[k] || 0) + 1;
    }
    const majority = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!majority || majority[1] < 2) return sides.map(toResult);
    const commonKey = majority[0];
    const special = sides.filter((x) => key(x.w, x.c) !== commonKey);
    return special.map(toResult);
  }

  /**
   * Create border decoration elements for special single-side borders only
   * Main element gets common border; special sides get separate shapes (custGeom when rounded)
   */
  private createBorderDecorations(element: ElementInfo, baseProps: any): any[] {
    const decorations: any[] = [];
    const styles = element.styles;
    const cornerRadii = parseCornerRadii(styles.borderRadius, element.width, element.height);
    const hasBorderRadius = cornerRadii.some((r) => r > 0);
    const elementOpacity = parseFloat(String(styles.opacity ?? '1')) || 1;

    const effectiveAlpha = (alpha: number | undefined) => {
      const base = alpha !== undefined ? alpha : 1;
      return Math.min(1, Math.max(0, base * elementOpacity));
    };

    const toBorderFill = (colorResult: { color: string; alpha?: number } | undefined) => {
      if (!colorResult) return undefined;
      const fill: { color: string; transparency?: number } = { color: colorResult.color };
      const alpha = effectiveAlpha(colorResult.alpha);
      if (alpha < 1) {
        fill.transparency = Math.round((1 - alpha) * 100);
      }
      return fill;
    };

    const toLineOptions = (colorResult: { color: string; alpha?: number } | undefined, widthPt: number, dashType: string) => {
      if (!colorResult) return undefined;
      const line: { color: string; width: number; dashType?: string; transparency?: number } = {
        color: colorResult.color,
        width: Math.max(0.5, widthPt),
      };
      if (dashType !== 'solid') line.dashType = dashType as any;
      const alpha = effectiveAlpha(colorResult.alpha);
      if (alpha < 1) {
        line.transparency = Math.round((1 - alpha) * 100);
      }
      return line;
    };

    const specialSides = this.getSpecialBorderSides(styles);
    for (const { side, widthPx, colorResult, borderStyle } of specialSides) {
      if (!colorResult) continue;
      const dashType = parseBorderStyleToDashType(borderStyle);
      const widthInch =
        side === 0 || side === 2 ? pxToInchX(widthPx) : pxToInchY(widthPx);

      if (dashType !== 'solid') {
        const lineOpts = toLineOptions(colorResult, widthPx * 0.5, dashType);
        if (!lineOpts) continue;
        if (side === 0 || side === 2) {
          const x = side === 0 ? baseProps.x : baseProps.x + baseProps.w - widthInch;
          decorations.push({ type: 'line', options: { x, y: baseProps.y + baseProps.h / 2, w: 0, h: baseProps.h, line: lineOpts } });
        } else {
          const y = side === 1 ? baseProps.y : baseProps.y + baseProps.h - widthInch;
          decorations.push({ type: 'line', options: { x: baseProps.x + baseProps.w / 2, y, w: baseProps.w, h: 0, line: lineOpts } });
        }
      } else {
        const fill = toBorderFill(colorResult);
        if (!fill) continue;
        let rectOpts: any;
        if (side === 0) rectOpts = { x: baseProps.x, y: baseProps.y, w: widthInch, h: baseProps.h, fill, line: { type: 'none' as const } };
        else if (side === 1) rectOpts = { x: baseProps.x, y: baseProps.y, w: baseProps.w, h: widthInch, fill, line: { type: 'none' as const } };
        else if (side === 2) rectOpts = { x: baseProps.x + baseProps.w - widthInch, y: baseProps.y, w: widthInch, h: baseProps.h, fill, line: { type: 'none' as const } };
        else rectOpts = { x: baseProps.x, y: baseProps.y + baseProps.h - widthInch, w: baseProps.w, h: widthInch, fill, line: { type: 'none' as const } };

        if (hasBorderRadius) {
          const shape = { type: 'rect' as const, options: rectOpts };
          (shape as any)._singleSideBorder = {
            side,
            borderWidthInch: widthInch,
            elementWidthInch: baseProps.w,
            elementHeightInch: baseProps.h,
            cornerRadiiInch: cornerRadii,
          };
          decorations.push(shape);
        } else {
          decorations.push({ type: 'rect', options: rectOpts });
        }
      }
    }
    return decorations;
  }

  /**
   * Convert shape element (div with background/border)
   */
  private convertShapeElement(
    element: ElementInfo,
    baseProps: any,
    slideIndex: number = 0,
    elementIndex: number = 0,
    slideStartY: number = 0
  ): any {
    // clip-path polygon ∩ box → rect placeholder + custGeom via post-processing
    if (element.clipPathPolygonPx && element.clipPathPolygonPx.length >= 3) {
      const wPx = element.width;
      const hPx = element.height;
      if (wPx > 0 && hPx > 0) {
        const fillOptions = getFillOptions(element.styles);
        const lineOptions = getLineOptions(element.styles);
        const options: any = {
          ...baseProps,
          ...fillOptions,
        };
        const borderType = this.getBorderType(element.styles);
        if (borderType === 'uniform' && lineOptions) {
          options.line = lineOptions;
        } else if (borderType === 'single') {
          const commonLine = this.getCommonLineOptions(element.styles);
          if (commonLine) options.line = commonLine;
        }
        const normalized = element.clipPathPolygonPx.map((p) => ({
          x: Math.round(Math.min(21600, Math.max(0, (p.x / wPx) * 21600))),
          y: Math.round(Math.min(21600, Math.max(0, (p.y / hPx) * 21600))),
        }));
        const shapeResult: any = {
          type: 'rect',
          options,
          _clipPathPolygonNormalized: normalized,
          _clipPathPolygonClosed: true,
        };
        if (options.fill) {
          shapeResult._prefersGradient = true;
        }
        return shapeResult;
      }
    }

    const fillOptions = getFillOptions(element.styles);
    const lineOptions = getLineOptions(element.styles);
    const boxShadowInfo = parseBoxShadowClassified(element.styles.boxShadow);
    let shadow = boxShadowInfo?.effect === 'shadow' ? parseBoxShadow(element.styles.boxShadow) : undefined;
    // Glow data will be registered as an enhancement (injected as XML post-processing)
    const glowData = boxShadowInfo?.effect === 'glow' ? {
      radiusPt: Math.max(1, Math.min(100, pxToPoints(boxShadowInfo.blur))),
      color: boxShadowInfo.color,
      alpha: boxShadowInfo.alpha,
    } : undefined;
    const cornerRadii = parseCornerRadii(
      element.styles.borderRadius,
      element.width,
      element.height
    );
    const isUniformCorner =
      cornerRadii.every((radius) => Math.abs(radius - cornerRadii[0]) < 0.0001);
    const borderRadius = isUniformCorner ? cornerRadii[0] : undefined;

    const options: any = {
      ...baseProps,
      ...fillOptions,
    };

    // Add line if it exists: uniform = all sides; single = common sides (main el), special sides as decorations on top
    const borderType = this.getBorderType(element.styles);
    if (borderType === 'uniform' && lineOptions) {
      options.line = lineOptions;
    } else if (borderType === 'single') {
      const commonLine = this.getCommonLineOptions(element.styles);
      if (commonLine) options.line = commonLine;
    }

    const blurPx = parseBlurFilter(element.styles.filter);
    let softEdgeRadiusPt: number | undefined;
    let softEdgeShadow:
      | {
          blurPt: number;
          distPt: number;
          angleDeg: number;
          color: string;
          opacity: number;
        }
      | undefined;

    if (blurPx && blurPx > 0) {
      const expandInch = pxToInch(blurPx);
      if (expandInch > 0) {
        const originalX = options.x ?? 0;
        const originalY = options.y ?? 0;
        const originalW = options.w ?? 0;
        const originalH = options.h ?? 0;

        const newX = originalX - expandInch;
        const newY = originalY - expandInch;
        const newW = originalW + expandInch * 2;
        const newH = originalH + expandInch * 2;

        options.x = newX;
        options.y = newY;
        options.w = newW;
        options.h = newH;

        baseProps.x = newX;
        baseProps.y = newY;
        baseProps.w = newW;
        baseProps.h = newH;
      }
    }

    if (!shadow) {
      if (blurPx && blurPx > 0) {
        const blurPt = Math.max(1, Math.min(100, pxToPoints(blurPx)));
        const fillColor =
          (options.fill &&
            typeof options.fill === 'object' &&
            typeof (options.fill as any).color === 'string')
            ? (options.fill as any).color
            : parseColorUtil(element.styles.backgroundColor)?.color;

        const fillTransparency =
          options.fill &&
          typeof options.fill === 'object' &&
          typeof (options.fill as any).transparency === 'number'
            ? Math.min(Math.max((options.fill as any).transparency, 0), 100)
            : undefined;
        const styleOpacity =
          typeof element.styles.opacity === 'number' && !Number.isNaN(element.styles.opacity)
            ? Math.min(Math.max(element.styles.opacity, 0), 1)
            : undefined;

        const opacityFromFill =
          fillTransparency !== undefined ? 1 - Math.min(Math.max(fillTransparency / 100, 0), 1) : undefined;
        const opacityFromStyle = styleOpacity;

        const resolvedOpacity = opacityFromFill ?? opacityFromStyle ?? 0.6;

        const opacity = Math.max(0.05, Math.min(1, resolvedOpacity));

        shadow = undefined;
        softEdgeRadiusPt = Math.min(200, Math.max(10, pxToPoints(blurPx) * 2.15));

        const distPt = Math.min(100, Math.max(0, pxToPoints(blurPx) * 0.3));
        softEdgeShadow = {
          blurPt,
          distPt,
          angleDeg: 270,
          color: fillColor ?? '000000',
          opacity,
        };
      }
    }

    if (shadow) {
      options.shadow = shadow;
    }

    // Check for single-corner rounded (e.g. border-bottom-left-radius: 100%)
    const nonZeroCorners = cornerRadii.filter((r) => r > 0).length;

    if (nonZeroCorners === 1) {
      // Use rect; enhancer will replace with custGeom path
      const wInch = baseProps.w ?? pxToInchX(element.width);
      const hInch = baseProps.h ?? pxToInchY(element.height);

      const singleCornerResult: any = {
        type: 'rect',
        options,
        _singleCornerRadii: cornerRadii,
        _shapeWidthInch: wInch,
        _shapeHeightInch: hInch,
      };
      if (glowData) {
        singleCornerResult._glowData = glowData;
      }
      if (softEdgeRadiusPt !== undefined) {
        singleCornerResult._softEdge = { radiusPt: softEdgeRadiusPt, shadow: softEdgeShadow };
      }
      return singleCornerResult;
    }

    // Determine shape type based on border radius (uniform or multiple corners)
    let shapeType = 'rect';

    if (borderRadius) {
      const widthInch = baseProps.w ?? pxToInchX(element.width);
      const heightInch = baseProps.h ?? pxToInchY(element.height);
      const minDimension = Math.min(widthInch, heightInch);
      const maxCorner = Math.max(...cornerRadii);

      // Only use ellipse when border-radius is large relative to BOTH dimensions.
      // e.g. a 50×50 circle with border-radius:25px → both ratios = 0.5 → ellipse
      // e.g. a 60×5 bar with border-radius:3px → width ratio = 0.05 → NOT ellipse
      const wRatio = widthInch > 0 ? maxCorner / (widthInch / 2) : 0;
      const hRatio = heightInch > 0 ? maxCorner / (heightInch / 2) : 0;

      if (wRatio >= 0.8 && hRatio >= 0.8) {
        shapeType = 'ellipse';
        delete options.rectRadius;
      } else {
        shapeType = 'roundRect';
        const maxAllowed = minDimension / 2;
        options.rectRadius = Math.min(borderRadius, maxAllowed);
      }
    }

    const shapeResult: any = {
      type: shapeType,
      options,
    };
    if (options.fill) {
      shapeResult._prefersGradient = true;
    }
    if (glowData) {
      shapeResult._glowData = glowData;
    }
    if (softEdgeRadiusPt !== undefined) {
      shapeResult._softEdge = { radiusPt: softEdgeRadiusPt, shadow: softEdgeShadow };
    }

    return shapeResult;
  }
}
