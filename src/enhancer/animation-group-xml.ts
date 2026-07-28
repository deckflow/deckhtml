import { StyleEnhancement } from '../types';

/**
 * Wrap every top-level shape in <p:spTree> whose cNvPr @name equals `groupName`
 * into a single <p:grpSp> that inherits the same name. The subsequent 'animation'
 * enhancement then resolves the group's spid and animates the whole subtree,
 * mirroring how a `data-animation` on an HTML container drives its entire DOM
 * subtree in the browser.
 *
 * Member shapes have their @name blanked so `resolveShapeIds` (in timing-xml)
 * only matches the wrapping <p:grpSp> — otherwise each member would also be
 * animated individually, replaying the effect once per shape.
 *
 * Coordinates: each member's <a:off> is shifted by -groupOrigin so children are
 * expressed in the group's child coordinate system (chOff = 0,0; chExt = ext).
 */

const SHAPE_TAGS = ['p:sp', 'p:pic', 'p:cxnSp', 'p:graphicFrame'];

interface Member {
  /** Full original XML of the top-level shape element. */
  xml: string;
  /** Start index of the element within the slide XML. */
  start: number;
  /** Parsed xfrm offset (EMU) — null when the shape has no a:off. */
  offX: number | null;
  offY: number | null;
  extCx: number | null;
  extCy: number | null;
}

/**
 * Given the index of a `<p:TAG` opening tag, return the index just past the
 * matching `</p:TAG>` close. Handles nested elements of the same tag and
 * self-closing variants (`<p:TAG .../>`). Returns -1 when unbalanced.
 */
function findElementEnd(xml: string, openIndex: number, tag: string): number {
  const openTagEnd = xml.indexOf('>', openIndex);
  if (openTagEnd === -1) return -1;
  // Self-closing?
  if (xml[openTagEnd - 1] === '/') return openTagEnd + 1;
  const closeTag = `</${tag}>`;
  const openTag = `<${tag}`;
  let depth = 1;
  let i = openTagEnd + 1;
  while (depth > 0 && i < xml.length) {
    const nextClose = xml.indexOf(closeTag, i);
    const nextOpen = xml.indexOf(openTag, i);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      // Ensure it's a real opening tag (not just a substring of another tag).
      const charAfter = xml[nextOpen + openTag.length];
      if (charAfter === '>' || charAfter === ' ' || charAfter === '/' || charAfter === '\t' || charAfter === '\n') {
        depth += 1;
        i = nextOpen + openTag.length;
        continue;
      }
      i = nextOpen + openTag.length;
      continue;
    }
    depth -= 1;
    i = nextClose + closeTag.length;
  }
  return depth === 0 ? i : -1;
}

/** Parse the first <a:off x=.. y=../> and <a:ext cx=.. cy=../> inside an element. */
function parseXfrm(xml: string): {
  offX: number | null;
  offY: number | null;
  extCx: number | null;
  extCy: number | null;
} {
  const offMatch = xml.match(/<a:off\s+x="(-?\d+)"\s+y="(-?\d+)"/);
  const extMatch = xml.match(/<a:ext\s+cx="(-?\d+)"\s+cy="(-?\d+)"/);
  return {
    offX: offMatch ? parseInt(offMatch[1], 10) : null,
    offY: offMatch ? parseInt(offMatch[2], 10) : null,
    extCx: extMatch ? parseInt(extMatch[1], 10) : null,
    extCy: extMatch ? parseInt(extMatch[2], 10) : null,
  };
}

/** Find the highest cNvPr @id in the slide so the new grpSp id won't collide. */
function maxShapeId(xml: string): number {
  let max = 0;
  const re = /<p:cNvPr\s+id="(\d+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return max;
}

/** Shift the first <a:off> inside the element by (-dx, -dy) (EMU, integers). */
function shiftFirstOff(xml: string, dx: number, dy: number): string {
  return xml.replace(
    /(<a:off\s+x=")(-?\d+)("\s+y=")(-?\d+)(")/,
    (_full, pre, x, mid, y, post) => {
      const nx = parseInt(x, 10) - dx;
      const ny = parseInt(y, 10) - dy;
      return `${pre}${nx}${mid}${ny}${post}`;
    }
  );
}

