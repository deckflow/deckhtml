import { StyleEnhancement } from '../types';

const PATH_COORD = 21600;

/** Side index: 0=left, 1=top, 2=right, 3=bottom */
export type BorderSide = 0 | 1 | 2 | 3;

/** Convert inch to path coord: path 0-21600 maps to shape dimension */
function inchToPath(inch: number, dimInch: number): number {
  if (dimInch <= 0) return 0;
  return Math.round(Math.max(0, Math.min(PATH_COORD, (inch / dimInch) * PATH_COORD)));
}

/** Uncapped: for arc ellipse radii when R can exceed strip dimension (e.g. R > borderWidth) */
function inchToPathUncapped(inch: number, dimInch: number): number {
  if (dimInch <= 0) return 0;
  return Math.round(Math.max(0, (inch / dimInch) * PATH_COORD));
}

/**
 * X where arc (center R,R, radius R) crosses y=borderWidth. For top border.
 */
function arcXAtY(borderWidth: number, R: number): number {
  if (borderWidth >= R) return 0;
  const d = R - borderWidth;
  return R - Math.sqrt(Math.max(0, R * R - d * d));
}

/** User's angle: 360° = full circle. Convert to radians for Math: 2π = full circle */
const DEG_TO_RAD = Math.PI / 180;

/**
 * Arc angle in degrees (user's 360° = full circle): 90 - (90 * borderWidth / cornerRadius)
 */
function arcAngleDeg(bw: number, R: number): number {
  if (R <= 0) return 0;
  return Math.max(0, Math.min(90, 90 - (90 * bw) / R));
}

function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const a = angleDeg * DEG_TO_RAD;
  return {
    x: cx + r * Math.cos(a),
    y: cy + r * Math.sin(a),
  };
}

function cubicArcByAngles(
  px: (x: number) => number,
  py: (y: number) => number,
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  sweepDeg: number
): string {
  if (r <= 0 || sweepDeg === 0) {
    const end = pointOnCircle(cx, cy, r, startDeg + sweepDeg);
    return `<a:lnTo><a:pt x="${px(end.x)}" y="${py(end.y)}"/></a:lnTo>`;
  }

  const a0 = startDeg * DEG_TO_RAD;
  const a1 = (startDeg + sweepDeg) * DEG_TO_RAD;
  const delta = (sweepDeg * Math.PI) / 180;
  const k = (4 / 3) * Math.tan(Math.abs(delta) / 4);
  const sign = sweepDeg >= 0 ? 1 : -1;

  const p0 = { x: cx + r * Math.cos(a0), y: cy + r * Math.sin(a0) };
  const p1 = { x: cx + r * Math.cos(a1), y: cy + r * Math.sin(a1) };

  const t0 = { x: sign * -Math.sin(a0), y: sign * Math.cos(a0) };
  const t1 = { x: sign * -Math.sin(a1), y: sign * Math.cos(a1) };

  const c1 = { x: p0.x + k * r * t0.x, y: p0.y + k * r * t0.y };
  const c2 = { x: p1.x - k * r * t1.x, y: p1.y - k * r * t1.y };

  return `<a:cubicBezTo><a:pt x="${px(c1.x)}" y="${py(c1.y)}"/><a:pt x="${px(c2.x)}" y="${py(c2.y)}"/><a:pt x="${px(p1.x)}" y="${py(p1.y)}"/></a:cubicBezTo>`;
}

function normalizeDeg(deg: number): number {
  let v = deg % 360;
  if (v < 0) v += 360;
  return v;
}

function getSweepDeg(startDeg: number, endDeg: number, clockwise: boolean): number {
  const s = normalizeDeg(startDeg);
  const e = normalizeDeg(endDeg);
  if (clockwise) {
    let delta = s - e;
    if (delta < 0) delta += 360;
    return -delta;
  }
  let delta = e - s;
  if (delta < 0) delta += 360;
  return delta;
}

function cubicArcByEndpoints(
  px: (x: number) => number,
  py: (y: number) => number,
  cx: number,
  cy: number,
  r: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
  clockwise: boolean
): string {
  const startDeg = (Math.atan2(start.y - cy, start.x - cx) * 180) / Math.PI;
  const endDeg = (Math.atan2(end.y - cy, end.x - cx) * 180) / Math.PI;
  const sweepDeg = getSweepDeg(startDeg, endDeg, clockwise);
  return cubicArcByAngles(px, py, cx, cy, r, startDeg, sweepDeg);
}


