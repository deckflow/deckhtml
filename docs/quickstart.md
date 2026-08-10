# Quick Start

DeckHTML converts HTML from local files, standard input, or URLs into PowerPoint (`.pptx`) or PNG output.

## Requirements

- Node.js 18 or newer
- A Chromium-based browser for local conversion. DeckHTML uses Playwright's browser bundle when available; set `--executable-path` or `DECKHTML_CHROMIUM_EXECUTABLE_PATH` to use a specific Chromium binary.

## Convert your first deck

Run directly with `npx`:

```bash
npx -y @deckflow/deckhtml@latest index.html -o deck.pptx
```

Or install the CLI globally:

```bash
npm install -g @deckflow/deckhtml
deckhtml --version
deckhtml index.html -o deck.pptx
```

Open `deck.pptx` in PowerPoint to review the result.

## Common input forms

```bash
# Read HTML from stdin
generate-html | deckhtml - -o deck.pptx

# Combine HTML files into a deck in argument order
deckhtml cover.html agenda.html conclusion.html -o deck.pptx

# Convert a hosted page
deckhtml https://example.com/deck.html -o deck.pptx

# Render PNG frames instead of a PPTX
deckhtml index.html --format png -o frames
```

## Local and cloud execution

Local conversion is the default when no API key is configured and does not require authentication:

```bash
deckhtml index.html --mode local -o deck.pptx
```

Cloud mode supports rate-limited guest conversion. Sign in to use authenticated cloud access; `--embed-fonts` remains cloud-only:

```bash
deckhtml auth login
deckhtml index.html --mode cloud --embed-fonts -o deck.pptx
```

For CI and agent environments, provide `DECKHTML_API_KEY` instead of storing credentials locally:

```bash
export DECKHTML_API_KEY=your-api-key
deckhtml index.html --mode cloud --embed-fonts -o deck.pptx
```

## Next steps

- Read [concepts.md](./concepts.md) to understand how HTML becomes a deck.
- Read [architecture.md](./architecture.md) for the conversion pipeline.
- Browse the [CLI documentation](./cli/index.md) for all commands and flags.