/** Blank the first cNvPr @name occurrence so resolveShapeIds skips this shape. */
function blankFirstName(xml: string, groupName: string): string {
  const escaped = groupName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return xml.replace(
    new RegExp(`(<p:cNvPr\\s+id="\\d+"\\s+name=")${escaped}(")`),
    `$1$2`
  );
}

function escapeXmlAttr(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function applyAnimationGroupToXml(
  slideXml: string,
  enhancement: StyleEnhancement
): string {
  const data = enhancement.animationGroupData;
  if (!data) return slideXml;
  const groupName = data.groupName;

  const spTreeOpen = slideXml.indexOf('<p:spTree>');
  const spTreeClose = slideXml.indexOf('</p:spTree>');
  if (spTreeOpen === -1 || spTreeClose === -1) return slideXml;

  // spTree children begin after the leading <p:nvGrpSpPr>…</p:nvGrpSpPr> and
  // <p:grpSpPr>…</p:grpSpPr>. Scan from the first shape-like opening tag.
  const scanStart = spTreeOpen + '<p:spTree>'.length;

  const members: Member[] = [];
  let i = scanStart;
  while (i < spTreeClose) {
    // Find the next top-level shape opening tag at this depth.
    let nextOpen = -1;
    let nextTag = '';
    for (const tag of SHAPE_TAGS) {
      const idx = slideXml.indexOf(`<${tag}`, i);
    if (idx !== -1 && idx < spTreeClose && (nextOpen === -1 || idx < nextOpen)) {
        nextOpen = idx;
        nextTag = tag;
      }
    }
    if (nextOpen === -1) break;
    const end = findElementEnd(slideXml, nextOpen, nextTag);
    if (end === -1 || end > spTreeClose) break;
    const xml = slideXml.slice(nextOpen, end);
    const nameMatch = xml.match(/<p:cNvPr\s+id="\d+"\s+name="([^"]*)"/);
    if (nameMatch && nameMatch[1] === groupName) {
      const xfrm = parseXfrm(xml);
      members.push({ xml, start: nextOpen, offX: xfrm.offX, offY: xfrm.offY, extCx: xfrm.extCx, extCy: xfrm.extCy });
    }
    i = end;
  }

  if (members.length < 2) return slideXml;

  // Bounding box over all members that have a usable offset/extent.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of members) {
    if (m.offX === null || m.offY === null || m.extCx === null || m.extCy === null) continue;
    minX = Math.min(minX, m.offX);
    minY = Math.min(minY, m.offY);
    maxX = Math.max(maxX, m.offX + m.extCx);
    maxY = Math.max(maxY, m.offY + m.extCy);
  }
  if (!Number.isFinite(minX)) return slideXml;
  const grpW = maxX - minX;
  const grpH = maxY - minY;

  const newId = maxShapeId(slideXml) + 1;
  const escapedName = escapeXmlAttr(groupName);

  let innerXml = '';
  for (const m of members) {
    let piece = m.xml;
    if (m.offX !== null && m.offY !== null) {
      piece = shiftFirstOff(piece, minX, minY);
    }
    piece = blankFirstName(piece, groupName);
    innerXml += piece;
  }

  const grpSp =
    '<p:grpSp>' +
    `<p:nvGrpSpPr><p:cNvPr id="${newId}" name="${escapedName}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm>` +
    `<a:off x="${minX}" y="${minY}"/>` +
    `<a:ext cx="${grpW}" cy="${grpH}"/>` +
    `<a:chOff x="0" y="0"/>` +
    `<a:chExt cx="${grpW}" cy="${grpH}"/>` +
    `</a:xfrm></p:grpSpPr>` +
    innerXml +
    '</p:grpSp>';

  // Splice: remove all member elements, insert the grpSp at the first member's
  // position so z-order relative to non-member siblings is preserved.
  members.sort((a, b) => a.start - b.start);
  const firstStart = members[0].start;
  // Build the new spTree body by stitching the gaps between members.
  let result = slideXml.slice(0, firstStart) + grpSp;
  let prevEnd = firstStart;
  for (let k = 0; k < members.length; k++) {
    const m = members[k];
    // Append the slice between previous insertion point and this member (non-member content).
    result += slideXml.slice(prevEnd, m.start);
    prevEnd = m.start + m.xml.length;
  }
  // Append the rest up to </p:spTree> and beyond.
  result += slideXml.slice(prevEnd);
  return result;
}
