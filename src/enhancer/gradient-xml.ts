import { StyleEnhancement, GradientData, GradientStop } from '../types';

/**
 * OOXML gradient stops must have strictly increasing `pos` (0–100000). Duplicate
 * positions from CSS hard stops merge unpredictably in PowerPoint, producing
 * long soft blends instead of crisp edges. Also pad implicit 0%/100% endpoints
 * when the first/last CSS stop is not at the box edge.
 */
function linearStopsForOoxml(stops: GradientStop[]): GradientStop[] {
  if (stops.length === 0) return stops;

  type Tagged = GradientStop & { sourceOrder: number };
  const tagged: Tagged[] = stops.map((s, i) => ({ ...s, sourceOrder: i }));
  tagged.sort((a, b) => (a.position !== b.position ? a.position - b.position : a.sourceOrder - b.sourceOrder));

  const ordered: GradientStop[] = tagged.map(({ color, position, alpha }) => ({ color, position, alpha }));

  const padded: GradientStop[] = [];
  if (ordered[0].position > 1e-9) {
    padded.push({
      color: ordered[0].color,
      position: 0,
      alpha: ordered[0].alpha,
    });
  }
  padded.push(...ordered);
  const lastPadded = padded[padded.length - 1];
  if (lastPadded.position < 100 - 1e-9) {
    padded.push({ color: lastPadded.color, position: 100, alpha: lastPadded.alpha });
  }

  let prevOoxml = -1;
  const result: GradientStop[] = [];
  for (const s of padded) {
    let oox = Math.round(s.position * 1000);
    if (oox <= prevOoxml) {
      oox = prevOoxml + 1;
    }
    if (oox > 100000) {
      oox = 100000;
    }
    prevOoxml = oox;
    result.push({ ...s, position: oox / 1000 });
  }
  return result;
}

/**
 * Apply gradient fill to an element in slide XML
 * Locates the element by index and replaces <a:solidFill> with <a:gradFill>
 */
export function applyGradientToXml(
  slideXml: string,
  enhancement: StyleEnhancement
): string {
  const { elementIndex, gradientData } = enhancement;

  if (!gradientData) return slideXml;

  // Match all shape elements in the XML
  // PPTX XML contains shapes as <p:sp> (shape) or <p:pic> (picture)
  const shapePattern = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;
  const matches = [...slideXml.matchAll(shapePattern)];

  if (elementIndex >= matches.length) {
    console.warn(`Element index ${elementIndex} out of bounds (total: ${matches.length})`);
    return slideXml;
  }

  const targetMatch = matches[elementIndex];
  const targetShape = targetMatch[0];
  const targetStart = targetMatch.index!;
  const targetEnd = targetStart + targetShape.length;

  // Find <a:solidFill> tag within the shape
  const solidFillPattern = /<a:solidFill>[\s\S]*?<\/a:solidFill>/;
  const solidFillMatch = targetShape.match(solidFillPattern);

  if (!solidFillMatch) {
    console.warn(`No solid fill found in element ${elementIndex}`);
    return slideXml;
  }

  // Apply element opacity to gradient (e.g. opacity: 0.1 on decorative shapes)
  const elementOpacity = enhancement.sourceElement?.styles?.opacity;
  const opacity =
    typeof elementOpacity === 'number' ? elementOpacity : parseFloat(String(elementOpacity || '1')) || 1;

  // Generate gradient XML (path rotated 180° for case 3 bottomLeft → flip gradient)
  const angleAdjustment = enhancement.gradientAngleAdjustment ?? 0;
  const gradientXml = generateGradientXml(gradientData, opacity, angleAdjustment);

  // Replace solidFill with gradFill
  const modifiedShape = targetShape.replace(solidFillPattern, gradientXml);

  // Replace the original shape in the XML
  return (
    slideXml.substring(0, targetStart) +
    modifiedShape +
    slideXml.substring(targetEnd)
  );
}

