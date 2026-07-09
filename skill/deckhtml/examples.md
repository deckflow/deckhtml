# Examples

## From the starter template

```bash
# From repo root — 4-slide deck using .slide-container @ 1280×720
npx -y @deckflow/deckhtml@latest \
  skill/deckhtml/templates/basic-deck.html \
  -o basic-deck.pptx --mode local --json --report
```

Copy and customize before converting:

```bash
cp skill/deckhtml/templates/basic-deck.html ./deck.html
# edit titles, cards, KPIs…
npx -y @deckflow/deckhtml@latest deck.html -o deck.pptx --mode local --json
```

## Local PPTX from one file

```bash
npx -y @deckflow/deckhtml@latest deck.html -o deck.pptx --mode local --json
```

## Multi-file deck

```bash
npx -y @deckflow/deckhtml@latest \
  slides/01-title.html \
  slides/02-content.html \
  slides/03-end.html \
  -o deck.pptx --mode local --json
```

## Stdin from a generator

```bash
python gen_deck.py | npx -y @deckflow/deckhtml@latest - -o deck.pptx --mode local --json
```

## Match a 1920-wide design

```bash
npx -y @deckflow/deckhtml@latest deck.html -o deck.pptx --mode local --width 1920 --json
```

## Target Windows font mapping

```bash
npx -y @deckflow/deckhtml@latest deck.html -o deck.pptx --mode local --platform win --json
```

## With conversion report

```bash
npx -y @deckflow/deckhtml@latest deck.html -o deck.pptx --mode local --report --json
# → deck.pptx and deck.pptx.report.json
```

## URL input (needs network)

```bash
npx -y @deckflow/deckhtml@latest https://example.com/deck.html -o deck.pptx --mode local --json
```

## Cloud reconstruction

```bash
export DECKHTML_API_KEY=your-key
npx -y @deckflow/deckhtml@latest deck.html -o deck.pptx --mode cloud \
  --rebuild-svg --rebuild-chart --embed-fonts --map-motion --json
```

## Cloud PNG frames

```bash
export DECKHTML_API_KEY=your-key
npx -y @deckflow/deckhtml@latest deck.html --format png -o frames --mode cloud --json
```

## From this repository (dev)

```bash
pnpm build
node dist/cli.js path/to/deck.html -o out.pptx --mode local --json
```

## Node API

```js
import { convertHtmlToPptx } from '@deckflow/deckhtml';
import { writeFileSync } from 'fs';

const { data, slideCount } = await convertHtmlToPptx({
  inputs: ['a.html', 'b.html'],
  viewportWidth: 1280,
  viewportHeight: 720,
  allowLocalResources: true,
  quiet: true,
});
writeFileSync('deck.pptx', data);
console.log('slides', slideCount);
```
