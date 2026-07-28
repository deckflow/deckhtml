import type { Page } from 'playwright-core';

/**
 * anime.js runs entirely in page JS, so its parameters cannot be read back
 * statically. This init script (installed before any page script runs) wraps
 * the global `anime` (v3 UMD) / `animejs` (v4 UMD namespace) via Proxy and
 * records every animate()/timeline.add() call whose targets are DOM elements
 * into window.__deckhtmlAnimeCalls, stamping each target with
 * data-dh-anim-anime="<indices>". readAnimationRaw folds those into
 * animationRaw.animeRaws during inspection.
 *
 * Limitations (documented): pages that import anime.js as an ES module never
 * touch the window globals and are not intercepted — those users should use
 * data-animation declarations instead.
 */
const ANIME_INTERCEPTOR_SCRIPT = `(() => {
  const WIN_CALLS = '__deckhtmlAnimeCalls';
  const MARK = 'data-dh-anim-anime';
  if (window[WIN_CALLS]) return;
  const calls = [];
  window[WIN_CALLS] = calls;

  const PICK_KEYS = ['translateX', 'translateY', 'x', 'y', 'scale', 'scaleX', 'scaleY',
    'rotate', 'rotateX', 'rotateY', 'opacity', 'motionPath', 'path', 'points',
    'width', 'height', 'color', 'backgroundColor', 'borderRadius'];

  function sanitizeValue(v, state) {
    if (v == null) return v;
    const t = typeof v;
    if (t === 'number' || t === 'string' || t === 'boolean') return v;
    if (t === 'function') { state.staggered = true; return undefined; }
    if (Array.isArray(v)) {
      return v.map((x) => sanitizeValue(x, state));
    }
    if (t === 'object') {
      if (v instanceof Element) return undefined;
      const out = {};
      for (const k of ['to', 'from', 'value']) {
        if (k in v) out[k] = sanitizeValue(v[k], state);
      }
      if (Object.keys(out).length === 0) { state.staggered = true; return undefined; }
      return out;
    }
    return undefined;
  }

  function sanitizeParams(params) {
    const state = { staggered: false };
    const out = {};
    const src = params && typeof params === 'object' ? params : {};
    for (const k of PICK_KEYS) {
      if (k in src) {
        const v = sanitizeValue(src[k], state);
        if (v !== undefined) out[k] = v;
      }
    }
    const duration = typeof src.duration === 'number' ? src.duration : undefined;
    let delay;
    if (typeof src.delay === 'number') delay = src.delay;
    else if (src.delay != null) state.staggered = true;
    if (typeof src.ease === 'function' || typeof src.easing === 'function') {
      // custom easing (e.g. createSpring) — curve itself is dropped
    }
    return {
      params: out,
      durationMs: duration,
      delayMs: delay,
      staggered: state.staggered,
    };
  }

  function resolveTargets(targets) {
    if (!targets) return [];
    if (typeof targets === 'string') {
      try { return Array.from(document.querySelectorAll(targets)); } catch { return []; }
    }
    if (targets instanceof Element) return [targets];
    if (typeof targets.length === 'number' && typeof targets !== 'function') {
      return Array.from(targets).filter((t) => t instanceof Element);
    }
    return []; // plain JS object targets are not DOM animations
  }

  function recordCall(targets, params) {
    const els = resolveTargets(targets);
    if (els.length === 0) return;
    const idx = calls.length;
    calls.push(sanitizeParams(params));
    for (const el of els) {
      const prev = el.getAttribute(MARK);
      el.setAttribute(MARK, prev ? prev + ',' + idx : String(idx));
    }
  }

  function wrapTimeline(tl, v3) {
    if (!tl || typeof tl.add !== 'function') return tl;
    return new Proxy(tl, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, receiver);
        if (prop === 'add' && typeof v === 'function') {
          return function (a, b, ...rest) {
            try {
              if (v3) { if (a && a.targets) recordCall(a.targets, a); }
              else { recordCall(a, b); }
            } catch (e) {}
            return v.call(this, a, b, ...rest);
          };
        }
        return v;
      },
    });
  }

  function wrapApi(api) {
    if (typeof api === 'function') {
      // anime.js v3: anime({ targets, ...params }); anime.timeline(...)
      return new Proxy(api, {
        apply(target, thisArg, args) {
          try {
            const p = args[0];
            if (p && p.targets) recordCall(p.targets, p);
          } catch (e) {}
          return Reflect.apply(target, thisArg, args);
        },
        get(target, prop, receiver) {
          const v = Reflect.get(target, prop, receiver);
          if (prop === 'timeline' && typeof v === 'function') {
            return function (...args) { return wrapTimeline(v.apply(this, args), true); };
          }
          return v;
        },
      });
    }
    if (api && typeof api === 'object') {
      // anime.js v4 namespace: animate(targets, params); createTimeline()
      return new Proxy(api, {
        get(target, prop, receiver) {
          const v = Reflect.get(target, prop, receiver);
          if (prop === 'animate' && typeof v === 'function') {
            return function (targets, params, ...rest) {
              try { recordCall(targets, params); } catch (e) {}
              return v.call(this, targets, params, ...rest);
            };
          }
          if (prop === 'createTimeline' && typeof v === 'function') {
            return function (...args) { return wrapTimeline(v.apply(this, args), false); };
          }
          return v;
        },
      });
    }
    return api;
  }

  for (const name of ['anime', 'animejs']) {
    let value = window[name];
    try {
      Object.defineProperty(window, name, {
        configurable: true,
        enumerable: true,
        get() { return value; },
        set(v) { value = wrapApi(v); },
      });
      if (value) value = wrapApi(value);
    } catch (e) {}
  }
})();`;

/**
 * Install the anime.js interception init script on a page. Must be called
 * before navigation (addInitScript runs ahead of any page script).
 */
export async function installAnimeInterceptor(page: Page): Promise<void> {
  await page.addInitScript(ANIME_INTERCEPTOR_SCRIPT).catch(() => {});
}
