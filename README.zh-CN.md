# DeckHTML

**语言：** [English](./README.md) · **简体中文** · [繁體中文](./README.zh-TW.md) · [Français](./README.fr.md) · [Deutsch](./README.de.md) · [Español](./README.es.md) · [日本語](./README.ja.md) · [한국어](./README.ko.md)

在终端中将 HTML 文件、标准输入或 URL 转换为 PPTX 或 PNG 演示文稿。

## 快速开始

无需安装，直接运行：

```bash
npx -y @deckflow/deckhtml@latest index.html -o deck.pptx
```

## 安装

```bash
npm install -g @deckflow/deckhtml
deckhtml --version
```

## 转换 HTML

转换单个 HTML 文件（默认输出到同路径、同名文件）：

```bash
deckhtml index.html
# → index.pptx
```

指定输出路径：

```bash
deckhtml index.html -o deck.pptx
```

从标准输入读取 HTML：

```bash
cat index.html | deckhtml - -o deck.pptx
```

按顺序转换多个 HTML 文件：

```bash
deckhtml page1.html page2.html page3.html -o deck.pptx
```

转换托管页面：

```bash
deckhtml https://example.com/deck.html -o deck.pptx
```

## 输出格式

| 格式 | 说明 |
| --- | --- |
| `pptx` | PowerPoint 演示文稿（默认） |
| `png` | PNG 帧输出 |

```bash
deckhtml index.html --format png -o frames
```

## 执行模式

| 模式 | 说明 |
| --- | --- |
| `auto` | 已配置 API Key 时使用云端，否则本地执行 |
| `local` | 始终本地执行（无需 API Key） |
| `cloud` | 始终云端执行（需要 API Key） |

```bash
deckhtml index.html --mode local
deckhtml index.html --mode cloud -o deck.pptx
```

### 仅云端可用功能

以下选项需要云端模式：

| 选项 | 说明 |
| --- | --- |
| `--rebuild-svg` | 重建 SVG 对象 |
| `--rebuild-chart` | 重建图表对象 |
| `--embed-fonts` | 嵌入字体 |
| `--map-motion` | 映射动画 |

```bash
deckhtml index.html \
  -o deck.pptx \
  --mode cloud \
  --rebuild-svg \
  --rebuild-chart \
  --embed-fonts \
  --map-motion
```

## 认证与配置

仅云端执行和云端专属功能需要认证。本地转换无需 API Key。

```bash
deckhtml auth login
deckhtml auth status
deckhtml config set api-key <key>
```

在 CI、Docker 或 Agent 环境中，可使用环境变量（优先级高于本地存储的凭据）：

```bash
export DECKHTML_API_KEY=your-api-key
```

持久化配置：

| 命令 | 说明 | 默认值 |
| --- | --- | --- |
| `deckhtml config set api-key <key>` | 云端请求使用的 API Key | — |
| `deckhtml config set size <size>` | PPTX 尺寸 | `1920x1080` |
| `deckhtml config set webhook <url>` | 默认回调地址 | — |
| `deckhtml config set retention-hours <n>` | 云端文件保留时长（小时） | `3` |

凭据保存在本地 `~/.deckflow/credentials`。

## CLI 参考

### 转换选项

| 选项 | 说明 | 默认值 |
| --- | --- | --- |
| `-h, --help` | 显示帮助 | — |
| `--version` | 显示版本 | — |
| `-o, --output <path>` | 输出路径 | 与输入同名同路径 |
| `-v, --verbose` | 详细日志输出到 stderr | `false` |
| `--quiet` | 仅输出错误和最终结果 | `false` |
| `--json` | stdout 输出机器可读 JSON | `false` |
| `--report` | 生成转换报告 | 关闭 |
| `--mode <mode>` | `auto`、`local` 或 `cloud` | `auto` |
| `--render-wait <seconds>` | 每页捕获前等待秒数 | `3` |
| `--format <format>` | `pptx` 或 `png` | `pptx` |
| `--webhook <url>` | 云端回调地址 | 配置项 |
| `--retention-hours <n>` | 云端文件保留时长（小时） | 配置项 |

`--quiet` 与 `--verbose` 不能同时使用。

### JSON 输出

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

## 编程 API

在 Node.js 中作为库使用：

```javascript
import { convertHtmlToPptx } from '@deckflow/deckhtml';

const result = await convertHtmlToPptx({
  input: 'index.html',
  output: 'deck.pptx',
});
```

## 文档

详细 CLI 文档见 [`docs/cli/`](./docs/cli/) 目录。

## 许可证

MIT
