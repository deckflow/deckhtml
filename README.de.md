# DeckHTML

**Sprachen:** [English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [Français](./README.fr.md) · **Deutsch** · [Español](./README.es.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md)

Konvertieren Sie HTML-Dateien, stdin oder URLs im Terminal in PPTX- oder PNG-Präsentationen.

## Schnellstart

Ohne Installation ausführen:

```bash
npx -y @deckflow/deckhtml@latest index.html -o deck.pptx
```

## Installation

```bash
npm install -g @deckflow/deckhtml
deckhtml --version
```

## HTML konvertieren

Eine HTML-Datei konvertieren (Standardausgabe: gleicher Pfad und Dateiname):

```bash
deckhtml index.html
# → index.pptx
```

Ausgabepfad angeben:

```bash
deckhtml index.html -o deck.pptx
```

HTML von stdin lesen:

```bash
cat index.html | deckhtml - -o deck.pptx
```

Mehrere HTML-Dateien in Reihenfolge konvertieren:

```bash
deckhtml page1.html page2.html page3.html -o deck.pptx
```

Eine gehostete Seite konvertieren:

```bash
deckhtml https://example.com/deck.html -o deck.pptx
```

## Ausgabeformate

| Format | Beschreibung |
| --- | --- |
| `pptx` | PowerPoint-Präsentation (Standard) |
| `png` | PNG-Bildausgabe |

```bash
deckhtml index.html --format png -o frames
```

## Ausführungsmodi

| Modus | Beschreibung |
| --- | --- |
| `auto` | Cloud bei konfiguriertem API-Schlüssel, sonst lokal |
| `local` | Immer lokal (kein API-Schlüssel erforderlich) |
| `cloud` | Immer in der Cloud (API-Schlüssel erforderlich) |

```bash
deckhtml index.html --mode local
deckhtml index.html --mode cloud -o deck.pptx
```

### Nur in der Cloud verfügbar

Diese Optionen erfordern den Cloud-Modus:

| Option | Beschreibung |
| --- | --- |
| `--rebuild-svg` | SVG-Objekte neu aufbauen |
| `--rebuild-chart` | Diagramme neu aufbauen |
| `--embed-fonts` | Schriftarten einbetten |
| `--map-motion` | Animationen zuordnen |

```bash
deckhtml index.html \
  -o deck.pptx \
  --mode cloud \
  --rebuild-svg \
  --rebuild-chart \
  --embed-fonts \
  --map-motion
```

## Authentifizierung und Konfiguration

Authentifizierung ist nur für Cloud-Ausführung und Cloud-Optionen erforderlich. Lokale Konvertierung funktioniert ohne API-Schlüssel.

```bash
deckhtml auth login
deckhtml auth status
deckhtml config set api-key <key>
```

Für CI, Docker oder Agent-Umgebungen die Umgebungsvariable setzen (hat Vorrang vor gespeicherten Anmeldedaten):

```bash
export DECKHTML_API_KEY=your-api-key
```

Persistente Einstellungen:

| Befehl | Beschreibung | Standard |
| --- | --- | --- |
| `deckhtml config set api-key <key>` | API-Schlüssel für Cloud-Anfragen | — |
| `deckhtml config set size <size>` | PPTX-Abmessungen | `1920x1080` |
| `deckhtml config set webhook <url>` | Standard-Callback-URL | — |
| `deckhtml config set retention-hours <n>` | Cloud-Aufbewahrung (Stunden) | `3` |

Anmeldedaten werden lokal unter `~/.deckflow/credentials` gespeichert.

## CLI-Referenz

### Konvertierungsoptionen

| Option | Beschreibung | Standard |
| --- | --- | --- |
| `-h, --help` | Hilfe anzeigen | — |
| `--version` | Version anzeigen | — |
| `-o, --output <path>` | Ausgabepfad | Gleicher Name wie Eingabe |
| `-v, --verbose` | Detaillierte Logs auf stderr | `false` |
| `--quiet` | Nur Fehler und Endergebnis | `false` |
| `--json` | Maschinenlesbares JSON auf stdout | `false` |
| `--report` | Konvertierungsbericht erzeugen | Aus |
| `--mode <mode>` | `auto`, `local` oder `cloud` | `auto` |
| `--render-wait <seconds>` | Wartezeit vor Seitenaufnahme | `3` |
| `--format <format>` | `pptx` oder `png` | `pptx` |
| `--webhook <url>` | Cloud-Callback-URL | Config |
| `--retention-hours <n>` | Cloud-Aufbewahrung (Stunden) | Config |

`--quiet` und `--verbose` können nicht zusammen verwendet werden.

### JSON-Ausgabe

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

## Programmatische API

Als Node.js-Bibliothek verwenden:

```javascript
import { convertHtmlToPptx } from '@deckflow/deckhtml';

const result = await convertHtmlToPptx({
  input: 'index.html',
  output: 'deck.pptx',
});
```

## Dokumentation

Ausführliche CLI-Dokumentation im Verzeichnis [`docs/cli/`](./docs/cli/).

## Lizenz

MIT
