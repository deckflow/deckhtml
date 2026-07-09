---
name: deckhtml
description: >-
  Convert HTML decks to PPTX (also PDF/PNG via cloud) with DeckHTML CLI.
  Use when the user asks to turn HTML into PowerPoint/PPTX, generate slides from
  HTML, export a deck, or run deckhtml / @deckflow/deckhtml conversion.
---

# DeckHTML — HTML → PPTX

Convert HTML (file, stdin, URL, or multiple ordered files) into a PowerPoint deck using the DeckHTML CLI. Prefer **local mode** for agent workflows unless the user needs cloud-only features.

## When to use

- User wants HTML → PPTX / PowerPoint / slides
- Agent authored an HTML deck and must export it
- Need machine-readable conversion (`--json`) or a conversion report (`--report`)

## Quick start (agent default)

```bash
# No install required
npx -y @deckflow/deckhtml@latest deck.html -o deck.pptx --mode local --json

# Or if deckhtml is on PATH / this repo is built:
# node dist/cli.js deck.html -o deck.pptx --mode local --json
```

Success JSON (stdout):

```json
{ "ok": true, "input": ["deck.html"], "output": "deck.pptx", "format": "pptx", "mode": "local" }
```

Always pass `-o` for stdin. Prefer `--json` so you can parse the output path. Progress/errors go to **stderr**.

## Agent workflow

Copy and track:

```
Task Progress:
- [ ] 1. Author or locate HTML (follow slide conventions below)
- [ ] 2. Choose mode (local vs cloud)
- [ ] 3. Run conversion with --json
- [ ] 4. Verify output path exists; optionally --report
- [ ] 5. If fidelity issues → fix HTML (not the converter) and re-run
```

### 1. Author HTML for conversion

DeckHTML renders with Playwright at a fixed viewport (default **1280×720**, 16:9). Layout must match that viewport.

**Multi-slide in one file** — use hosts the auto-detector recognizes (first matching rule wins, need ≥2 qualified hosts):

| Preferred selector | Notes |
| --- | --- |
| `.slide-container` | Best default |
| `.slide-wrap` | Wrapper hosts |
| `section[class*="slide"]` / `.slide` / `section.slide` | Common patterns |
| `[data-slide]` | Explicit attribute |
| top-level `section` | Fallback; size-qualified |

Each slide host should be roughly viewport-sized: height ≈ 0.5–2× viewport height, width ≥ 0.8× viewport width.

**Stacked / SPA decks** (absolute/fixed siblings, one visible via class): supported when the active class is like `active`, `is-active`, `current`, `show`, `visible`, `is-current`.

**Multiple files** — one file per slide, order = slide order:

```bash
npx -y @deckflow/deckhtml@latest 01.html 02.html 03.html -o deck.pptx --mode local --json
```

**Authoring rules that improve fidelity**

- Fixed slide size (`width`/`height` or `aspect-ratio` matching viewport); avoid fluid document scroll as the “deck”
- Prefer real DOM text/shapes/tables/SVG over screenshots of everything
- Web fonts: load via `@font-face` / Google Fonts and wait (local waits for `document.fonts.ready`)
- Charts/canvas: local embeds rasterized canvas; for editable charts use `--mode cloud --rebuild-chart`
- Local images: relative paths work in local mode (`allowLocalResources`); keep assets next to the HTML
- Avoid relying on hover-only state; ensure the visible slide state is in the DOM at capture time

**Start from the full template** (title / bullets / two-column / KPIs):

- [templates/basic-deck.html](templates/basic-deck.html) — copy, replace copy, then convert

```bash
cp skill/deckhtml/templates/basic-deck.html ./deck.html
# edit deck.html …
npx -y @deckflow/deckhtml@latest deck.html -o deck.pptx --mode local --json
```

More HTML rules: [references/html-authoring.md](references/html-authoring.md)

### 2. Choose execution mode

| Mode | When | Auth |
| --- | --- | --- |
| `local` (default for agents) | PPTX only; no API key | None |
| `cloud` | PDF/PNG, or `--rebuild-svg` / `--rebuild-chart` / `--embed-fonts` / `--map-motion` | `DECKHTML_API_KEY` or `deckhtml auth login` |
| `auto` | Cloud if key present, else local | Optional |

Local cannot emit PDF/PNG. Cloud-only flags are invalid with `--mode local`.

### 3. Run conversion

```bash
# Local PPTX (recommended)
npx -y @deckflow/deckhtml@latest input.html -o out.pptx --mode local --json

# Custom viewport width (height scales 16:9)
npx -y @deckflow/deckhtml@latest input.html -o out.pptx --mode local --width 1920 --json

# Font mapping target OS (generic CSS fonts → platform fonts)
npx -y @deckflow/deckhtml@latest input.html -o out.pptx --mode local --platform win --json

# Cloud with reconstruction
export DECKHTML_API_KEY=...
npx -y @deckflow/deckhtml@latest input.html -o out.pptx --mode cloud \
  --rebuild-svg --rebuild-chart --embed-fonts --json

# Stdin
cat deck.html | npx -y @deckflow/deckhtml@latest - -o out.pptx --mode local --json
```

Full CLI: [references/cli.md](references/cli.md)

### 4. Verify

- Exit code `0` and JSON `"ok": true`
- Output file exists at `.output`
- Optional: `--report` → `<output>.report.json` (slideCount, element/font stats)

### 5. Fix fidelity issues

Prefer fixing **HTML structure/CSS** over hacking the converter:

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Only 1 slide | Hosts not detected / too small | Use `.slide-container`; match viewport size |
| Empty / blank slide | Content outside host; stacked slide not activated | Put content inside host; ensure active class |
| Wrong fonts | Generic stack / missing @font-face | Explicit font-family; `--platform`; cloud `--embed-fonts` |
| Chart looks flat | Canvas raster only | Cloud `--rebuild-chart` |
| Clipped content | Overflow / wrong viewport | Match `--width` to design width; `overflow:hidden` on slide |

Troubleshooting: [references/troubleshooting.md](references/troubleshooting.md)

## Programmatic API (Node)

```js
import { convertHtmlToPptx } from '@deckflow/deckhtml';
import { writeFileSync } from 'fs';

const result = await convertHtmlToPptx({
  input: 'deck.html',           // or inputs: ['a.html', 'b.html']
  viewportWidth: 1280,
  viewportHeight: 720,
  allowLocalResources: true,
  platform: 'win',              // optional
  quiet: true,
});
writeFileSync('deck.pptx', result.data);
```

Requires peer deps: `playwright`, `pptxgenjs`. Local API is PPTX-only.

## Do / Don't

- **Do** use `--mode local --json` for agent loops
- **Do** size slides to the viewport and use detectable slide hosts
- **Do** re-convert after HTML fixes rather than editing PPTX XML
- **Don't** use cloud-only flags without `--mode cloud` + API key
- **Don't** expect local mode to output PDF/PNG
- **Don't** put critical content only in CSS `::before`/`hover` without a DOM fallback

## Additional resources

- [templates/basic-deck.html](templates/basic-deck.html) — full starter deck (4 slides)
- [examples.md](examples.md) — copy-paste command recipes
- [references/cli.md](references/cli.md) — flags, modes, auth
- [references/html-authoring.md](references/html-authoring.md) — slide HTML conventions
- [references/output-contract.md](references/output-contract.md) — JSON / report / exit codes
- [references/troubleshooting.md](references/troubleshooting.md) — common failures
