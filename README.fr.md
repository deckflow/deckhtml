# DeckHTML

**Langues :** [English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · **Français** · [Deutsch](./README.de.md) · [Español](./README.es.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md)

Convertissez des fichiers HTML, l'entrée standard ou des URL en présentations PPTX, PDF ou PNG depuis votre terminal.

## Démarrage rapide

Exécution sans installation :

```bash
npx -y @deckflow/deckhtml@latest index.html -o deck.pptx
```

## Installation

```bash
npm install -g @deckflow/deckhtml
deckhtml --version
```

## Convertir du HTML

Convertir un fichier HTML (la sortie utilise par défaut le même chemin et le même nom de base) :

```bash
deckhtml index.html
# → index.pptx
```

Spécifier un chemin de sortie :

```bash
deckhtml index.html -o deck.pptx
```

Lire le HTML depuis l'entrée standard :

```bash
cat index.html | deckhtml - -o deck.pptx
```

Convertir plusieurs fichiers HTML dans l'ordre :

```bash
deckhtml page1.html page2.html page3.html -o deck.pptx
```

Convertir une page hébergée :

```bash
deckhtml https://example.com/deck.html -o deck.pptx
```

## Formats de sortie

| Format | Description |
| --- | --- |
| `pptx` | Présentation PowerPoint (par défaut) |
| `pdf` | Export PDF |
| `png` | Export en images PNG |

```bash
deckhtml index.html --format pdf -o deck.pdf
deckhtml index.html --format png -o frames
```

## Modes d'exécution

| Mode | Description |
| --- | --- |
| `auto` | Cloud si une clé API est configurée, sinon local |
| `local` | Toujours en local (aucune clé API requise) |
| `cloud` | Toujours dans le cloud (clé API requise) |

```bash
deckhtml index.html --mode local
deckhtml index.html --mode cloud -o deck.pptx
```

### Améliorations réservées au cloud

Ces options nécessitent le mode cloud :

| Option | Description |
| --- | --- |
| `--rebuild-svg` | Reconstruire les objets SVG |
| `--rebuild-chart` | Reconstruire les graphiques |
| `--embed-fonts` | Intégrer les polices |
| `--map-motion` | Mapper les animations |

```bash
deckhtml index.html \
  -o deck.pptx \
  --mode cloud \
  --rebuild-svg \
  --rebuild-chart \
  --embed-fonts \
  --map-motion
```

## Authentification et configuration

L'authentification n'est requise que pour l'exécution cloud et les options cloud. La conversion locale fonctionne sans clé API.

```bash
deckhtml auth login
deckhtml auth status
deckhtml config set api-key <key>
```

Pour CI, Docker ou les agents, définissez la variable d'environnement (prioritaire sur les identifiants stockés) :

```bash
export DECKHTML_API_KEY=your-api-key
```

Paramètres persistants :

| Commande | Description | Par défaut |
| --- | --- | --- |
| `deckhtml config set api-key <key>` | Clé API pour les requêtes cloud | — |
| `deckhtml config set size <size>` | Dimensions PPTX | `1920x1080` |
| `deckhtml config set webhook <url>` | URL de rappel par défaut | — |
| `deckhtml config set retention-hours <n>` | Durée de rétention cloud (heures) | `3` |

Les identifiants sont stockés localement dans `~/.deckflow/credentials`.

## Référence CLI

### Options de conversion

| Option | Description | Par défaut |
| --- | --- | --- |
| `-h, --help` | Afficher l'aide | — |
| `--version` | Afficher la version | — |
| `-o, --output <path>` | Chemin de sortie | Même nom que l'entrée |
| `-v, --verbose` | Journaux détaillés sur stderr | `false` |
| `--quiet` | Erreurs et résultat final uniquement | `false` |
| `--json` | JSON lisible par machine sur stdout | `false` |
| `--report` | Générer un rapport de conversion | Désactivé |
| `--mode <mode>` | `auto`, `local` ou `cloud` | `auto` |
| `--render-wait <seconds>` | Attente avant capture de chaque page | `3` |
| `--format <format>` | `pptx`, `pdf` ou `png` | `pptx` |
| `--webhook <url>` | URL de rappel cloud | Config |
| `--retention-hours <n>` | Rétention cloud (heures) | Config |

`--quiet` et `--verbose` ne peuvent pas être utilisés ensemble.

### Sortie JSON

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

## API programmatique

Utilisez le package comme bibliothèque Node.js :

```javascript
import { convertHtmlToPptx } from '@deckflow/deckhtml';

const result = await convertHtmlToPptx({
  input: 'index.html',
  output: 'deck.pptx',
});
```

## Documentation

La documentation CLI détaillée se trouve dans le répertoire [`docs/cli/`](./docs/cli/).

## Licence

MIT
