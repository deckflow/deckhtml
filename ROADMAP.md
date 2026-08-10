# Roadmap

This roadmap communicates direction, not a delivery contract. Priorities can change based on user feedback, browser and PowerPoint compatibility, and maintainer capacity.

## Near term

- Improve HTML/CSS-to-PowerPoint fidelity for common layouts, typography, tables, and media.
- Add reproducible fixtures and regression coverage for multi-slide documents, animations, transitions, and embedded content.
- Make conversion diagnostics and reports more actionable for CI and agent workflows.
- Keep CLI and API documentation aligned with released behavior.

## In exploration

- Broader reconstruction of complex SVG and chart content.
- More animation mappings between browser and PowerPoint models.
- Better font portability and embedding workflows.
- Additional examples and reference templates for real-world decks.

## Out of scope

DeckHTML is not intended to be a general-purpose browser replacement or a promise of pixel-perfect conversion for every webpage. When HTML/CSS and PowerPoint lack equivalent features, the project favors a reliable, editable presentation where feasible.

## Participate

Please open an issue with a minimal HTML reproduction, expected output, and generated file when reporting a conversion gap. Clear reproductions help prioritize work and prevent regressions.
