# Troubleshooting

## Conversion won't start

| Error / symptom | Fix |
| --- | --- |
| `playwright-core` / browser missing | `npx playwright install chromium` in the environment that runs local mode |
| `pptxgenjs` missing | Install peer dep next to `@deckflow/deckhtml` |
| `--output is required when reading HTML from stdin` | Pass `-o out.pptx` |
| Cloud-only flag with local mode | Drop flag or use `--mode cloud` + API key |
| `DECKHTML_API_KEY` / auth errors | Set env var or `deckhtml auth login`; confirm `deckhtml auth status` |
| Space ID missing (cloud) | Re-login so workspace context is stored |

## Wrong number of slides

| Symptom | Cause | Fix |
| --- | --- | --- |
| Always 1 slide | Hosts not matching probes or failing size gate | Use `.slide-container` at 1280×720 (or match `--width`) |
| Too many slides | Nested `.slide` inside wrappers double-counted | Prefer outer `.slide-wrap` / `.slide-container`; avoid nested same-class hosts |
| Missing middle slides | Stacked deck without detectable active class | Add `active` / `is-active` on the visible slide only |
| Multi-file order wrong | CLI arg order | Pass files in desired slide order |

## Blank or sparse slides

- Content lives outside the slide host → move it inside
- `opacity: 0` / `visibility: hidden` / `display: none` at capture time → set final state in DOM
- Isolation hid siblings incorrectly → ensure each slide is a self-contained host
- Animations not finished → content should not depend on mid-animation; stacked decks wait ~3s after isolation

## Animations not exported

| Symptom | Cause | Fix |
| --- | --- | --- |
| No animations at all in the PPTX | `--no-animations` passed, or no mappable animation found | Drop the flag; check `--report` diagnostics |
| `DECKHTML_ANIMATION_UNMAPPED` in report | Effect outside the native subset (infinite loop, compound motion+rotate, color/size keyframes, stagger, motion path) | Use a supported entrance effect; see [animations.md](animations.md) |
| anime.js animation missing | anime.js imported as ES module — interception only sees the `window.anime` / `window.animejs` globals | Use the UMD build, or declare with `data-animation` |
| CSS animation missing | `@keyframes` in a cross-origin stylesheet, or it is a `transition`, or infinite `iteration-count` | Inline the CSS; use a single-shot `animation`; declare explicitly |
| Animation plays but order/timing differs | Easing curves are dropped; captured animations default to `afterPrevious` in DOM order | Set `data-animation-trigger` or API `animations.defaultTrigger` |
| Strict mode fails on animation | `strict.allowUnmappedAnimations` defaults to `false` | Map to a supported effect, or set `allowUnmappedAnimations: true` |

## Layout / clipping

- Design width ≠ viewport → pass `--width` matching the CSS slide width
- Content overflows → `overflow: hidden` on slide; shrink layout
- Absolute children positioned vs wrong containing block → `position: relative` on slide host

## Fonts

- Fallback glyphs → load `@font-face` / Google Fonts; avoid unloaded custom families
- Chinese/Latin mix looks wrong → rely on script auto-detect; set `--platform` for target OS generics
- Need fonts inside PPTX file → `--mode cloud --embed-fonts`

## Charts / SVG / images

| Symptom | Fix |
| --- | --- |
| Chart is a flat bitmap | Expected in local mode; use `--mode cloud --rebuild-chart` for editable charts |
| SVG missing pieces | Simplify SVG; or cloud `--rebuild-svg` |
| Broken images | Check relative paths; network for remote URLs; local file access |
| Icon font shows as empty | Ensure icon font CSS loaded; or use inline SVG |

## Performance

- Huge DOM / many slides → split files or simplify
- Increase cloud wait: `--render-wait 9` for slow chart libs
- Local already waits for `networkidle` + fonts; avoid infinite network activity (polling) that blocks `networkidle`

## Debugging checklist

1. Open the HTML in a browser at the same viewport size
2. Confirm slide hosts match a probe selector and size gate
3. Re-run with `--verbose` (stderr) and `--report`
4. Inspect `slideCount` and `elements.byType` in the report
5. Fix HTML; re-convert (do not hand-edit PPTX unless necessary)
