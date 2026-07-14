# DeckHTML

**Idiomas:** [English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · **Español** · [日本語](./README.ja.md) · [한국어](./README.ko.md)

Convierte archivos HTML, entrada estándar o URL en presentaciones PPTX o PNG desde la terminal.

## Inicio rápido

Ejecutar sin instalar:

```bash
npx -y @deckflow/deckhtml@latest index.html -o deck.pptx
```

## Instalación

```bash
npm install -g @deckflow/deckhtml
deckhtml --version
```

## Convertir HTML

Convertir un archivo HTML (la salida usa por defecto la misma ruta y nombre base):

```bash
deckhtml index.html
# → index.pptx
```

Especificar ruta de salida:

```bash
deckhtml index.html -o deck.pptx
```

Leer HTML desde la entrada estándar:

```bash
cat index.html | deckhtml - -o deck.pptx
```

Convertir varios archivos HTML en orden:

```bash
deckhtml page1.html page2.html page3.html -o deck.pptx
```

Convertir una página alojada:

```bash
deckhtml https://example.com/deck.html -o deck.pptx
```

## Formatos de salida

| Formato | Descripción |
| --- | --- |
| `pptx` | Presentación PowerPoint (predeterminado) |
| `png` | Salida en fotogramas PNG |

```bash
deckhtml index.html --format png -o frames
```

## Modos de ejecución

| Modo | Descripción |
| --- | --- |
| `auto` | Nube si hay clave API configurada; si no, local |
| `local` | Siempre local (no requiere clave API) |
| `cloud` | Siempre en la nube (requiere clave API) |

```bash
deckhtml index.html --mode local
deckhtml index.html --mode cloud -o deck.pptx
```

### Mejoras exclusivas de la nube

Estas opciones requieren el modo nube:

| Opción | Descripción |
| --- | --- |
| `--rebuild-svg` | Reconstruir objetos SVG |
| `--rebuild-chart` | Reconstruir gráficos |
| `--embed-fonts` | Incrustar fuentes |
| `--map-motion` | Mapear animaciones |

```bash
deckhtml index.html \
  -o deck.pptx \
  --mode cloud \
  --rebuild-svg \
  --rebuild-chart \
  --embed-fonts \
  --map-motion
```

## Autenticación y configuración

La autenticación solo es necesaria para ejecución en la nube y opciones exclusivas de la nube. La conversión local funciona sin clave API.

```bash
deckhtml auth login
deckhtml auth status
deckhtml config set api-key <key>
```

Para CI, Docker o agentes, define la variable de entorno (tiene prioridad sobre credenciales almacenadas):

```bash
export DECKHTML_API_KEY=your-api-key
```

Configuración persistente:

| Comando | Descripción | Predeterminado |
| --- | --- | --- |
| `deckhtml config set api-key <key>` | Clave API para solicitudes en la nube | — |
| `deckhtml config set size <size>` | Dimensiones PPTX | `1920x1080` |
| `deckhtml config set webhook <url>` | URL de callback predeterminada | — |
| `deckhtml config set retention-hours <n>` | Retención en la nube (horas) | `3` |

Las credenciales se guardan localmente en `~/.deckflow/credentials`.

## Referencia CLI

### Opciones de conversión

| Opción | Descripción | Predeterminado |
| --- | --- | --- |
| `-h, --help` | Mostrar ayuda | — |
| `--version` | Mostrar versión | — |
| `-o, --output <path>` | Ruta de salida | Mismo nombre que la entrada |
| `-v, --verbose` | Registros detallados en stderr | `false` |
| `--quiet` | Solo errores y resultado final | `false` |
| `--json` | JSON legible por máquina en stdout | `false` |
| `--report` | Generar informe de conversión | Desactivado |
| `--mode <mode>` | `auto`, `local` o `cloud` | `auto` |
| `--render-wait <seconds>` | Espera antes de capturar cada página | `3` |
| `--format <format>` | `pptx` o `png` | `pptx` |
| `--webhook <url>` | URL de callback en la nube | Config |
| `--retention-hours <n>` | Retención en la nube (horas) | Config |

`--quiet` y `--verbose` no se pueden usar juntos.

### Salida JSON

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

## API programática

Usar el paquete como biblioteca en Node.js:

```javascript
import { convertHtmlToPptx } from '@deckflow/deckhtml';

const result = await convertHtmlToPptx({
  input: 'index.html',
  output: 'deck.pptx',
});
```

## Documentación

Documentación CLI detallada en el directorio [`docs/cli/`](./docs/cli/).

## Licencia

MIT
