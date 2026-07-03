# Overview

> Convert HTML files, stdin, or URLs into PPTX, PDF, or PNG artifacts from your terminal.

The DeckHTML CLI gives developers and agents command-line access to HTML-to-deck conversion. It accepts local files, multiple ordered HTML files, stdin, and hosted URLs. It runs synchronously by default, can choose between local and cloud execution, and supports machine-readable JSON output for scripts and CI.

## Quick Start

Run DeckHTML without installing:

```bash
npx -y @deckflow/deckhtml@latest index.html -o deck.pptx
```

## 1. Install

DeckHTML is distributed through npm.

```bash
npm install -g @deckflow/deckhtml
```

Verify the installation:

```bash
deckhtml --version
```

## 2. Convert HTML

Convert a single HTML file to PPTX:

```bash
deckhtml index.html
```

By default, DeckHTML writes a PPTX next to the input file using the same base name:

```text
index.pptx
```

Write to a specific output path:

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

## 3. Review the Result

The CLI runs as a synchronous conversion task. On success, stdout contains the final result. With the default output mode, that can be the output path:

```text
deck.pptx
```

Use `--json` for machine-readable output:

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

## 4. Generate Reports or Other Formats

Create a conversion report next to the output:

```bash
deckhtml ./page.html -o deck.pptx --report
```

Choose a different output format:

```bash
deckhtml index.html --format pdf -o deck.pdf
```

Supported formats are:

| Format | Description |
| --- | --- |
| `pptx` | PowerPoint deck output. Default. |
| `pdf` | PDF export. |
| `png` | PNG frame output. |

Use cloud mode for cloud-only reconstruction features:

```bash
deckhtml index.html \
  -o deck.pptx \
  --mode cloud \
  --rebuild-svg \
  --rebuild-chart \
  --embed-fonts \
  --map-motion
```

## 5. Authenticate

Authentication is only required for cloud execution and cloud-only enhancement flags.

Start an interactive login flow:

```bash
deckhtml auth login
```

Or copy your API key from [workspace settings](https://app.deckflow.com/settings/api?nav=API) and store it directly:

```bash
deckhtml config set api-key <key>
```

The key is stored locally at `~/.deckflow/credentials`.

For CI/Docker/agent environments, set the environment variable instead — it takes precedence over stored credentials:

```bash
export DECKHTML_API_KEY=your-api-key
```

Verify your credentials:

```bash
deckhtml auth status
```
