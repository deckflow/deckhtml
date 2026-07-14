# DeckHTML CLI reference

Package: `@deckflow/deckhtml` · Binary: `deckhtml`

## Invoke

```bash
npx -y @deckflow/deckhtml@latest [inputs...] [flags]
# or globally: deckhtml ...
# or from this repo after build: node dist/cli.js ...
```

## Inputs

| Form | Example |
| --- | --- |
| File | `deckhtml page.html -o out.pptx` |
| Multiple files (order = slides) | `deckhtml a.html b.html c.html -o out.pptx` |
| Stdin | `cat page.html \| deckhtml - -o out.pptx` |
| URL | `deckhtml https://example.com/deck.html -o out.pptx` |

Stdin **requires** `-o` / `--output`.

## Flags

| Flag | Default | Notes |
| --- | --- | --- |
| `-o, --output <path>` | same basename as input | Required for stdin |
| `--format <pptx\|png>` | `pptx` | PNG needs cloud |
| `--mode <auto\|local\|cloud>` | `auto` | Agents: prefer `local` |
| `--width <pixels>` | `1280` local | Height = width × 720/1280 |
| `--platform <win\|mac\|ios\|android\|linux>` | current OS | Generic font mapping |
| `--render-wait <seconds>` | `3` | Cloud per-page wait |
| `--rebuild-svg` | off | Cloud only |
| `--rebuild-chart` | off | Cloud only |
| `--embed-fonts` | off | Cloud only |
| `--map-motion` | off | Cloud only |
| `--report` | off | Writes `<output>.report.json` |
| `--json` | off | Machine-readable stdout |
| `--quiet` | off | Conflicts with `--verbose` |
| `-v, --verbose` | off | Logs on stderr |
| `--webhook <url>` | config | Cloud |
| `--retention-hours <n>` | config (3) | Cloud, 0–99 |

## Modes

| Mode | Behavior |
| --- | --- |
| `local` | Playwright + pptxgenjs on machine; PPTX only; no API key |
| `cloud` | Upload to DeckHTML Cloud; requires API key / space |
| `auto` | Cloud if credentials exist, else local |

Cloud-only flags with `--mode local` → usage error.

## Auth (cloud only)

```bash
export DECKHTML_API_KEY=your-key          # preferred for agents/CI
deckhtml config set api-key <key>
deckhtml auth login
deckhtml auth status
```

Credentials file: `~/.deckflow/credentials`. Env var overrides stored key.

## Config

```bash
deckhtml config set api-key <key>
deckhtml config set size 1920x1080
deckhtml config set webhook https://example.com/hook
deckhtml config set retention-hours 3
```

## Local vs cloud capabilities

| Capability | Local | Cloud |
| --- | --- | --- |
| PPTX | ✓ | ✓ |
| PNG frames | ✗ | ✓ |
| Rebuild SVG/chart | ✗ | ✓ |
| Embed fonts / map motion | ✗ | ✓ |
| Multi-file merge | ✓ | ✓ |
| Auto multi-slide detect | ✓ | (server-side) |

## Peer dependencies (local)

Local conversion needs `playwright` and `pptxgenjs` available (declared as peerDependencies of `@deckflow/deckhtml`).