/**
 * Generate Office Open XML format gradient fill element
 *
 * Format example:
 * <a:gradFill>
 *   <a:gsLst>
 *     <a:gs pos="0">
 *       <a:srgbClr val="FF0000">
 *         <a:alpha val="100000"/>
 *       </a:srgbClr>
 *     </a:gs>
 *     <a:gs pos="100000">
 *       <a:srgbClr val="0000FF"/>
 *     </a:gs>
 *   </a:gsLst>
 *   <a:lin ang="5400000" scaled="0"/>
 * </a:gradFill>
 */
export function generateGradientXml(
  gradientData: GradientData,
  elementOpacity: number = 1,
  angleAdjustment: number = 0
): string {
  if (gradientData.type === 'radial') {
    return generateRadialGradientXml(gradientData, elementOpacity);
  }

  const { angle = 180, stops } = gradientData;
  const effectiveAngle = (angle + angleAdjustment) % 360;

  const sortedStops = linearStopsForOoxml(stops);

  // Generate XML for each color stop
  const gradientStopsXml = sortedStops.map(stop => {
    // OOXML position is 0-100000 (thousandths of a percent)
    const pos = Math.round(stop.position * 1000);

    // Apply element opacity to stop alpha: effective = (stop.alpha ?? 1) * elementOpacity
    const stopAlpha = (stop.alpha ?? 1) * elementOpacity;
    const alphaXml =
      stopAlpha < 1
        ? `<a:alpha val="${Math.round(stopAlpha * 100000)}"/>`
        : '';

    return `<a:gs pos="${pos}"><a:srgbClr val="${stop.color}">${alphaXml}</a:srgbClr></a:gs>`;
  }).join('');

  // Convert angle: CSS (0°=up, 90°=right, 180°=down) → OOXML (0°=right, 90°=down, 180°=left, 270°=up)
  // CSS rotates clockwise from top (0°), OOXML rotates clockwise from right (0°)
  // Formula: OOXML = (CSS + 270) % 360, because CSS 0° (up) = OOXML 270° (up)
  // OOXML angle unit is 1/60000 degree
  const ooxmlAngle = Math.round(((effectiveAngle + 270) % 360) * 60000);

  // scaled="1": gradient vector scales with fill region (w*cos, h*sin) - matches CSS behavior
  // where gradient line extends through corners. scaled="0" would give fixed-angle bands.
  return `<a:gradFill><a:gsLst>${gradientStopsXml}</a:gsLst><a:lin ang="${ooxmlAngle}" scaled="1"></a:lin></a:gradFill>`;
}

/**
 * Radial (path circle) fill: focal center via fillToRect (OOXML ST_Percentage 0–100000).
 */
function generateRadialGradientXml(gradientData: GradientData, elementOpacity: number): string {
  const sortedStops = [...gradientData.stops].sort((a, b) => a.position - b.position);
  const gradientStopsXml = sortedStops.map(stop => {
    const pos = Math.round(stop.position * 1000);
    const stopAlpha = (stop.alpha ?? 1) * elementOpacity;
    const alphaXml =
      stopAlpha < 1
        ? `<a:alpha val="${Math.round(stopAlpha * 100000)}"/>`
        : '';
    return `<a:gs pos="${pos}"><a:srgbClr val="${stop.color}">${alphaXml}</a:srgbClr></a:gs>`;
  }).join('');

  const cx = gradientData.radialCenterX ?? 50;
  const cy = gradientData.radialCenterY ?? 50;
  const l = Math.round(cx * 1000);
  const r = Math.round((100 - cx) * 1000);
  const t = Math.round(cy * 1000);
  const b = Math.round((100 - cy) * 1000);

  return `<a:gradFill><a:gsLst>${gradientStopsXml}</a:gsLst><a:path path="circle"><a:fillToRect l="${l}" t="${t}" r="${r}" b="${b}"/></a:path></a:gradFill>`;
}
