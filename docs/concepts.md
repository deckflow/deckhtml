# Core Concepts

## Inputs and slides

DeckHTML accepts a local HTML file, HTML from stdin, one or more HTML files, or a URL. Multiple input files are converted in the order supplied. A single HTML document can also produce multiple slides when DeckHTML detects slide containers, or when you provide a slide selector through the programmatic API.

## Rendering before conversion

DeckHTML loads HTML in Chromium and inspects the rendered DOM rather than parsing source markup alone. This means computed layout, CSS, web fonts, and browser-rendered content inform the output. Give pages that load data or fonts asynchronously enough time to settle before conversion.

## Editable PPTX content

The local engine translates inspected content into PowerPoint objects where possible: text, shapes, tables, images, SVGs, canvas content, and math each have dedicated handling. Fidelity depends on the source HTML and on what PowerPoint can represent. Content that cannot be reconstructed exactly may be simplified or rasterized; review the generated deck, especially after using complex CSS or embedded content.

## Local versus cloud mode

`--mode auto` uses cloud execution when an API key is available and local execution otherwise. `--mode local` always uses the local engine and requires no authentication. `--mode cloud` can start as a rate-limited guest and is intended for cloud-only enhancements such as font embedding; sign in when prompted or when you need authenticated access.

## Output formats

- `pptx` is the default editable PowerPoint output.
- `png` writes rendered image frames.

Use `--report` to write a conversion report next to the output, and `--json` when scripts need a machine-readable result on stdout.

## Fonts

The output can only render fonts installed on the machine that opens the presentation unless they are embedded. Use cloud mode with `--embed-fonts` when matched font embedding is required. Font availability and license terms remain your responsibility.

## Animations and transitions

DeckHTML can inspect supported CSS and Anime.js entrance animations and write compatible PowerPoint animations. Slide transitions can be selected, cycled, randomized, or disabled. These features translate supported effects; they are not a guarantee that every browser animation has an equivalent in PowerPoint.

## Automation

The CLI is designed for generators, CI, and agent workflows. Feed generated HTML through stdin, use `--json` to parse results, and keep diagnostics on stderr separate from data on stdout.
