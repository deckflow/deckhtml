# Examples

> Browse DeckHTML CLI workflows for local HTML files, stdin, ordered HTML files, hosted URLs, reports, script-friendly output, and cloud reconstruction.

## Run Without Installing

Convert a local HTML file with the npm package:

```bash
npx -y @deckflow/deckhtml@latest index.html -o deck.pptx
```

Install the CLI globally when you use it often:

```bash
npm install -g @deckflow/deckhtml
deckhtml --version
```

***

## Convert a Single HTML File

Convert a local HTML file to PPTX:

```bash
deckhtml index.html
```

The default output uses the input file name:

```text
index.pptx
```

Write to a specific output path:

```bash
deckhtml index.html -o deck.pptx
```

***

## Convert HTML from Stdin

Pipe generated HTML into DeckHTML:

```bash
cat index.html | deckhtml - -o deck.pptx
```

Use `-` as the stdin input placeholder. Provide `--output` or `-o` when converting stdin.

***

## Convert Multiple Ordered Files

Pass files in the order they should appear:

```bash
deckhtml title.html agenda.html content.html summary.html -o deck.pptx
```

***

## Convert a URL

Convert a hosted HTML deck:

```bash
deckhtml https://example.com/deck.html -o deck.pptx
```

Wait longer for client-side rendering:

```bash
deckhtml https://example.com/deck.html -o deck.pptx --render-wait 9
```

***

## Generate PDF or PNG Output

Generate a PDF:

```bash
deckhtml index.html --format pdf -o deck.pdf
```

Generate PNG frames from one HTML file:

```bash
deckhtml index.html --format png -o frames
```

Generate PNG frames from multiple explicit HTML files:

```bash
deckhtml title.html chart.html appendix.html --format png -o frames
```

Generate the default PPTX format explicitly:

```bash
deckhtml index.html --format pptx -o deck.pptx
```

***

## Use Local, Auto, or Cloud Mode

Force local conversion:

```bash
deckhtml index.html -o deck.pptx --mode local
```

Let DeckHTML choose the mode:

```bash
deckhtml index.html -o deck.pptx --mode auto
```

Force cloud conversion:

```bash
deckhtml index.html -o deck.pptx --mode cloud
```

`auto` uses cloud mode when an API key is configured and local mode otherwise. Local mode works without authentication.

***

## Use Cloud Reconstruction Features

Rebuild richer presentation objects in cloud mode:

```bash
deckhtml index.html \
  -o deck.pptx \
  --mode cloud \
  --rebuild-svg \
  --rebuild-chart \
  --embed-fonts \
  --map-motion
```

These flags are cloud-only.

***

## Generate a Conversion Report

Create a report next to the output:

```bash
deckhtml index.html -o deck.pptx --report
```

***

## Get Machine-Readable Output

Return JSON for scripts and CI:

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

Combine JSON with stdin:

```bash
cat index.html | deckhtml - -o deck.pptx --json
```

***

## Adjust Log Output

Print only the final result:

```bash
deckhtml index.html -o deck.pptx --quiet
```

Print detailed conversion logs:

```bash
deckhtml index.html -o deck.pptx --verbose
```

***

## Configure Cloud Access

Start browser login:

```bash
deckhtml auth login
```

Set an API key directly:

```bash
deckhtml config set api-key <key>
```

For CI, Docker, and agent environments, set the environment variable:

```bash
export DECKHTML_API_KEY=your-api-key
deckhtml index.html -o deck.pptx --mode cloud
```

Verify your credentials:

```bash
deckhtml auth status
```

***

## Configure PPTX Size

```bash
deckhtml config set size 1920x1080
```

The default PPTX size is `1920x1080`.