const ARC_90 = 5400000;
const ARC_270 = 16200000;

/**
 * Swap path x and y in OOXML path string so path built for (bw × stripLength) maps to (stripLength × bw).
 */
function swapPathXY(pathStr: string): string {
  return pathStr.replace(/x="(\d+)"\s+y="(\d+)"/g, 'x="$2" y="$1"');
}

/**
 * Build OOXML path for a "left-style" strip: strip width = bw, strip length = stripLength,
 * curved edge at x=0 (with corners at y=R1 and y=stripLength-R2), straight edge at x=bw.
 * This is the single code path used for left border; top reuses it and swaps x/y.
 */
function buildLeftStyleStripPath(
  bw: number,
  stripLength: number,
  R1: number,
  R2: number
): string {
  const w = PATH_COORD;
  const h = PATH_COORD;
  const px = (x: number) => inchToPath(x, bw);
  const py = (y: number) => inchToPath(y, stripLength);

  if (R1 <= 0 && R2 <= 0) {
    return (
      `<a:moveTo><a:pt x="${w}" y="0"/></a:moveTo>` +
      `<a:lnTo><a:pt x="${w}" y="${h}"/></a:lnTo>` +
      `<a:lnTo><a:pt x="0" y="${h}"/></a:lnTo>` +
      `<a:lnTo><a:pt x="0" y="0"/></a:lnTo>` +
      `<a:close/>`
    );
  }

  const path: string[] = [];
  const yTopJoin =
    R1 > 0 && bw < R1
      ? R1 - Math.sqrt(Math.max(0, R1 * R1 - (R1 - bw) * (R1 - bw)))
      : 0;
  const yBottomJoin =
    R2 > 0 && bw < R2
      ? stripLength - R2 + Math.sqrt(Math.max(0, R2 * R2 - (R2 - bw) * (R2 - bw)))
      : stripLength;

  const outerTopJoin = { x: bw, y: yTopJoin };
  const outerBottomJoin = { x: bw, y: yBottomJoin };
  const leftTop = { x: 0, y: R1 };
  const leftBottom = { x: 0, y: stripLength - R2 };
  const innerTopStraight = { x: bw, y: R1 };
  const innerBottomStraight = { x: bw, y: stripLength - R2 };
  const hasTopArc = R1 > 0 && bw < R1;
  const hasBottomArc = R2 > 0 && bw < R2;
  const innerTopR = Math.max(0, R1 - bw);
  const innerBottomR = Math.max(0, R2 - bw);

  path.push(`<a:moveTo><a:pt x="${px(outerTopJoin.x)}" y="${py(outerTopJoin.y)}"/></a:moveTo>`);

  if (hasTopArc) {
    path.push(cubicArcByEndpoints(px, py, R1, R1, R1, outerTopJoin, leftTop, true));
  } else {
    path.push(`<a:lnTo><a:pt x="${px(leftTop.x)}" y="${py(leftTop.y)}"/></a:lnTo>`);
  }

  path.push(`<a:lnTo><a:pt x="${px(leftBottom.x)}" y="${py(leftBottom.y)}"/></a:lnTo>`);

  if (hasBottomArc) {
    path.push(cubicArcByEndpoints(px, py, R2, stripLength - R2, R2, leftBottom, outerBottomJoin, true));
  } else {
    path.push(`<a:lnTo><a:pt x="${px(outerBottomJoin.x)}" y="${py(outerBottomJoin.y)}"/></a:lnTo>`);
  }

  let innerBottomJoin = innerBottomStraight;
  if (hasBottomArc && innerBottomR > 0) {
    const a = Math.atan2(outerBottomJoin.y - (stripLength - R2), outerBottomJoin.x - R2);
    innerBottomJoin = {
      x: R2 + innerBottomR * Math.cos(a),
      y: stripLength - R2 + innerBottomR * Math.sin(a),
    };
  }
  path.push(`<a:lnTo><a:pt x="${px(innerBottomJoin.x)}" y="${py(innerBottomJoin.y)}"/></a:lnTo>`);

  if (hasBottomArc && innerBottomR > 0) {
    path.push(
      cubicArcByEndpoints(
        px,
        py,
        R2,
        stripLength - R2,
        innerBottomR,
        innerBottomJoin,
        innerBottomStraight,
        false
      )
    );
  }

  path.push(`<a:lnTo><a:pt x="${px(innerTopStraight.x)}" y="${py(innerTopStraight.y)}"/></a:lnTo>`);

  let innerTopJoin = innerTopStraight;
  if (hasTopArc && innerTopR > 0) {
    const a = Math.atan2(outerTopJoin.y - R1, outerTopJoin.x - R1);
    innerTopJoin = {
      x: R1 + innerTopR * Math.cos(a),
      y: R1 + innerTopR * Math.sin(a),
    };
    path.push(cubicArcByEndpoints(px, py, R1, R1, innerTopR, innerTopStraight, innerTopJoin, false));
  }

  path.push(`<a:lnTo><a:pt x="${px(outerTopJoin.x)}" y="${py(outerTopJoin.y)}"/></a:lnTo>`);
  path.push(`<a:close/>`);
  return path.join('');
}

