# Architecture

DeckHTML is a TypeScript engine that renders HTML in Chromium, inspects the rendered result, and builds PowerPoint output with PptxGenJS and OOXML enhancements.

```text
HTML file / stdin / URL
        |
        v
HTMLLoader (Chromium / Playwright)
        |
        v
ElementInspector (DOM, computed styles, slide discovery)
        |
        v
ElementConverter + PPTXGenerator
        |
        v
PptxGenJS + OOXML enhancers
        |
        v
PPTX buffer or PNG frames
```

## Main components

- **CLI (`src/cli/`)** — parses commands, resolves inputs and execution mode, writes files, and formats human-readable or JSON results.
- **Loader (`src/loader.ts`)** — launches or connects to Chromium, loads input safely, and prepares pages for inspection.
- **Inspector (`src/inspector.ts`)** — discovers slides, collects bounding boxes and computed styles, extracts text and element metadata, and captures supported animation data.
- **Converter (`src/converter.ts`)** — maps inspected element types and CSS-derived properties to PowerPoint text, shapes, tables, media, and images.
- **Generator (`src/generator.ts`)** — assembles slides with PptxGenJS, applies animation and transition plans, and serializes the presentation.
- **Enhancers (`src/enhancer/`)** — apply targeted OOXML changes that go beyond PptxGenJS defaults, such as image sizing and table-cell margins.
- **Cloud SDK integration (`@deckflow/decktools-sdk`)** — handles authenticated cloud conversion and cloud-only capabilities exposed by the CLI.

## Conversion flow

1. The CLI resolves one or more input sources and chooses local or cloud execution.
2. Local conversion loads each document in Chromium and determines the viewport.
3. The inspector detects slide containers, isolates each slide, and creates `ElementInfo` records from rendered elements.
4. The converter turns those records into PowerPoint objects while normalizing coordinates, typography, fills, borders, and media.
5. The generator creates the PPTX, then applies supported animations, slide transitions, and OOXML enhancements.
6. The CLI atomically writes the requested PPTX or PNG output and may create a conversion report.

## Extending the engine

When adding support for a new element or CSS feature, keep the layers separate: collect stable rendered metadata in the inspector, translate it in the converter, then add any necessary OOXML post-processing in an enhancer. Add focused fixtures or tests for both inspection and generated presentation behavior.

## Boundaries

DeckHTML targets high-fidelity, editable presentation output, but HTML/CSS and PowerPoint are different rendering systems. Browser-only behavior, arbitrary JavaScript, unsupported CSS, and cross-origin content can require simplification. Treat generated presentations as an editable starting point and validate important decks in PowerPoint.
