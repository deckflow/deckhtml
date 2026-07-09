# Output contract

## Streams

| Stream | Content |
| --- | --- |
| stdout | Final path (default) or JSON (`--json`) |
| stderr | Progress, verbose logs, errors |

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Success |
| `1` | Runtime / conversion error |
| `2` | Usage error |
| `3` | Auth error |

## Success JSON (`--json`)

Representative envelope:

```json
{
  "ok": true,
  "input": ["index.html"],
  "output": "deck.pptx",
  "format": "pptx",
  "mode": "local",
  "slideCount": 3,
  "simplified": {
    "total": 2,
    "byMethod": { "canvas-export": 1, "screenshot": 1 },
    "byReason": { "chart-canvas": 1, "svg-flowchart": 1 },
    "slides": [{ "index": 0, "total": 2, "byReason": { "chart-canvas": 1, "svg-flowchart": 1 } }],
    "items": []
  },
  "report": "deck.pptx.report.json"
}
```

- `slideCount` / `simplified` / `report` appear when available / when `--report` was set
- Treat fields as stable enough for agents; do not require unknown fields

Stdin input is reported as `"-"`:

```json
{ "ok": true, "input": ["-"], "output": "out.pptx", "format": "pptx", "mode": "local" }
```

### Simplified output (local mode, no `--report`)

When local conversion rasterizes elements, `simplified` is included in `--json` stdout and a summary is printed to **stderr** (unless `--quiet`):

```
Rasterized 2 element(s) (simplified conversion):
  canvas chart: 1
  SVG flowchart (Mermaid, etc.): 1

Tip: Use --mode cloud --rebuild-chart --rebuild-svg for editable charts and SVG instead of rasterized images.
```

With `--json`, the same `simplified` object appears in the success envelope; the cloud tip still goes to stderr.

## Error JSON

When `--json` is set, errors are still primarily on stderr as JSON-like payloads:

```json
{
  "ok": false,
  "error": {
    "code": "usage_error",
    "message": "--quiet conflicts with --verbose"
  }
}
```

Common codes: `usage_error`, `auth_error`, `render_error`, `conversion_error`.

## Conversion report (`--report`)

Writes `<output-path>.report.json` next to the artifact.

Shape (version 1):

```json
{
  "version": 1,
  "generatedAt": "ISO-8601",
  "input": ["index.html"],
  "output": "deck.pptx",
  "format": "pptx",
  "mode": "local",
  "slideCount": 3,
  "elements": {
    "total": 42,
    "byType": { "text": 20, "shape": 10, "image": 5 },
    "slides": [{ "index": 0, "total": 12, "byType": { "text": 8 } }]
  },
  "fonts": {
    "families": ["Arial", "Microsoft YaHei"],
    "variants": [{ "fontFamily": "Arial", "bold": true }]
  },
  "simplified": {
    "total": 3,
    "byMethod": { "canvas-export": 1, "svg-serialize": 1, "screenshot": 1 },
    "byReason": { "chart-canvas": 1, "svg-diagram": 1, "svg-flowchart": 1 },
    "slides": [{ "index": 0, "total": 3, "byReason": { "chart-canvas": 1, "svg-diagram": 1, "svg-flowchart": 1 } }],
    "items": [
      {
        "slide": 0,
        "type": "canvas",
        "tag": "canvas",
        "method": "canvas-export",
        "reason": "chart-canvas",
        "x": 100,
        "y": 200,
        "width": 400,
        "height": 300
      }
    ]
  },
  "viewport": { "width": 1280, "height": 720 },
  "platform": "mac",
  "durationMs": 12345
}
```

Use the report to verify slide count, that expected element types were captured, and which elements were rasterized (charts, SVG flowcharts, complex gradients, etc.) instead of native PPTX conversion.

### `simplified` section

Records elements handled via rasterization / screenshot fallback:

| `reason` | Meaning |
| --- | --- |
| `chart-canvas` | `<canvas>` exported via `toDataURL` (ECharts, etc.) |
| `svg-diagram` | Inline SVG serialized as image |
| `svg-flowchart` | SVG with `foreignObject` (Mermaid, etc.) — Playwright screenshot |
| `gradient-layered` | Multi-layer gradient with non-default `background-size` |
| `gradient-tiled-radial` | Tiled radial gradient pattern |
| `gradient-hard-stop` | Gradient with adjacent hard color stops |
| `background-url` | `background-image: url(...)` on a shape |
| `page-background` | Full-slide `<body>` background rasterized |
| `math-fallback` | MathML→OMML failed, screenshot used |

## Agent parsing recipe

```bash
RESULT=$(npx -y @deckflow/deckhtml@latest deck.html -o deck.pptx --mode local --json 2>/tmp/deckhtml.err)
echo "$RESULT" | jq -e '.ok == true'
OUT=$(echo "$RESULT" | jq -r '.output')
test -f "$OUT"
```