/**
 * Build OOXML custGeom path for a single-side border strip.
 * Left border uses buildLeftStyleStripPath directly; top reuses it with (bw, ew, R1, R2) then swaps x/y.
 */
function buildSingleSideBorderPath(
  side: BorderSide,
  borderWidthInch: number,
  elementWidthInch: number,
  elementHeightInch: number,
  cornerRadiiInch: [number, number, number, number]
): string {
  if (borderWidthInch <= 0 || elementWidthInch <= 0 || elementHeightInch <= 0) return '';

  const [topLeftR, topRightR, bottomRightR, bottomLeftR] = cornerRadiiInch;
  const bw = borderWidthInch;
  const ew = elementWidthInch;
  const eh = elementHeightInch;
  const w = PATH_COORD;
  const h = PATH_COORD;

  switch (side) {
    case 0: {
      return buildLeftStyleStripPath(bw, eh, topLeftR, bottomLeftR);
    }
    case 1: {
      // Top: reuse left-style strip with stripLength=ew and corners (topLeftR, topRightR), then swap x/y
      // so path extent becomes (ew × bw) and curved edge maps to top of shape.
      return swapPathXY(buildLeftStyleStripPath(bw, ew, topLeftR, topRightR));
    }
    case 2: {
      const px = (x: number) => inchToPath(x, bw);
      const py = (y: number) => inchToPath(y, eh);
      const R1 = topRightR;
      const R2 = bottomRightR;
      const yTopJoin =
        R1 > 0 && bw < R1
          ? R1 - Math.sqrt(Math.max(0, R1 * R1 - (R1 - bw) * (R1 - bw)))
          : 0;
      const yBottomJoin =
        R2 > 0 && bw < R2
          ? eh - R2 + Math.sqrt(Math.max(0, R2 * R2 - (R2 - bw) * (R2 - bw)))
          : eh;

      if (R1 <= 0 && R2 <= 0) {
        return (
          `<a:moveTo><a:pt x="0" y="0"/></a:moveTo>` +
          `<a:lnTo><a:pt x="${w}" y="0"/></a:lnTo>` +
          `<a:lnTo><a:pt x="${w}" y="${h}"/></a:lnTo>` +
          `<a:lnTo><a:pt x="0" y="${h}"/></a:lnTo>` +
          `<a:close/>`
        );
      }
      const path: string[] = [];
      const cxTop = bw - R1;
      const cyTop = R1;
      const cxBottom = bw - R2;
      const cyBottom = eh - R2;
      const outerTopJoin = { x: 0, y: yTopJoin };
      const outerBottomJoin = { x: 0, y: yBottomJoin };
      const outerTop = { x: bw, y: R1 };
      const outerBottom = { x: bw, y: eh - R2 };
      const innerTopStraight = { x: 0, y: R1 };
      const innerBottomStraight = { x: 0, y: eh - R2 };
      const hasTopArc = R1 > 0 && bw < R1;
      const hasBottomArc = R2 > 0 && bw < R2;
      const innerTopR = Math.max(0, R1 - bw);
      const innerBottomR = Math.max(0, R2 - bw);

      path.push(`<a:moveTo><a:pt x="${px(outerTopJoin.x)}" y="${py(outerTopJoin.y)}"/></a:moveTo>`);

      if (hasTopArc) {
        path.push(cubicArcByEndpoints(px, py, cxTop, cyTop, R1, outerTopJoin, outerTop, false));
      } else {
        path.push(`<a:lnTo><a:pt x="${px(outerTop.x)}" y="${py(outerTop.y)}"/></a:lnTo>`);
      }

      path.push(`<a:lnTo><a:pt x="${px(outerBottom.x)}" y="${py(outerBottom.y)}"/></a:lnTo>`);

      if (hasBottomArc) {
        path.push(cubicArcByEndpoints(px, py, cxBottom, cyBottom, R2, outerBottom, outerBottomJoin, false));
      } else {
        path.push(`<a:lnTo><a:pt x="${px(outerBottomJoin.x)}" y="${py(outerBottomJoin.y)}"/></a:lnTo>`);
      }

      let innerBottomJoin = innerBottomStraight;
      if (hasBottomArc && innerBottomR > 0) {
        const a = Math.atan2(outerBottomJoin.y - cyBottom, outerBottomJoin.x - cxBottom);
        innerBottomJoin = { x: cxBottom + innerBottomR * Math.cos(a), y: cyBottom + innerBottomR * Math.sin(a) };
      }
      path.push(`<a:lnTo><a:pt x="${px(innerBottomJoin.x)}" y="${py(innerBottomJoin.y)}"/></a:lnTo>`);

      if (hasBottomArc && innerBottomR > 0) {
        path.push(
          cubicArcByEndpoints(
            px,
            py,
            cxBottom,
            cyBottom,
            innerBottomR,
            innerBottomJoin,
            innerBottomStraight,
            true
          )
        );
      }

      path.push(`<a:lnTo><a:pt x="${px(innerTopStraight.x)}" y="${py(innerTopStraight.y)}"/></a:lnTo>`);

      let innerTopJoin = innerTopStraight;
      if (hasTopArc && innerTopR > 0) {
        const a = Math.atan2(outerTopJoin.y - cyTop, outerTopJoin.x - cxTop);
        innerTopJoin = { x: cxTop + innerTopR * Math.cos(a), y: cyTop + innerTopR * Math.sin(a) };
        path.push(cubicArcByEndpoints(px, py, cxTop, cyTop, innerTopR, innerTopStraight, innerTopJoin, true));
      }

      path.push(`<a:lnTo><a:pt x="${px(outerTopJoin.x)}" y="${py(outerTopJoin.y)}"/></a:lnTo>`);
      path.push(`<a:close/>`);
      return path.join('');
    }
    case 3: {
      const R1 = bottomLeftR;
      const R2 = bottomRightR;
      const xLeftJoin = R1 > 0 && bw < R1 ? arcXAtY(bw, R1) : 0;
      const xRightJoin =
        R2 > 0 && bw < R2
          ? ew - R2 + Math.sqrt(Math.max(0, R2 * R2 - (R2 - bw) * (R2 - bw)))
          : ew;

      if (R1 <= 0 && R2 <= 0) {
        return (
          `<a:moveTo><a:pt x="0" y="0"/></a:moveTo>` +
          `<a:lnTo><a:pt x="${w}" y="0"/></a:lnTo>` +
          `<a:lnTo><a:pt x="${w}" y="${h}"/></a:lnTo>` +
          `<a:lnTo><a:pt x="0" y="${h}"/></a:lnTo>` +
          `<a:close/>`
        );
      }
      const pxW = (x: number) => inchToPath(x, ew);
      const pyH = (y: number) => inchToPath(y, bw);
      const path: string[] = [];
      const cxLeft = R1;
      const cyLeft = bw - R1;
      const cxRight = ew - R2;
      const cyRight = bw - R2;
      const outerLeftJoin = { x: xLeftJoin, y: 0 };
      const outerRightJoin = { x: xRightJoin, y: 0 };
      const outerLeft = { x: R1, y: bw };
      const outerRight = { x: ew - R2, y: bw };
      const innerLeftStraight = { x: R1, y: 0 };
      const innerRightStraight = { x: ew - R2, y: 0 };
      const hasLeftArc = R1 > 0 && bw < R1;
      const hasRightArc = R2 > 0 && bw < R2;
      const innerLeftR = Math.max(0, R1 - bw);
      const innerRightR = Math.max(0, R2 - bw);

      path.push(`<a:moveTo><a:pt x="${pxW(outerLeftJoin.x)}" y="${pyH(outerLeftJoin.y)}"/></a:moveTo>`);

      if (hasLeftArc) {
        path.push(cubicArcByEndpoints(pxW, pyH, cxLeft, cyLeft, R1, outerLeftJoin, outerLeft, true));
      } else {
        path.push(`<a:lnTo><a:pt x="${pxW(outerLeft.x)}" y="${pyH(outerLeft.y)}"/></a:lnTo>`);
      }

      path.push(`<a:lnTo><a:pt x="${pxW(outerRight.x)}" y="${pyH(outerRight.y)}"/></a:lnTo>`);

      if (hasRightArc) {
        path.push(cubicArcByEndpoints(pxW, pyH, cxRight, cyRight, R2, outerRight, outerRightJoin, true));
      } else {
        path.push(`<a:lnTo><a:pt x="${pxW(outerRightJoin.x)}" y="${pyH(outerRightJoin.y)}"/></a:lnTo>`);
      }

      let innerRightJoin = innerRightStraight;
      if (hasRightArc && innerRightR > 0) {
        const a = Math.atan2(outerRightJoin.y - cyRight, outerRightJoin.x - cxRight);
        innerRightJoin = { x: cxRight + innerRightR * Math.cos(a), y: cyRight + innerRightR * Math.sin(a) };
      }
      path.push(`<a:lnTo><a:pt x="${pxW(innerRightJoin.x)}" y="${pyH(innerRightJoin.y)}"/></a:lnTo>`);

      if (hasRightArc && innerRightR > 0) {
        path.push(
          cubicArcByEndpoints(
            pxW,
            pyH,
            cxRight,
            cyRight,
            innerRightR,
            innerRightJoin,
            innerRightStraight,
            false
          )
        );
      }

      path.push(`<a:lnTo><a:pt x="${pxW(innerLeftStraight.x)}" y="${pyH(innerLeftStraight.y)}"/></a:lnTo>`);

      let innerLeftJoin = innerLeftStraight;
      if (hasLeftArc && innerLeftR > 0) {
        const a = Math.atan2(outerLeftJoin.y - cyLeft, outerLeftJoin.x - cxLeft);
        innerLeftJoin = { x: cxLeft + innerLeftR * Math.cos(a), y: cyLeft + innerLeftR * Math.sin(a) };
        path.push(cubicArcByEndpoints(pxW, pyH, cxLeft, cyLeft, innerLeftR, innerLeftStraight, innerLeftJoin, false));
      }

      path.push(`<a:lnTo><a:pt x="${pxW(outerLeftJoin.x)}" y="${pyH(outerLeftJoin.y)}"/></a:lnTo>`);
      path.push(`<a:close/>`);
      return path.join('');
    }
    default:
      return '';
  }
}

