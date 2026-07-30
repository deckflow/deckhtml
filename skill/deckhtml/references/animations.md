# Animations (local mode)

DeckHTML exports element entrance animations into the PPTX as **native PowerPoint animations** (`p:timing`), playable in the slideshow. Animations are captured from declared attributes, CSS `@keyframes`, class-gated entrance transitions, and anime.js, then normalized onto a cross-player stable subset.

This document covers **element** animations only. For **slide-to-slide** transitions (`p:transition`), see [slide-transitions.md](slide-transitions.md).

- Anything that maps → real PPTX animation (PowerPoint / WPS / Keynote / Google Slides re-import all play it)
- Anything that does not map → element keeps its frozen end-state (same as before), plus a `DECKHTML_ANIMATION_UNMAPPED` warning in diagnostics / `--report`
- `--no-animations` disables the whole pipeline (previous behavior: everything frozen)

## 1. Declared animations (recommended)

The reliable, explicit way. Works on any element:

```html
<h2 data-element-id="title"
    data-animation="fly-in-left"
    data-animation-duration="600"
    data-animation-delay="0"
    data-animation-trigger="click">Quarterly results</h2>
```

| Attribute | Values | Default |
| --- | --- | --- |
| `data-animation` | effect name (table below) | — (required) |
| `data-animation-duration` | ms number, `600ms`, or `0.6s` | `500` |
| `data-animation-delay` | same time syntax | `0` |
| `data-animation-trigger` | `click`, `with`, `after` | `after` (or `animations.defaultTrigger`) |

Supported effect names:

| Name | PowerPoint effect |
| --- | --- |
| `appear` | Appear |
| `fade-in` (alias `fade`) | Fade |
| `fly-in-left` / `fly-in-right` / `fly-in-top` / `fly-in-bottom` | Fly In from that side |
| `zoom-in` (alias `zoom`) | Zoom (object center) |
| `spin`, `spin-quarter` (90°), `spin-half` (180°), `spin-double` (720°) | Spin |
| `wipe-left` / `wipe-right` / `wipe-top` / `wipe-bottom` | Wipe |

Unknown names and `*-out` (exit) effects are reported as unmapped.

## 2. CSS animations & entrance transitions

Single-shot `@keyframes` entrance animations are inferred automatically — no markup changes needed:

```css
.card { animation: flyIn 800ms ease-out 200ms both; }
@keyframes flyIn {
  from { opacity: 0; transform: translateX(-240px); }
  to   { opacity: 1; transform: translateX(0); }
}
```

Class-gated **entrance transitions** on `opacity` / `transform` are also captured. DeckHTML replays enter classes such as `is-entered`, `entered`, `revealed`, `in-view` (not deck-nav classes like `active` / `show`) and diffs start vs end motion:

```css
[data-enter] {
  opacity: 0;
  transform: translateY(16px);
  transition: opacity 520ms, transform 520ms;
}
.slide-page.is-entered [data-enter] {
  opacity: 1;
  transform: translateY(0);
}
```

What maps:

| First → last frame pattern | Exported as |
| --- | --- |
| `opacity: 0` → visible | Fade |
| net `translateX/Y` motion | Fly In (direction from the motion vector) |
| `scale` growing to 1 | Zoom |
| `rotate` changing | Spin (angle preserved, sign = direction) |
| fade + single-axis motion together | Fade + Fly In in parallel |

What does **not** map (unmapped diagnostic, frozen end-state):

- `animation-iteration-count: infinite` (looping/pulse — emphasis effects are not supported yet)
- compound motion+scale, motion+rotate, or scale+rotate in one keyframe set
- keyframes / transitions touching properties outside `opacity`/`transform` (color, size, filters, …)
- multi-step keyframes whose intermediate steps matter (only first/last frames are read)
- hover / focus transitions and other non-enter class gates
- transitions that do not change when enter classes are toggled

Easing curves are dropped; PPTX plays the default linear timing of each effect.

## 3. anime.js

Calls made through the **global** builds are intercepted and mapped with the same rules:

```html
<script src="anime.min.js"></script>
<script>
  anime({ targets: '.card', opacity: [0, 1], translateX: [-260, 0], duration: 800 });
</script>
```

- v3 UMD (`window.anime`) and v4 UMD namespace (`window.animejs`) are both wrapped
- `animate(targets, params)`, v3 `anime({targets, ...})`, and `timeline().add(...)` are recorded
- Plain-object (non-DOM) targets are ignored
- `stagger(...)` delays, motion paths, spring easings and compound motion+rotate calls are unmapped

**Limitation**: pages that `import` anime.js as an ES module never touch the window globals, so interception cannot see them. Use `data-animation` declarations in that case.

## Trigger model

PPTX plays animations inside one main sequence per slide:

| Trigger | Behavior |
| --- | --- |
| `click` | waits for a mouse click, then plays |
| `with` | plays together with the previous animation |
| `after` | plays after the previous animation finishes (delays accumulate in DOM order) |

Captured (CSS / anime.js) animations default to `afterPrevious` — replaying the auto-play feel of the HTML page in DOM order. Change the default via the API: `animations: { defaultTrigger: 'onClick' }`.

## Diagnostics & strict mode

```json
{
  "rule_id": "DECKHTML_ANIMATION_UNMAPPED",
  "severity": "warning",
  "element_id": "hero-card",
  "message": "Animation from css is outside the native PPTX entrance subset: infinite-loop animations map to emphasis effects, which are not supported yet …"
}
```

In strict mode unmapped animations are a **hard failure** by default; relax with `strict: { allowUnmappedAnimations: true }`.

## API

```js
const result = await convertHtmlToPptx({
  input: 'deck.html',
  animations: true,                          // default; false disables
  // animations: { defaultTrigger: 'onClick' },
});
// result.diagnostics includes DECKHTML_ANIMATION_UNMAPPED entries
```

CLI: `--no-animations` to opt out. Cloud mode is unaffected (cloud animation mapping is a separate pipeline).
