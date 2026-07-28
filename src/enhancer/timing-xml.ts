import {
  AnimationTrigger,
  ElementAnimation,
  NormalizedAnimationEffect,
  StyleEnhancement,
} from '../types';

/**
 * Injects a <p:timing> tree into slide XML for entrance animations.
 *
 * Templates follow the cross-player stable subset (the same one Google
 * Slides emits when exporting PPTX): p:set visibility, p:animEffect
 * fade/wipe, p:anim over ppt_x/ppt_y/ppt_w/ppt_h, p:animRot. Timing-tree
 * shape mirrors real PowerPoint files: tmRoot > mainSeq, one top-level par
 * per click group (stCondLst delay="indefinite") or auto-play group
 * (delay="0"), withPrevious effects nested in the group's first par and
 * afterPrevious effects as sibling pars with cumulative delays.
 */

interface EffectItem {
  spid: string;
  animation: ElementAnimation;
}

interface EffectGroup {
  /** true = plays automatically when the slide shows (no click wait). */
  auto: boolean;
  first: EffectItem[];
  after: EffectItem[];
}

const FLY_SUBTYPE: Record<string, number> = { bottom: 4, left: 8, top: 1, right: 2 };
const WIPE_FILTER: Record<string, string> = {
  bottom: 'wipe(down)',
  left: 'wipe(left)',
  top: 'wipe(up)',
  right: 'wipe(right)',
};

interface Preset {
  id: number;
  cls: 'entr' | 'emph';
  subtype: number;
}

function presetFor(effect: NormalizedAnimationEffect): Preset | undefined {
  switch (effect.kind) {
    case 'appear':
      return { id: 1, cls: 'entr', subtype: 0 };
    case 'fade':
      return { id: 10, cls: 'entr', subtype: 0 };
    case 'fly':
      return { id: 2, cls: 'entr', subtype: FLY_SUBTYPE[effect.direction] ?? 4 };
    case 'zoom':
      return { id: 53, cls: 'entr', subtype: 16 };
    case 'wipe':
      return { id: 22, cls: 'entr', subtype: FLY_SUBTYPE[effect.direction] ?? 4 };
    case 'spin':
      return { id: 8, cls: 'emph', subtype: 0 };
    default:
      return undefined;
  }
}

function escapeXmlAttr(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Resolve cNvPr @name → numeric @id(s). One name can map to several shapes
 * (a DOM element split into background shape + text box shares its
 * elementId); animations target all of them so the visual whole animates
 * together.
 */
function resolveShapeIds(slideXml: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const re = /<p:cNvPr\s+id="(\d+)"\s+name="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(slideXml)) !== null) {
    const list = map.get(m[2]);
    if (list) list.push(m[1]);
    else map.set(m[2], [m[1]]);
  }
  return map;
}

function nodeTypeFor(trigger: AnimationTrigger): string {
  switch (trigger) {
    case 'onClick':
      return 'clickEffect';
    case 'withPrevious':
      return 'withEffect';
    case 'afterPrevious':
    default:
      return 'afterEffect';
  }
}

class IdAllocator {
  private nextId = 3;
  next(): number {
    return this.nextId++;
  }
}

