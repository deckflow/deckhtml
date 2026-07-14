# Commands

> Reference DeckHTML CLI commands, flags, examples, and expected behavior for conversion, authentication, persistent config, output formats, and execution modes.

The primary command follows the pattern `deckhtml <input> [flags]`. Config commands follow `deckhtml config set <key> <value>`.

Run `deckhtml --help` for usage details and `deckhtml --version` for version information.

## Convert

Convert HTML input into a presentation artifact.

| Command | Description |
| --- | --- |
| `deckhtml <input> [flags]` | Convert stdin, one HTML file, multiple ordered HTML files, or a URL. |

### Supported input forms

| Input | Example | Description |
| --- | --- | --- |
| stdin | `cat index.html \| deckhtml - -o deck.pptx` | Read HTML from stdin. |
| HTML file | `deckhtml index.html` | Convert one local HTML file. |
| HTML files | `deckhtml page1.html page2.html page3.html` | Convert files in argument order. |
| URL | `deckhtml https://example.com/deck.html -o deck.pptx` | Load and convert a hosted page. |

### Flags for `deckhtml <input>`

| Flag | Description | Default |
| --- | --- | --- |
| `-h, --help` | Show help. | Off |
| `--version` | Show version information. | Off |
| `-o, --output <path>` | Output path. Example: `deck.pptx`. | Same base name and path as the input when possible. |
| `-v, --verbose` | Write detailed logs to stderr. | `false` |
| `--quiet` | Only output errors and the final result. Conflicts with `--verbose`. | `false` |
| `--json` | Make stdout machine-readable JSON only. | `false` |
| `--report` | Generate a conversion report next to the output. | Off |
| `--mode <mode>` | Choose `auto`, `local`, or `cloud` execution. | `auto` |
| `--render-wait <seconds>` | Wait time per page before capture. | `3` |
| `--rebuild-svg` | Rebuild SVG objects. Cloud only. | Off |
| `--rebuild-chart` | Rebuild chart objects. Cloud only. | Off |
| `--embed-fonts` | Embed fonts. Cloud only. | Off |
| `--map-motion` | Map animations. Cloud only. | Off |
| `--format <format>` | Choose `pptx` or `png`. | `pptx` |
| `--webhook <url>` | Callback URL for cloud conversion events. | Config |
| `--retention-hours <n>` | Cloud file retention time in hours. | Config |

## Execution Modes

`--mode` controls where the conversion runs.

| Mode | Description |
| --- | --- |
| `auto` | If an API key is configured, run in cloud mode. If not, run locally. |
| `local` | Always run locally. Cloud-only flags are invalid. |
| `cloud` | Run in cloud mode and require an API key. |

Cloud-only flags are:

| Flag | Description |
| --- | --- |
| `--rebuild-svg` | Rebuild SVG objects. |
| `--rebuild-chart` | Rebuild chart objects. |
| `--embed-fonts` | Embed fonts. |
| `--map-motion` | Map animations. |

## Authentication

Authentication is only required for cloud execution and cloud-only enhancement flags. Local conversion works without an API key.

| Command | Description |
| --- | --- |
| `deckhtml auth login` | Start an interactive browser login flow. |
| `deckhtml auth status` | Verify the currently configured credentials. |

You can also store an API key directly:

```bash
deckhtml config set api-key <key>
```

Stored credentials are written locally at `~/.deckflow/credentials`.

For CI, Docker, or agent environments, set `DECKHTML_API_KEY`. The environment variable takes precedence over stored credentials.

```bash
export DECKHTML_API_KEY=your-api-key
```

## Config

Persistent settings are managed with `deckhtml config set`.

| Command | Description | Default |
| --- | --- | --- |
| `deckhtml config set api-key <key>` | Store the API key used for cloud requests. | None |
| `deckhtml config set size <size>` | Set PPTX dimensions. | `1920x1080` |
| `deckhtml config set webhook <url>` | Set the default callback URL. | None |
| `deckhtml config set retention-hours <n>` | Set cloud file retention time in hours. | `3` |

## Output Formats

| Format | Example | Description |
| --- | --- | --- |
| `pptx` | `deckhtml index.html --format pptx -o deck.pptx` | PowerPoint deck output. Default. |
| `png` | `deckhtml index.html --format png -o frames` | PNG frame output. |

## Install

Run DeckHTML without installing:

```bash
npx -y @deckflow/deckhtml@latest index.html -o deck.pptx
```

Install globally:

```bash
npm install -g @deckflow/deckhtml
```

## Examples

```bash
deckhtml index.html
deckhtml index.html -o deck.pptx
cat index.html | deckhtml - -o deck.pptx
deckhtml page1.html page2.html page3.html -o deck.pptx
deckhtml https://example.com/deck.html -o deck.pptx --render-wait 9
deckhtml index.html --mode cloud --embed-fonts -o deck.pptx
deckhtml index.html -o deck.pptx --json
deckhtml index.html -o deck.pptx --report
```
