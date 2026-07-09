# HTML authoring for DeckHTML

DeckHTML loads HTML in Playwright, inspects the DOM, and maps elements to PPTX shapes/text/images. Good HTML = high-fidelity editable slides.

**Starter file:** [../templates/basic-deck.html](../templates/basic-deck.html) — complete 4-slide deck (title, bullets, two-column cards, KPIs). Copy it when generating a deck from scratch.

## Viewport contract

- Default viewport: **1280×720** (16:9)
- Override with CLI `--width` (height scales automatically)
- Design each slide to that pixel size; do not rely on browser window scrolling as pagination

```css
.slide-container {
  width: 1280px;
  height: 720px;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
}
```

## Multi-slide detection

Auto-detect runs when there is no explicit `slideSelector` (CLI always auto-detects). Probe order (first rule with ≥2 size-qualified hosts wins):

1. `.slide-container`
2. `.slide-wrap`
3. `section[class*="slide"]`
4. `.slide`
5. `[data-slide]`
6. `section.slide`
7. top-level `section` (may include size-qualified siblings)

**Size gate** (relative to viewport):

- Height between 50% and 200% of viewport height
- Width at least 80% of viewport width

**Recommendation for agents generating HTML:** always use `.slide-container` (or `[data-slide]`) so detection is deterministic.

### Document order

Slide order = DOM order of qualified hosts (or CLI argument order for multi-file input).

### Stacked / active-gated decks

If all slide hosts are `position: absolute|fixed`, same parent, nearly identical size, and exactly one is visible via a toggle class, DeckHTML activates each slide in turn.

Preferred active class names: `active`, `is-active`, `current`, `show`, `visible`, `is-current`.

Nav chrome (`.slide-nav`, `.controls`, `.nav-dots`) is treated as non-content overlay when isolating slides.

## What converts well

| HTML | PPTX mapping |
| --- | --- |
| Text nodes, headings, spans | Editable text runs (color, weight, size) |
| Boxes with background / border / radius | Shapes |
| Linear/radial gradients | Gradient fills (enhancer) |
| `<table>` | Tables |
| `<img>`, icons | Pictures |
| `<svg>` | Decomposed shapes and/or raster hybrid |
| `<math>` MathML | OMML equations |
| `<canvas>` | Raster image of canvas pixels |

## What needs care

| Pattern | Guidance |
| --- | --- |
| Chart libraries (ECharts etc.) | Local = canvas screenshot; editable charts → cloud `--rebuild-chart` |
| Complex filters / blend modes | May rasterize via element screenshot |
| `background-image: url(...)` on shapes | Often screenshot; prefer `<img>` for photos |
| Hover / click-only content | Put final visual state in DOM before capture |
| `position: fixed` UI chrome | Keep outside slide hosts or it may be isolated away |
| Very small “slide” divs | Fail size gate → not detected as slides |
| Fluid `%` layouts without fixed slide box | Misaligned vs viewport |

## Fonts

- Load fonts before paint (`<link>` Google Fonts, `@font-face`)
- Local mode waits for `document.fonts.ready` (+ short settle)
- CSS generics (`sans-serif`, `serif`, …) map via `--platform` (win/mac/ios/android/linux)
- For embedded fonts in the PPTX file itself, use cloud `--embed-fonts`

## Assets

- Prefer relative paths next to the HTML file
- Local CLI sets `allowLocalResources: true` so `file://` subresources can load
- Remote images need network access at convert time

## Single-slide file

If there is only one slide host (or none matching probes), the whole page becomes one slide. That is valid for title-only decks.

## Multi-file decks

```bash
deckhtml 01-title.html 02-agenda.html 03-end.html -o deck.pptx --mode local
```

Each file → one or more slides (per that file’s detection), concatenated in argument order.

## Accessibility / semantics

Semantic tags help text extraction but are not required. Visible computed styles drive PPTX output more than ARIA.