/** Behavior nodes (set/animEffect/anim/animRot) for one mapped effect. */
function genBehaviorXml(effect: NormalizedAnimationEffect, spid: string, dur: number, ids: IdAllocator): string {
  const setVisibility =
    '<p:set><p:cBhvr>' +
    `<p:cTn id="${ids.next()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>` +
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>` +
    '<p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>' +
    '</p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>';

  const animEffect = (filter: string) =>
    `<p:animEffect transition="in" filter="${filter}">` +
    `<p:cBhvr><p:cTn id="${ids.next()}" dur="${dur}"/><p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl></p:cBhvr>` +
    '</p:animEffect>';

  const animNum = (attr: string, fromVal: string, fromIsFloat: boolean) =>
    '<p:anim calcmode="lin" valueType="num">' +
    `<p:cBhvr additive="base"><p:cTn id="${ids.next()}" dur="${dur}" fill="hold"/>` +
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>` +
    `<p:attrNameLst><p:attrName>${attr}</p:attrName></p:attrNameLst></p:cBhvr>` +
    '<p:tavLst>' +
    `<p:tav tm="0"><p:val>${fromIsFloat ? `<p:fltVal val="${fromVal}"/>` : `<p:strVal val="${fromVal}"/>`}</p:val></p:tav>` +
    `<p:tav tm="100000"><p:val><p:strVal val="#${attr}"/></p:val></p:tav>` +
    '</p:tavLst></p:anim>';

  switch (effect.kind) {
    case 'appear':
      return setVisibility;
    case 'fade':
      return setVisibility + animEffect('fade');
    case 'fly': {
      const d = effect.direction;
      const startX = d === 'left' ? '0-#ppt_w/2' : d === 'right' ? '1+#ppt_w/2' : '#ppt_x';
      const startY = d === 'top' ? '0-#ppt_h/2' : d === 'bottom' ? '1+#ppt_h/2' : '#ppt_y';
      return setVisibility + animNum('ppt_x', startX, false) + animNum('ppt_y', startY, false);
    }
    case 'zoom':
      return (
        setVisibility +
        animNum('ppt_w', '0', true) +
        animNum('ppt_h', '0', true) +
        animEffect('fade')
      );
    case 'wipe':
      return setVisibility + animEffect(WIPE_FILTER[effect.direction] ?? 'wipe(down)');
    case 'spin': {
      const by = Math.round((effect.angleDeg ?? 360) * 60000);
      return (
        `<p:animRot by="${by}">` +
        `<p:cBhvr><p:cTn id="${ids.next()}" dur="${dur}" fill="hold"/>` +
        `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl>` +
        '<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst></p:cBhvr>' +
        '</p:animRot>'
      );
    }
    default:
      return '';
  }
}

/** One effect par: preset wrapper + behavior nodes. */
function genEffectParXml(item: EffectItem, nodeType: string, ids: IdAllocator): string {
  const { animation } = item;
  const preset = presetFor(animation.effect);
  if (!preset) return '';
  return (
    '<p:par>' +
    `<p:cTn id="${ids.next()}" presetID="${preset.id}" presetClass="${preset.cls}" ` +
    `presetSubtype="${preset.subtype}" fill="hold" grpId="0" nodeType="${nodeType}">` +
    `<p:stCondLst><p:cond delay="${animation.delayMs}"/></p:stCondLst>` +
    '<p:childTnLst>' +
    genBehaviorXml(animation.effect, item.spid, animation.durationMs, ids) +
    '</p:childTnLst>' +
    '</p:cTn>' +
    '</p:par>'
  );
}

/** Total time until this item fully finishes (for afterPrevious scheduling). */
function itemSpanMs(item: EffectItem): number {
  return item.animation.delayMs + item.animation.durationMs;
}

function genGroupXml(group: EffectGroup, ids: IdAllocator): string {
  let xml = '<p:par>';
  xml += `<p:cTn id="${ids.next()}" fill="hold">`;
  xml += '<p:stCondLst>';
  if (group.auto) {
    xml += '<p:cond delay="0"/>';
  } else {
    xml += '<p:cond delay="indefinite"/><p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>';
  }
  xml += '</p:stCondLst>';
  xml += '<p:childTnLst>';

  xml += '<p:par>';
  xml += `<p:cTn id="${ids.next()}" fill="hold">`;
  xml += '<p:stCondLst><p:cond delay="0"/></p:stCondLst>';
  xml += '<p:childTnLst>';
  for (const item of group.first) {
    xml += genEffectParXml(item, nodeTypeFor(item.animation.trigger), ids);
  }
  xml += '</p:childTnLst></p:cTn></p:par>';

  let cumulative = group.first.reduce((max, it) => Math.max(max, itemSpanMs(it)), 0);
  for (const item of group.after) {
    xml += '<p:par>';
    xml += `<p:cTn id="${ids.next()}" fill="hold">`;
    xml += `<p:stCondLst><p:cond delay="${cumulative}"/></p:stCondLst>`;
    xml += '<p:childTnLst>';
    xml += genEffectParXml(item, 'afterEffect', ids);
    xml += '</p:childTnLst></p:cTn></p:par>';
    cumulative += itemSpanMs(item);
  }

  xml += '</p:childTnLst></p:cTn></p:par>';
  return xml;
}

