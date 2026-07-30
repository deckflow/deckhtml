# Slide transitions (slide-to-slide)

DeckHTML can emit **native PowerPoint slide transitions** (`p:transition`) when converting multi-slide HTML into PPTX. These are the effects that play when advancing from one slide to the next — **not** element entrance animations (`data-animation` / `p:timing`). See [animations.md](animations.md) for entrance effects.

## Defaults

| Setting | Behavior |
| --- | --- |
| (unset) | **Enabled**, each slide gets its **own** randomly chosen catalog effect |
| Named effect | Use that effect for every slide |
| Comma-separated names | Cycle through the list in order (wraps) |
| Disabled | No `p:transition` written |

## CLI

```bash
# Default: random slide transition per slide
deckhtml a.html b.html -o deck.pptx --mode local

# Single named effect (all slides)
deckhtml a.html b.html -o deck.pptx --mode local --slide-transition fade

# Cycle through multiple effects
deckhtml a.html b.html c.html d.html -o deck.pptx --mode local \
  --slide-transition fade,push,wipe
# → slide1 fade, slide2 push, slide3 wipe, slide4 fade, …

# Disable
deckhtml a.html b.html -o deck.pptx --mode local --no-slide-transitions
# or
deckhtml a.html b.html -o deck.pptx --mode local --slide-transition none
```

`--no-slide-transitions` wins over `--slide-transition`.

## Programmatic API

```js
import { convertHtmlToPptx, listSlideTransitionEffectNames } from '@deckflow/deckhtml';

await convertHtmlToPptx({
  inputs: ['a.html', 'b.html', 'c.html'],
  slideTransitions: 'fade,push,wipe', // cycle
  // slideTransitions: { effects: ['fade', 'push'] },
  // slideTransitions: 'wipe',         // fixed
  // slideTransitions: false,         // disabled
  // slideTransitions: true,          // random (default)
  // slideTransitions: { effect: 'push', speed: 'fast', seed: 42 },
});

console.log(listSlideTransitionEffectNames());
```

## Effect catalog (55 effects)

### Base tier — ISO/IEC 29500 (works in every OOXML renderer)

| Name | Description |
| --- | --- |
| `fade` | Fade into the next slide |
| `fade-through-black` | Fade through black |
| `push` | New slide pushes the previous off-screen |
| `wipe` | Wipe from one edge |
| `cover` | Cover from one direction |
| `pull` | Pull previous away to reveal next |
| `split` | Split open / close |
| `blinds` | Venetian blinds |
| `checker` | Checkerboard |
| `comb` | Comb / interlocking bars |
| `random-bar` | Random bars |
| `strips` | Diagonal strips |
| `wheel` | Clock-spoke wheel |
| `wedge` | Wedge / pie slice |
| `circle` | Circle shape |
| `diamond` | Diamond shape |
| `plus` | Plus shape |
| `newsflash` | Newsflash spin-zoom |
| `dissolve` | Pixel dissolve |
| `zoom` | Zoom in / out |
| `cut` | Hard cut |
| `none` | Explicit no-transition marker (never picked at random) |
| `random` | PowerPoint picks at **show time** (meta) |

### Extended tier — `p14` (PowerPoint 2010+)

Written as `mc:AlternateContent` with a base fallback, so older renderers still play a sensible effect.

| Name | Description | Base fallback |
| --- | --- | --- |
| `conveyor` | Conveyor belt | push |
| `doors` | Elevator doors open | split |
| `ferris` | Ferris wheel swing | push |
| `flash` | Bright flash blink | fade |
| `flip` | Flip like a card | push |
| `flythrough` | Swoop into / out of the screen | zoom |
| `gallery` | Rotate like a gallery wall | push |
| `glitter` | Sparkle (diamond / hexagon pieces) | dissolve |
| `honeycomb` | Hexagonal-cell tumble | dissolve |
| `pan` | Camera pan | push |
| `prism` | 3D prism rotation | push |
| `reveal` | Soft reveal from one side | fade |
| `ripple` | Water ripples (corners / center) | circle / fade |
| `shred` | Shred into strips / rectangles | blinds |
| `switch` | Slides swap with a spin | push |
| `vortex` | Swirl away toward one edge | fade |
| `warp` | Sci-fi warp in / out | zoom |
| `wheel-reverse` | Counter-clockwise wheel | wheel |
| `window` | Appear in a rotating window frame | split |

### Preset tier — `p15:prstTrans` (PowerPoint 2013+)

| Name | Description | Base fallback |
| --- | --- | --- |
| `fall-over` | Old slide tips over and falls | push |
| `drape` | New slide drapes over like cloth | cover |
| `curtains` | Theatre curtains part | split |
| `wind` | Old slide blown away | push |
| `prestige` | Old slide shatters and floats off | dissolve |
| `fracture` | Old slide cracks apart | fade |
| `crush` | Old slide crushed away | fade |
| `peel-off` | Peel off like a sticker | pull |
| `page-curl-single` | Single-corner page curl | pull |
| `page-curl-double` | Double-corner page curl | pull |
| `airplane` | Fold into a paper plane and fly off | push |
| `origami` | Fold away like paper | push |

### Morph tier — `p159` (PowerPoint 2019 / Microsoft 365)

| Name | Description | Base fallback |
| --- | --- | --- |
| `morph` | Animate shared objects smoothly between slides | fade |

`morph` is **excluded from the generation-time random pool** (together with `none` and meta `random`): it only looks right when consecutive slides share matching objects. Request it explicitly (`--slide-transition morph`) for decks authored with object continuity.

Generation-time `random` (the default) picks a **concrete** effect from the remaining catalog **independently for each slide**, so page turns stay varied. Directional variants (push/wipe/vortex/…) also get a random direction. Pass a named effect to apply the same transition everywhere.

## Speed

Via API object only: `speed: 'slow' | 'med' | 'fast'` (default `med`).

## Compatibility

| Renderer | Base tier | `p14` | `p15` presets | `p159` morph |
| --- | --- | --- | --- | --- |
| PowerPoint 2010+ | yes | yes | 2013+ | 2019 / M365 |
| LibreOffice Impress | yes | fallback | fallback | fallback |
| Keynote / Google Slides (import) | mostly | fallback | fallback | fallback |

Extended effects are wrapped in `mc:AlternateContent`; renderers that don't understand the extension namespace play the **base fallback** transition instead, so the deck always degrades gracefully.

## Notes

- Transitions are written onto each slide’s XML (`p:transition`). PowerPoint plays the transition stored on the **destination** slide.
- Independent of `--no-animations` / `animations: false` (element entrances).
- Local mode only for now; cloud may ignore this option until the server adds support.
