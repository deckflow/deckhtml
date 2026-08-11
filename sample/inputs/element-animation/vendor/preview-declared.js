/**
 * Browser-only preview for data-animation* declarations.
 * Skipped under Playwright (navigator.webdriver) so DeckHTML capture
 * still sees the static end-state and exports via data-animation.
 */
(function () {
  if (typeof navigator !== 'undefined' && navigator.webdriver) return;

  function parseMs(raw, fallback) {
    if (raw == null || String(raw).trim() === '') return fallback;
    var m = String(raw).trim().match(/^(-?\d+(?:\.\d+)?)(ms|s)?$/i);
    if (!m) return fallback;
    var n = parseFloat(m[1]);
    if (!isFinite(n) || n < 0) return fallback;
    return m[2] && m[2].toLowerCase() === 's' ? Math.round(n * 1000) : Math.round(n);
  }

  function effectSpec(name) {
    var v = String(name || '').trim().toLowerCase().replace(/[\s_]+/g, '-');
    switch (v) {
      case 'appear':
        return { kf: [{ opacity: 0 }, { opacity: 1 }], durFallback: 1 };
      case 'fade':
      case 'fade-in':
        return { kf: [{ opacity: 0 }, { opacity: 1 }] };
      case 'fly-in-left':
      case 'fly-left':
        return { kf: [{ opacity: 0, transform: 'translateX(-120px)' }, { opacity: 1, transform: 'translateX(0)' }] };
      case 'fly-in-right':
      case 'fly-right':
        return { kf: [{ opacity: 0, transform: 'translateX(120px)' }, { opacity: 1, transform: 'translateX(0)' }] };
      case 'fly-in-top':
      case 'fly-top':
        return { kf: [{ opacity: 0, transform: 'translateY(-100px)' }, { opacity: 1, transform: 'translateY(0)' }] };
      case 'fly-in-bottom':
      case 'fly-bottom':
        return { kf: [{ opacity: 0, transform: 'translateY(100px)' }, { opacity: 1, transform: 'translateY(0)' }] };
      case 'zoom':
      case 'zoom-in':
        return { kf: [{ opacity: 0, transform: 'scale(0.2)' }, { opacity: 1, transform: 'scale(1)' }] };
      case 'spin':
        return { kf: [{ opacity: 0, transform: 'rotate(-360deg)' }, { opacity: 1, transform: 'rotate(0deg)' }] };
      case 'spin-quarter':
        return { kf: [{ opacity: 0, transform: 'rotate(-90deg)' }, { opacity: 1, transform: 'rotate(0deg)' }] };
      case 'spin-half':
        return { kf: [{ opacity: 0, transform: 'rotate(-180deg)' }, { opacity: 1, transform: 'rotate(0deg)' }] };
      case 'spin-double':
        return { kf: [{ opacity: 0, transform: 'rotate(-720deg)' }, { opacity: 1, transform: 'rotate(0deg)' }] };
      case 'wipe-left':
        return { kf: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }] };
      case 'wipe-right':
        return { kf: [{ clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0)' }] };
      case 'wipe-top':
        return { kf: [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }] };
      case 'wipe-bottom':
        return { kf: [{ clipPath: 'inset(100% 0 0 0)' }, { clipPath: 'inset(0 0 0 0)' }] };
      default:
        return null;
    }
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function waitClick() {
    return new Promise(function (resolve) {
      function once() {
        document.removeEventListener('click', once, true);
        resolve();
      }
      document.addEventListener('click', once, true);
    });
  }

  var nodes = Array.prototype.slice.call(document.querySelectorAll('[data-animation]'));
  if (!nodes.length) return;

  var items = [];
  for (var i = 0; i < nodes.length; i++) {
    var el = nodes[i];
    var spec = effectSpec(el.getAttribute('data-animation'));
    if (!spec) continue; // unmapped — leave visible static
    var dur = parseMs(el.getAttribute('data-animation-duration'), spec.durFallback != null ? spec.durFallback : 500);
    var delay = parseMs(el.getAttribute('data-animation-delay'), 0);
    var trig = (el.getAttribute('data-animation-trigger') || 'after').trim().toLowerCase();
    if (trig === 'onclick') trig = 'click';
    if (trig === 'withprevious') trig = 'with';
    if (trig === 'afterprevious') trig = 'after';
    items.push({ el: el, spec: spec, dur: dur, delay: delay, trig: trig });
  }
  if (!items.length) return;

  // Hide before first paint of preview sequence
  for (var j = 0; j < items.length; j++) {
    items[j].el.style.opacity = '0';
    items[j].el.style.visibility = 'hidden';
  }

  // Hint chip
  var hint = document.createElement('div');
  hint.textContent = '浏览器预览：点击页面播放声明式入场（转换时自动跳过）';
  hint.setAttribute('aria-hidden', 'true');
  hint.style.cssText = [
    'position:fixed', 'left:16px', 'bottom:16px', 'z-index:9999',
    'padding:8px 12px', 'border-radius:8px', 'font:12px/1.4 system-ui,sans-serif',
    'color:#0f172a', 'background:#fef08a', 'border:1px solid #eab308',
    'box-shadow:0 4px 14px rgba(15,23,42,.12)', 'pointer-events:none'
  ].join(';');
  document.body.appendChild(hint);

  function playOne(item) {
    return new Promise(function (resolve) {
      var el = item.el;
      el.style.visibility = 'visible';
      el.style.opacity = '1';
      var anim = el.animate(item.spec.kf, {
        duration: Math.max(item.dur, 1),
        delay: item.delay,
        easing: 'ease-out',
        fill: 'both'
      });
      anim.onfinish = function () { resolve(item.dur + item.delay); };
      anim.oncancel = function () { resolve(0); };
    });
  }

  async function run() {
    // First click-triggered group waits for a click; if none are click, auto-start after short pause
    var hasClick = items.some(function (it) { return it.trig === 'click'; });
    if (hasClick) {
      hint.textContent = '浏览器预览：点击任意处开始播放（模拟 PPT 单击触发）';
      await waitClick();
    } else {
      hint.textContent = '浏览器预览：自动连播声明式入场';
      await sleep(400);
    }

    var i = 0;
    while (i < items.length) {
      var lead = items[i];
      if (lead.trig === 'click' && i > 0) {
        hint.textContent = '浏览器预览：再次点击，播放下一组';
        await waitClick();
      }

      // Collect with-group: lead + following "with"
      var group = [lead];
      var k = i + 1;
      while (k < items.length && items[k].trig === 'with') {
        group.push(items[k]);
        k++;
      }

      var plays = group.map(function (it) { return playOne(it); });
      var durations = await Promise.all(plays);
      var maxDur = Math.max.apply(null, durations.concat([0]));

      i = k;
      // Following "after" items chain automatically (no extra click)
      while (i < items.length && items[i].trig === 'after') {
        // if previous was click/with and this is first after, it already means after previous group
        await playOne(items[i]);
        i++;
        // consecutive after continue
        while (i < items.length && items[i].trig === 'after') {
          await playOne(items[i]);
          i++;
        }
        break;
      }

      // If next is with without a new click lead — shouldn't happen; treat as after
      void maxDur;
    }

    hint.textContent = '浏览器预览结束 · 正式验收请看 out.pptx 放映';
    setTimeout(function () {
      if (hint.parentNode) hint.parentNode.removeChild(hint);
    }, 2600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { run(); });
  } else {
    run();
  }
})();