export interface SingleSideBorderEnhancement extends StyleEnhancement {
  type: 'singleSideBorder';
  elementIndex: number;
  side: BorderSide;
  borderWidthInch: number;
  elementWidthInch: number;
  elementHeightInch: number;
  cornerRadiiInch: [number, number, number, number];
}

export function applySingleSideBorderToXml(
  slideXml: string,
  enhancement: SingleSideBorderEnhancement
): string {
  const { elementIndex, side, borderWidthInch, elementWidthInch, elementHeightInch, cornerRadiiInch } = enhancement;

  const pathContent = buildSingleSideBorderPath(
    side,
    borderWidthInch,
    elementWidthInch,
    elementHeightInch,
    cornerRadiiInch
  );
  if (!pathContent) return slideXml;

  const custGeomXml = `<a:custGeom><a:pathLst><a:path w="${PATH_COORD}" h="${PATH_COORD}">${pathContent}</a:path></a:pathLst></a:custGeom>`;

  const shapePattern = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;
  const matches = [...slideXml.matchAll(shapePattern)];

  if (elementIndex >= matches.length) return slideXml;

  const targetMatch = matches[elementIndex];
  const targetShape = targetMatch[0];
  const targetStart = targetMatch.index!;
  const targetEnd = targetStart + targetShape.length;

  const prstGeomPattern = /<a:prstGeom prst="rect">[\s\S]*?<\/a:prstGeom>/;
  if (!targetShape.match(prstGeomPattern)) return slideXml;

  const modifiedShape = targetShape.replace(prstGeomPattern, custGeomXml);

  return (
    slideXml.substring(0, targetStart) +
    modifiedShape +
    slideXml.substring(targetEnd)
  );
}
