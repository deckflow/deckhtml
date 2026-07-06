import { StyleEnhancement } from '../types';

import { svgArcToOoxmlArcTo } from '../utils/svg-arc-ooxml';

const PATH_COORD = 21600;

type PathCommand =
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

function buildCustGeomXml(
  pathParts: string[]
): string {
  return `<a:custGeom><a:pathLst><a:path w="${PATH_COORD}" h="${PATH_COORD}">${pathParts.join('')}</a:path></a:pathLst></a:custGeom>`;
}

function buildPathPartsFromPoints(
  pts: { x: number; y: number }[],
  closed: boolean
): string[] {
  const pathParts: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const tag = i === 0 ? 'moveTo' : 'lnTo';
    pathParts.push(`<a:${tag}><a:pt x="${p.x}" y="${p.y}"/></a:${tag}>`);
  }
  if (closed && pts.length >= 3) {
    pathParts.push('<a:close/>');
  }
  return pathParts;
}

function buildPathPartsFromCommands(cmds: PathCommand[]): string[] {
  const pathParts: string[] = [];
  let lastX = 0;
  let lastY = 0;
  for (const cmd of cmds) {
    if (cmd.type === 'Z') {
      pathParts.push('<a:close/>');
    } else if (cmd.type === 'A') {
      const arc = svgArcToOoxmlArcTo(
        lastX,
        lastY,
        cmd.rx,
        cmd.ry,
        cmd.rot,
        cmd.large,
        cmd.sweep,
        cmd.x,
        cmd.y
      );
      if (arc) {
        pathParts.push(
          `<a:arcTo wR="${arc.wR}" hR="${arc.hR}" stAng="${arc.stAng}" swAng="${arc.swAng}"/>`
        );
      } else {
        pathParts.push(`<a:lnTo><a:pt x="${cmd.x}" y="${cmd.y}"/></a:lnTo>`);
      }
      lastX = cmd.x;
      lastY = cmd.y;
    } else if (cmd.type === 'C') {
      pathParts.push(
        `<a:cubicBezTo><a:pt x="${cmd.x1}" y="${cmd.y1}"/><a:pt x="${cmd.x2}" y="${cmd.y2}"/><a:pt x="${cmd.x}" y="${cmd.y}"/></a:cubicBezTo>`
      );
      lastX = cmd.x;
      lastY = cmd.y;
    } else {
      const tag = cmd.type === 'M' ? 'moveTo' : 'lnTo';
      pathParts.push(`<a:${tag}><a:pt x="${cmd.x}" y="${cmd.y}"/></a:${tag}>`);
      lastX = cmd.x;
      lastY = cmd.y;
    }
  }
  return pathParts;
}

/**
 * Replace prstGeom rect with custGeom from clip-path intersection polygon (normalized 0–PATH_COORD).
 */
export function applyClipPathPolygonToXml(
  slideXml: string,
  enhancement: StyleEnhancement & {
    elementIndex: number;
    clipPathPolygonNormalized?: { x: number; y: number }[];
    clipPathCommandsNormalized?: PathCommand[];
  }
): string {
  const {
    elementIndex,
    clipPathPolygonNormalized: pts,
    clipPathCommandsNormalized: cmds,
    clipPathPolygonClosed = true,
  } = enhancement;

  let pathParts: string[] | null = null;
  if (cmds && cmds.length >= 2) {
    pathParts = buildPathPartsFromCommands(cmds);
  } else if (pts && pts.length >= 2) {
    pathParts = buildPathPartsFromPoints(pts, clipPathPolygonClosed);
  }
  if (!pathParts) return slideXml;

  const custGeomXml = buildCustGeomXml(pathParts);

  const shapePattern = /<p:sp\b[^>]*>[\s\S]*?<\/p:sp>/g;
  const matches = [...slideXml.matchAll(shapePattern)];

  if (elementIndex >= matches.length) return slideXml;

  const targetMatch = matches[elementIndex];
  const targetShape = targetMatch[0];
  const targetStart = targetMatch.index!;
  const targetEnd = targetStart + targetShape.length;

  // Do not restrict to rect: pptxgenjs may emit roundRect/other presets
  // for seemingly rectangular HTML boxes depending on options.
  const prstGeomPattern = /<a:prstGeom\b[^>]*>[\s\S]*?<\/a:prstGeom>/;
  if (!targetShape.match(prstGeomPattern)) return slideXml;

  const modifiedShape = targetShape.replace(prstGeomPattern, custGeomXml);

  return (
    slideXml.substring(0, targetStart) +
    modifiedShape +
    slideXml.substring(targetEnd)
  );
}
