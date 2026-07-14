# Output Modes

> Pick the right DeckHTML CLI output mode for your workflow. Defaults to a human-readable final result; supports machine-readable JSON for scripts, CI, and agent workflows.

DeckHTML keeps command results and diagnostics separate. Final results go to stdout. Progress, warnings, verbose logs, and errors go to stderr.

Supported inputs are stdin (`-`), one HTML file, multiple ordered HTML files, or a URL. Authentication is optional for local mode and required only for cloud execution or cloud-only enhancement flags.

## Default: Human-Readable Result

By default, DeckHTML prints the final result on stdout.

```bash
deckhtml index.html -o deck.pptx
```

```text
deck.pptx
```

The default success output is the generated artifact path. Progress, if shown, is written to stderr so stdout remains easy to capture.

```bash
deckhtml index.html
```

```text
index.pptx
```

Choose another format with `--format`:

```bash
deckhtml report.html --format png -o frames
```

```text
frames
```

For PNG output, use a file, stdin, URL, or multiple ordered HTML files:

```bash
deckhtml slide-1.html slide-2.html --format png -o frames
```

```text
frames
```

URL input behaves the same way:

```bash
deckhtml https://example.com/deck.html -o deck.pptx
```

```text
deck.pptx
```

## `--json`: Machine-Readable Output

Add `--json` when another program needs to parse the result.

```bash
deckhtml index.html -o deck.pptx --json
```

```json
{
  "ok": true,
  "input": ["index.html"],
  "output": "deck.pptx",
  "format": "pptx",
  "mode": "local"
}
```

With `--json`, stdout contains only JSON. Logs and diagnostics stay on stderr.

The exact JSON fields can evolve; treat the examples here as representative of the CLI result envelope, not as a formal schema.

Example stdout:

```json
{
  "ok": true,
  "input": ["index.html"],
  "output": "deck.pptx",
  "format": "pptx",
  "mode": "local"
}
```

Example stderr when progress is enabled:

```text
Rendering index.html
Writing deck.pptx
```

For stdin, the input is reported as `-`:

```bash
cat index.html | deckhtml - -o deck.pptx --json
```

```json
{
  "ok": true,
  "input": ["-"],
  "output": "deck.pptx",
  "format": "pptx",
  "mode": "local"
}
```

## Quiet and Verbose Modes

Use `--quiet` to suppress progress and non-essential messages:

```bash
deckhtml index.html -o deck.pptx --quiet
```

Example stdout:

```text
deck.pptx
```

Example stderr: no output.


Use `-v` or `--verbose` to write detailed logs to stderr:

```bash
deckhtml index.html -o deck.pptx --verbose
```

Example stdout:

```text
deck.pptx
```

Example stderr:

```text
Mode: local
Input: index.html
Format: pptx
Output: deck.pptx
Rendering index.html
Writing deck.pptx
Done
```

`--quiet` and `--verbose` conflict:

```bash
deckhtml index.html --quiet --verbose
```

Representative stderr:

```text
Error: --quiet conflicts with --verbose
```

Representative JSON stderr when `--json` is also present:

```json
{
  "ok": false,
  "error": {
    "code": "usage_error",
    "message": "--quiet conflicts with --verbose"
  }
}
```

## Errors

Errors are written to stderr.

```json
{
  "error": {
    "code": "usage_error",
    "message": "--quiet conflicts with --verbose"
  }
}
```

Common error categories:

| Code | Meaning |
| --- | --- |
| `usage_error` | Invalid flags, missing input, bad mode, or conflicting flags. |
| `auth_error` | Cloud mode requires an API key but none is configured, or the key is invalid. |
| `render_error` | The page could not be loaded or rendered. |
| `conversion_error` | Conversion failed after rendering. |

The error examples are representative. Scripts should rely on exit codes first, then parse JSON errors when `--json` is used.

## Exit Codes

| Code | Meaning |
| --- | --- |
| `0` | Success. |
| `1` | General conversion or runtime error. |
| `2` | Usage error. |
| `3` | Authentication error. |

## Configuring Output Defaults

DeckHTML defines `--json`, `--quiet`, and `--verbose` as invocation flags. Persistent config covers API key, PPTX size, webhook, and retention hours:

```bash
deckhtml config set api-key <key>
deckhtml config set size 1920x1080
deckhtml config set webhook https://example.com/webhooks/deckhtml
deckhtml config set retention-hours 3
```

For CI, Docker, and agent environments, `DECKHTML_API_KEY` takes precedence over stored credentials:

```bash
export DECKHTML_API_KEY=your-api-key
```

## Stdout vs Stderr

DeckHTML separates data from diagnostics:

| Stream | Content |
| --- | --- |
| stdout | Final output path or JSON result. |
| stderr | Progress, warnings, verbose logs, and errors. |

This keeps pipelines clean:

```bash
OUTPUT=$(deckhtml index.html -o deck.pptx --json | jq -r '.output')
```
