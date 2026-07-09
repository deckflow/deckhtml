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
  "report": "deck.pptx.report.json"
}
```

- `slideCount` / `report` appear when available / when `--report` was set
- Treat fields as stable enough for agents; do not require unknown fields

Stdin input is reported as `"-"`:

```json
{ "ok": true, "input": ["-"], "output": "out.pptx", "format": "pptx", "mode": "local" }
```

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
  "viewport": { "width": 1280, "height": 720 },
  "platform": "mac",
  "durationMs": 12345
}
```

Use the report to verify slide count and that expected element types were captured.

## Agent parsing recipe

```bash
RESULT=$(npx -y @deckflow/deckhtml@latest deck.html -o deck.pptx --mode local --json 2>/tmp/deckhtml.err)
echo "$RESULT" | jq -e '.ok == true'
OUT=$(echo "$RESULT" | jq -r '.output')
test -f "$OUT"
```
