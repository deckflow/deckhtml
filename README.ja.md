# DeckHTML

**言語：** [English](./README.md) · [简体中文](./README.zh-CN.md) · [繁體中文](./README.zh-TW.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Español](./README.es.md) · **日本語** · [한국어](./README.ko.md)

ターミナルから HTML ファイル、標準入力、または URL を PPTX、PDF、PNG プレゼンテーションに変換します。

## クイックスタート

インストール不要で実行：

```bash
npx -y @deckflow/deckhtml@latest index.html -o deck.pptx
```

## インストール

```bash
npm install -g @deckflow/deckhtml
deckhtml --version
```

## HTML の変換

単一の HTML ファイルを変換（デフォルトでは同じパス・同名で出力）：

```bash
deckhtml index.html
# → index.pptx
```

出力パスを指定：

```bash
deckhtml index.html -o deck.pptx
```

標準入力から HTML を読み込む：

```bash
cat index.html | deckhtml - -o deck.pptx
```

複数の HTML ファイルを順番に変換：

```bash
deckhtml page1.html page2.html page3.html -o deck.pptx
```

ホストされたページを変換：

```bash
deckhtml https://example.com/deck.html -o deck.pptx
```

## 出力形式

| 形式 | 説明 |
| --- | --- |
| `pptx` | PowerPoint プレゼンテーション（デフォルト） |
| `pdf` | PDF エクスポート |
| `png` | PNG フレーム出力 |

```bash
deckhtml index.html --format pdf -o deck.pdf
deckhtml index.html --format png -o frames
```

## 実行モード

| モード | 説明 |
| --- | --- |
| `auto` | API キーが設定されていればクラウド、なければローカル |
| `local` | 常にローカル実行（API キー不要） |
| `cloud` | 常にクラウド実行（API キー必須） |

```bash
deckhtml index.html --mode local
deckhtml index.html --mode cloud -o deck.pptx
```

### クラウド専用機能

以下のオプションはクラウドモードが必要です：

| オプション | 説明 |
| --- | --- |
| `--rebuild-svg` | SVG オブジェクトを再構築 |
| `--rebuild-chart` | チャートを再構築 |
| `--embed-fonts` | フォントを埋め込み |
| `--map-motion` | アニメーションをマッピング |

```bash
deckhtml index.html \
  -o deck.pptx \
  --mode cloud \
  --rebuild-svg \
  --rebuild-chart \
  --embed-fonts \
  --map-motion
```

## 認証と設定

認証はクラウド実行とクラウド専用オプションにのみ必要です。ローカル変換は API キーなしで動作します。

```bash
deckhtml auth login
deckhtml auth status
deckhtml config set api-key <key>
```

CI、Docker、エージェント環境では環境変数を設定（保存済み認証情報より優先）：

```bash
export DECKHTML_API_KEY=your-api-key
```

永続設定：

| コマンド | 説明 | デフォルト |
| --- | --- | --- |
| `deckhtml config set api-key <key>` | クラウドリクエスト用 API キー | — |
| `deckhtml config set size <size>` | PPTX サイズ | `1920x1080` |
| `deckhtml config set webhook <url>` | デフォルトコールバック URL | — |
| `deckhtml config set retention-hours <n>` | クラウドファイル保持時間（時間） | `3` |

認証情報はローカルの `~/.deckflow/credentials` に保存されます。

## CLI リファレンス

### 変換オプション

| オプション | 説明 | デフォルト |
| --- | --- | --- |
| `-h, --help` | ヘルプを表示 | — |
| `--version` | バージョンを表示 | — |
| `-o, --output <path>` | 出力パス | 入力と同名同パス |
| `-v, --verbose` | 詳細ログを stderr に出力 | `false` |
| `--quiet` | エラーと最終結果のみ出力 | `false` |
| `--json` | stdout に機械可読 JSON を出力 | `false` |
| `--report` | 変換レポートを生成 | オフ |
| `--mode <mode>` | `auto`、`local` または `cloud` | `auto` |
| `--render-wait <seconds>` | 各ページキャプチャ前の待機秒数 | `3` |
| `--format <format>` | `pptx`、`pdf` または `png` | `pptx` |
| `--webhook <url>` | クラウドコールバック URL | 設定 |
| `--retention-hours <n>` | クラウドファイル保持時間（時間） | 設定 |

`--quiet` と `--verbose` は同時に使用できません。

### JSON 出力

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

## プログラム API

Node.js ライブラリとして使用：

```javascript
import { convertHtmlToPptx } from '@deckflow/deckhtml';

const result = await convertHtmlToPptx({
  input: 'index.html',
  output: 'deck.pptx',
});
```

## ドキュメント

詳細な CLI ドキュメントは [`docs/cli/`](./docs/cli/) ディレクトリを参照してください。

## ライセンス

MIT
