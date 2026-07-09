# Prompt: Convert HTML to PPTX

Use this when an agent should produce a PowerPoint file from HTML.

## Instructions

1. Read the `deckhtml` skill (`SKILL.md`) if available.
2. If creating a deck from scratch, copy `templates/basic-deck.html` and replace the copy/layout.
3. Ensure the HTML follows DeckHTML slide conventions:
   - Viewport-sized slides (default 1280×720)
   - Multi-slide hosts use `.slide-container` (or another documented probe selector)
   - Critical content is in the DOM (not hover-only)
4. Convert with local mode unless the user needs cloud features:

```bash
npx -y @deckflow/deckhtml@latest <input.html> -o <output.pptx> --mode local --json
```

5. Confirm exit code 0, JSON `"ok": true`, and that the output file exists.
6. If slide count or layout is wrong, fix the HTML (hosts, size, active class) and re-run. Do not hand-edit the PPTX.

## Optional

- `--report` for element/font stats
- `--width <px>` when the design is not 1280 wide
- `--platform win|mac|...` for generic font mapping
- Cloud: `DECKHTML_API_KEY` + `--mode cloud` + reconstruction flags
