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

## Effect catalog

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
| `random` | PowerPoint picks at **show time** (meta) |

Generation-time `random` (the default) picks a **concrete** effect from the catalog (excluding meta `random`) **independently for each slide**, so page turns stay varied. Directional variants (push/wipe/…) also get a random direction. Pass a named effect to apply the same transition everywhere.

## Speed

Via API object only: `speed: 'slow' | 'med' | 'fast'` (default `med`).

## Notes

- Transitions are written onto each slide’s XML (`p:transition`). PowerPoint plays the transition stored on the **destination** slide.
- Independent of `--no-animations` / `animations: false` (element entrances).
- Local mode only for now; cloud may ignore this option until the server adds support.
