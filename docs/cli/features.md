# Features

> Configure the DeckHTML CLI with shared flags for output format, execution mode, render timing, reports, logging, and cloud conversion context.

DeckHTML converts HTML from files, stdin, or hosted URLs into PPTX, PDF, or PNG artifacts. Local conversion works without authentication; cloud execution and cloud-only enhancement flags require an API key.

Run DeckHTML without installing:

```bash
npx -y @deckflow/deckhtml@latest index.html -o deck.pptx
```

Install globally when you want the `deckhtml` command available on your PATH:

```bash
npm install -g @deckflow/deckhtml
```

## Common Flags

These flags are supported by the primary conversion command.

| Flag | Description | Default |
| --- | --- | --- |
| `-o, --output <path>` | Output path. | Same name and path as input when possible. |
| `--format <format>` | Output format: `pptx`, `pdf`, or `png`. | `pptx` |
| `--mode <mode>` | Execution mode: `auto`, `local`, or `cloud`. | `auto` |
| `--render-wait <seconds>` | Wait before capturing each page. | `3` |
| `--report` | Generate a conversion report next to the output. | Off |
| `--json` | Print machine-readable JSON on stdout only. | `false` |
| `--quiet` | Only output errors and final result. | `false` |
| `-v, --verbose` | Write detailed logs to stderr. | `false` |
| `--webhook <url>` | Callback URL for cloud conversion events. | Config |
| `--retention-hours <n>` | Cloud file retention time in hours. | Config |

`--quiet` and `--verbose` conflict.

***

## Input Sources

DeckHTML accepts stdin, one local HTML file, multiple ordered local HTML files, or a URL through the same command:

```bash
deckhtml <input> [flags]
```

```bash
cat index.html | deckhtml - -o deck.pptx
deckhtml index.html
deckhtml page1.html page2.html page3.html -o deck.pptx
deckhtml https://example.com/deck.html -o deck.pptx
```

For stdin, pass `--output` because there is no source filename to derive the output path from. For multiple input files, DeckHTML preserves the order passed on the command line.

***

## Execution Modes

DeckHTML can run locally or in DeckHTML Cloud. Authentication is optional for local mode and required only for cloud execution or cloud-only enhancement flags.

| Mode | Behavior |
| --- | --- |
| `auto` | Use cloud when an API key exists; otherwise use local conversion. |
| `local` | Force local conversion. |
| `cloud` | Force cloud conversion and require an API key. |

```bash
deckhtml index.html --mode auto
deckhtml index.html --mode local
deckhtml index.html --mode cloud
```

Set cloud credentials with `deckhtml config set api-key <key>` or the `DECKHTML_API_KEY` environment variable. The environment variable is useful for CI, Docker, and agent workflows.

***

## Cloud-Only Enhancements

The following flags are only available in cloud mode:

| Flag | Description | Default |
| --- | --- | --- |
| `--rebuild-svg` | Rebuild SVG objects during conversion. | Off |
| `--rebuild-chart` | Rebuild chart objects during conversion. | Off |
| `--embed-fonts` | Embed fonts into the output. | Off |
| `--map-motion` | Map animations into the output. | Off |

```bash
deckhtml index.html \
  -o deck.pptx \
  --mode cloud \
  --rebuild-svg \
  --rebuild-chart \
  --embed-fonts \
  --map-motion
```

***

## Render Timing

`--render-wait <seconds>` controls how long DeckHTML waits before capturing each page.

```bash
deckhtml index.html --render-wait 9 -o deck.pptx
```

Use it when the page needs time to load fonts, charts, client-side data, or animation state.

***

## Reports

`--report` writes a conversion report next to the output path:

```bash
deckhtml index.html -o deck.pptx --report
```

Reports are intended for conversion review and automation diagnostics. Use `--json` when scripts need the final conversion result on stdout without progress text.

***

## Stdin Support

Use `-` to read HTML from stdin:

```bash
cat index.html | deckhtml - -o deck.pptx
```

This is useful in generators, CI pipelines, and agent workflows where HTML is produced by another process.

***

## Error Handling

Errors are written to stderr. With `--json`, stdout remains machine-readable and should not contain progress text or diagnostics. Use `--quiet` to reduce nonessential output, or `--verbose` to write detailed logs to stderr when troubleshooting. `--quiet` and `--verbose` cannot be used together.

```json
{
  "error": {
    "code": "usage_error",
    "message": "--quiet conflicts with --verbose"
  }
}
```

***

## Configuration

Persistent settings are managed with `deckhtml config set`:

```bash
deckhtml config set api-key <key>
deckhtml config set size 1920x1080
deckhtml config set webhook https://example.com/webhooks/deckhtml
deckhtml config set retention-hours 3
```

| Key | Description | Default |
| --- | --- | --- |
| `api-key` | API key for cloud requests. | None |
| `size` | PPTX dimensions. | `1920x1080` |
| `webhook` | Default callback URL. | None |
| `retention-hours` | Cloud file retention time in hours. | `3` |

For cloud credentials, `DECKHTML_API_KEY` can be set in the environment instead of storing a key locally.
