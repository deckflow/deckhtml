import JSZip from 'jszip';
import { StyleEnhancementRegistry } from './registry';
import { StyleEnhancement } from '../types';
import { applyGradientToXml } from './gradient-xml';
import { applyTextGradientToXml } from './text-gradient-xml';
import { applyScriptFontsToXml } from './script-fonts-xml';
import { applySoftEdgeToXml } from './soft-edge-xml';
import { applyTableCellMarginToXml } from './table-cell-margin-xml';
import { applyImageSizingToXml } from './image-sizing-xml';
import { applyImageRoundRectToXml } from './image-roundrect-xml';
import { applySingleCornerRectToXml } from './single-corner-xml';
import { applySingleSideBorderToXml } from './single-side-border-xml';
import { applyGlowToXml } from './glow-xml';
import { applyClipPathPolygonToXml } from './clip-path-polygon-xml';
import { applyWritingModeToXml } from './writing-mode-xml';
import { applyEquationToXml } from './equation-xml';
import { stripUndeclaredWordMlFromSlide } from '../utils/omml-style';

/**
 * Apply all registered style enhancements by modifying PPTX XML
 */
export async function applyStyleEnhancements(
  zipBuffer: ArrayBuffer,
  registry: StyleEnhancementRegistry,
  pptx: any
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(zipBuffer);

  // Get unique slide indices that need processing
  const slideIndices = new Set(registry.getAll().map(e => e.slideIndex));

  for (const slideIndex of slideIndices) {
    const slideFilePath = `ppt/slides/slide${slideIndex + 1}.xml`;
    const slideXmlFile = zip.file(slideFilePath);

    if (!slideXmlFile) {
      console.warn(`⚠️  Slide XML not found: ${slideFilePath}`);
      continue;
    }

    // Read XML content
    let slideXml = await slideXmlFile.async('text');

    // Get all enhancements for this slide, sorted by element index
    const enhancements = registry.getForSlide(slideIndex)
      .sort((a, b) => a.elementIndex - b.elementIndex);

    // Apply each enhancement
    for (const enhancement of enhancements) {
      try {
        slideXml = applyEnhancement(slideXml, enhancement);
      } catch (error) {
        console.error(`Failed to apply enhancement:`, error);
      }
    }

    slideXml = stripUndeclaredWordMlFromSlide(slideXml);

    // Write back modified XML
    zip.file(slideFilePath, slideXml);
  }

  // Return modified ZIP
  return await zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
  });
}

/**
 * Apply a single style enhancement to slide XML
 */
function applyEnhancement(slideXml: string, enhancement: StyleEnhancement): string {
  switch (enhancement.type) {
    case 'gradient':
      return applyGradientToXml(slideXml, enhancement);
    case 'textGradient':
      return applyTextGradientToXml(slideXml, enhancement);
    case 'scriptFonts':
      return applyScriptFontsToXml(slideXml, enhancement);
    case 'softEdge':
      return applySoftEdgeToXml(slideXml, enhancement);
    case 'tableCellMargin':
      return applyTableCellMarginToXml(slideXml, enhancement);
    case 'imageSizing':
      return applyImageSizingToXml(slideXml, enhancement as any);
    case 'imageRoundRect':
      return applyImageRoundRectToXml(slideXml, enhancement as any);
    case 'singleCornerRect':
      return applySingleCornerRectToXml(slideXml, enhancement as any);
    case 'singleSideBorder':
      return applySingleSideBorderToXml(slideXml, enhancement as any);
    case 'glow':
      return applyGlowToXml(slideXml, enhancement);
    case 'clipPathPolygon':
      return applyClipPathPolygonToXml(slideXml, enhancement as any);
    case 'writingMode':
      return applyWritingModeToXml(slideXml, enhancement);
    case 'equation':
      return applyEquationToXml(slideXml, enhancement);
    case 'shadow':
      // Future implementation
      return slideXml;
    default:
      return slideXml;
  }
}