/**
 * Expand entries into per-effect items (an element with fade+fly becomes two
 * sibling effect pars played in parallel), then group by trigger in document
 * order:
 * - onClick starts a new click group;
 * - afterPrevious with no open group starts an auto-play group, otherwise
 *   joins the open group's after-chain;
 * - withPrevious joins the open group's first par (or starts an auto group).
 */
function groupEffects(items: EffectItem[]): EffectGroup[] {
  const groups: EffectGroup[] = [];
  let current: EffectGroup | null = null;
  for (const item of items) {
    const t = item.animation.trigger;
    if (t === 'onClick') {
      current = { auto: false, first: [item], after: [] };
      groups.push(current);
    } else if (t === 'withPrevious') {
      if (!current) {
        current = { auto: true, first: [], after: [] };
        groups.push(current);
      }
      current.first.push(item);
    } else {
      if (!current) {
        current = { auto: true, first: [item], after: [] };
        groups.push(current);
      } else {
        current.after.push(item);
      }
    }
  }
  return groups;
}

export function applyAnimationTimingToXml(slideXml: string, enhancement: StyleEnhancement): string {
  const spec = enhancement.animationData;
  if (!spec || spec.entries.length === 0) return slideXml;

  const shapeIds = resolveShapeIds(slideXml);
  const items: EffectItem[] = [];
  const seenSpids = new Set<string>();

  for (const entry of spec.entries) {
    const spids = shapeIds.get(escapeXmlAttr(entry.objectName));
    if (!spids || spids.length === 0) {
      console.warn(
        `⚠️  Animation target "${entry.objectName}" not found in slide XML — skipped.`
      );
      continue;
    }
    for (const spid of spids) {
      for (const animation of entry.animations) {
        if (animation.effect.kind === 'unmapped') continue;
        items.push({ spid, animation });
        seenSpids.add(spid);
      }
    }
  }
  if (items.length === 0) return slideXml;

  const ids = new IdAllocator();
  const groups = groupEffects(items);

  let xml = '<p:timing><p:tnLst><p:par>';
  xml += '<p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot">';
  xml += '<p:childTnLst>';
  xml += '<p:seq concurrent="1" nextAc="seek">';
  xml += '<p:cTn id="2" dur="indefinite" nodeType="mainSeq">';
  xml += '<p:childTnLst>';
  for (const group of groups) {
    xml += genGroupXml(group, ids);
  }
  xml += '</p:childTnLst></p:cTn>';
  xml += '<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>';
  xml += '<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst>';
  xml += '</p:seq>';
  xml += '</p:childTnLst></p:cTn></p:par></p:tnLst>';
  xml += '<p:bldLst>';
  for (const spid of seenSpids) {
    xml += `<p:bldP spid="${spid}" grpId="0" animBg="1"/>`;
  }
  xml += '</p:bldLst></p:timing>';

  // Schema order: cSld, clrMapOvr, transition, timing, extLst.
  const extLstIdx = slideXml.indexOf('<p:extLst');
  if (extLstIdx >= 0) {
    return slideXml.slice(0, extLstIdx) + xml + slideXml.slice(extLstIdx);
  }
  const closeIdx = slideXml.lastIndexOf('</p:sld>');
  if (closeIdx < 0) {
    console.warn('⚠️  Slide XML missing </p:sld> — animation timing not injected.');
    return slideXml;
  }
  return slideXml.slice(0, closeIdx) + xml + slideXml.slice(closeIdx);
}
