# DeckHTML

**Languages:** **English** · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Español](./README.es.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md)

Convert HTML files, stdin, or URLs into PPTX, PDF, or PNG presentations from your terminal.

## Quick Start

Run without installing:

```bash
npx -y @deckflow/deckhtml@latest index.html -o deck.pptx
```

## Installation

```bash
npm install -g @deckflow/deckhtml
deckhtml --version
```

## Convert HTML

Convert a single HTML file (output defaults to the same path and base name):

```bash
deckhtml index.html
# → index.pptx
```

Specify an output path:

```bash
deckhtml index.html -o deck.pptx
```

Pipe HTML from stdin:

```bash
cat index.html | deckhtml - -o deck.pptx
```

Convert multiple HTML files in order:

```bash
deckhtml page1.html page2.html page3.html -o deck.pptx
```

Convert a hosted page:

```bash
deckhtml https://example.com/deck.html -o deck.pptx
```

## Output Formats

| Format | Description |
| --- | --- |
| `pptx` | PowerPoint deck output (default) |
| `pdf` | PDF export |
| `png` | PNG frame output |

```bash
deckhtml index.html --format pdf -o deck.pdf
deckhtml index.html --format png -o frames
```

## Execution Modes

| Mode | Description |
| --- | --- |
| `auto` | Use cloud when an API key is configured; otherwise run locally |
| `local` | Always run locally (no API key required) |
| `cloud` | Always run in the cloud (API key required) |

```bash
deckhtml index.html --mode local
deckhtml index.html --mode cloud -o deck.pptx
```

### Cloud-Only Enhancements

These flags require cloud mode:

| Flag | Description |
| --- | --- |
| `--rebuild-svg` | Rebuild SVG objects |
| `--rebuild-chart` | Rebuild chart objects |
| `--embed-fonts` | Embed fonts into the output |
| `--map-motion` | Map animations into the output |

```bash
deckhtml index.html \
  -o deck.pptx \
  --mode cloud \
  --rebuild-svg \
  --rebuild-chart \
  --embed-fonts \
  --map-motion
```

## Authentication & Config

Authentication is only required for cloud execution and cloud-only flags. Local conversion works without an API key.

```bash
deckhtml auth login
deckhtml auth status
deckhtml config set api-key <key>
```

For CI, Docker, or agent environments, set the environment variable (takes precedence over stored credentials):

```bash
export DECKHTML_API_KEY=your-api-key
```

Persistent settings:

| Command | Description | Default |
| --- | --- | --- |
| `deckhtml config set api-key <key>` | API key for cloud requests | — |
| `deckhtml config set size <size>` | PPTX dimensions | `1920x1080` |
| `deckhtml config set webhook <url>` | Default callback URL | — |
| `deckhtml config set retention-hours <n>` | Cloud file retention (hours) | `3` |

Credentials are stored locally at `~/.deckflow/credentials`.

## CLI Reference

### Conversion Flags

| Flag | Description | Default |
| --- | --- | --- |
| `-h, --help` | Show help | — |
| `--version` | Show version | — |
| `-o, --output <path>` | Output path | Same base name as input |
| `-v, --verbose` | Detailed logs to stderr | `false` |
| `--quiet` | Only errors and final result | `false` |
| `--json` | Machine-readable JSON on stdout | `false` |
| `--report` | Generate a conversion report | Off |
| `--mode <mode>` | `auto`, `local`, or `cloud` | `auto` |
| `--render-wait <seconds>` | Wait before capturing each page | `3` |
| `--format <format>` | `pptx`, `pdf`, or `png` | `pptx` |
| `--webhook <url>` | Cloud callback URL | Config |
| `--retention-hours <n>` | Cloud file retention (hours) | Config |

`--quiet` and `--verbose` cannot be used together.

### JSON Output

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

## Programmatic API

Use the package as a library in Node.js:

```javascript
import { convertHtmlToPptx } from '@deckflow/deckhtml';

const result = await convertHtmlToPptx({
  input: 'index.html',
  output: 'deck.pptx',
});
```

## Documentation

Detailed CLI documentation is available in the [`docs/cli/`](./docs/cli/) directory.

## License

MIT
