/**
 * Inject OOXML `<p:transition>` into a slide XML document.
 *
 * Schema order (ECMA-376): cSld, clrMapOvr, transition, timing, extLst.
 */

import type { StyleEnhancement } from '../types';

/**
 * Insert `transitionXml` into the correct schema slot of a slide.
 * Replaces any existing `<p:transition>…</p:transition>`.
 */
export function injectTransitionXml(slideXml: string, transitionXml: string): string {
  // Drop any existing transition (simple non-AlternateContent form).
  let xml = slideXml.replace(/<p:transition\b[^>]*>[\s\S]*?<\/p:transition>/g, '');
  xml = xml.replace(/<p:transition\b[^>]*\/>/g, '');

  const timingIdx = xml.indexOf('<p:timing');
  if (timingIdx >= 0) {
    return xml.slice(0, timingIdx) + transitionXml + xml.slice(timingIdx);
  }

  const extLstIdx = xml.indexOf('<p:extLst');
  if (extLstIdx >= 0) {
    return xml.slice(0, extLstIdx) + transitionXml + xml.slice(extLstIdx);
  }

  const clrMapEnd = xml.indexOf('</p:clrMapOvr>');
  if (clrMapEnd >= 0) {
    const insertAt = clrMapEnd + '</p:clrMapOvr>'.length;
    return xml.slice(0, insertAt) + transitionXml + xml.slice(insertAt);
  }

  const cSldEnd = xml.indexOf('</p:cSld>');
  if (cSldEnd >= 0) {
    const insertAt = cSldEnd + '</p:cSld>'.length;
    return xml.slice(0, insertAt) + transitionXml + xml.slice(insertAt);
  }

  const closeIdx = xml.lastIndexOf('</p:sld>');
  if (closeIdx < 0) {
    console.warn('⚠️  Slide XML missing </p:sld> — slide transition not injected.');
    return slideXml;
  }
  return xml.slice(0, closeIdx) + transitionXml + xml.slice(closeIdx);
}

export function applySlideTransitionToXml(
  slideXml: string,
  enhancement: StyleEnhancement
): string {
  const xml = enhancement.slideTransitionXml;
  if (!xml) return slideXml;
  return injectTransitionXml(slideXml, xml);
}
