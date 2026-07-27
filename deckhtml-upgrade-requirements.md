# DeckHTML 通用升级评估与研发建议

## 0. 文档状态

| 字段 | 值 |
| --- | --- |
| 文档用途 | 交付 DeckHTML 开发者的独立研发建议 |
| 评估日期 | `2026-07-26` |
| 评估对象 | `@deckflow/deckhtml@0.3.1` |
| npm integrity | `sha512-JdRsJonK4l/uUriV7dtXH9zU2WCD8OO39uVjr+JMTXB+8BrpdAiQEcBH2dYsTplZxeFzx4t6j2MDZUgWo/DhTw==` |
| 对应源码 | `0e1a38be6298786de55c38a0448d587c460dca0f` |
| 源码链接 | `https://github.com/deckflow/deckhtml/tree/0e1a38be6298786de55c38a0448d587c460dca0f` |
| 总体结论 | 已有可用转换底座，建议升级为具有严格模式、逐元素报告和稳定 library API 的通用高质量 HTML→PPTX 工具 |

本文只从 DeckHTML 作为独立开源工具的角度提出建议。目标是服务任何需要把 HTML 转换为高质量、可编辑 PPTX 或 PNG 的开发者，不依赖特定上层产品、工作流或项目结构。

## 1. 当前能力判断

`@deckflow/deckhtml@0.3.1` 已经具备有价值的转换能力：

- 使用 Chromium 获取最终 DOM geometry 与 computed style；
- 支持原生可编辑文本、富文本、图片、常见 shape 和基础 table；
- 支持简体中文、繁体中文、日文、韩文和英文的 script/font 分段；
- 支持多个 HTML 输入按顺序合并；
- 支持 SVG、MathML 和 PNG 输出；
- 能输出元素、字体和栅格化的聚合统计；
- 同时提供 CLI 和 programmatic API。

下一阶段最值得投入的方向不是继续增加零散格式选项，而是把“转换成功”提升为“转换结果可证明、可追溯、可严格验收”：

1. HTML 元素可以对应到具体 PPTX 对象；
2. 调用方能知道每个元素是原生、矢量、栅格、忽略还是不支持；
3. 调用方能选择 strict 模式，拒绝静默降级；
4. 浏览器、网络、资源和输出副作用可由调用方控制；
5. library API、CLI、Schema 和实际行为保持一致；
6. 输出具有可重复验证的 OOXML 结构。

这些能力对 Agent、文档自动化、批量生成、CMS、低代码平台、演示文稿编辑器和 CI 转换服务都有普遍价值。

## 2. 本轮建议聚焦

本轮升级建议集中在所有 HTML→PPTX 使用者都能直接获益的四类能力：

- 输出质量：提高 native/vector object 覆盖率，避免不可见的栅格化或内容丢失；
- 可检查性：提供逐元素 mapping、稳定 diagnostics 和 OOXML 自检；
- 可嵌入性：提供稳定 library API、纯净 machine output 和可控副作用；
- 通用性：普通网页可继续宽松转换，高质量自动化场景可以启用 strict mode。

## 3. P0 研发建议

### DH-P0-001：稳定的元素 identity

建议支持调用方为需要导出的 DOM 元素提供稳定 identity，并将该 identity 保留到 PPTX object name 或等价可回查 OOXML 字段。

默认可以识别：

```html
<h1 data-element-id="cover-title">Title</h1>
```

为适应不同调用方，建议同时允许配置 identity attribute：

```ts
{
  identityAttribute: "data-element-id"
}
```

要求：

- 检测重复 identity；
- 对声明了 identity 却没有进入输出的元素给出 diagnostic；
- group 同时保留 parent 与 child identity；
- 不使用 `Text 3`、`Shape 4` 等内部自动编号替代调用方 identity；
- 没有 identity 的普通网页仍可使用宽松转换模式；
- strict 模式可以要求全部可见语义元素都具有 identity。

### DH-P0-002：逐页、逐元素 conversion report

当前聚合统计应扩展为稳定的逐元素机器报告：

```json
{
  "schema_version": 1,
  "engine": {
    "name": "@deckflow/deckhtml",
    "version": "x.y.z"
  },
  "status": "succeeded",
  "slides": [
    {
      "slide_id": "slide-01",
      "index": 1,
      "elements": [
        {
          "element_id": "cover-title",
          "kind": "text",
          "mapping_mode": "native",
          "object_ref": "ppt/slides/slide1.xml#shape:cover-title",
          "geometry": {
            "x": 0.7,
            "y": 0.6,
            "w": 8.2,
            "h": 0.8,
            "unit": "inch"
          },
          "warnings": []
        }
      ]
    }
  ],
  "summary": {
    "native": 1,
    "vector": 0,
    "raster": 0,
    "ignored": 0,
    "unsupported": 0
  },
  "diagnostics": []
}
```

要求：

- `mapping_mode` 至少区分 `native`、`vector`、`raster`、`ignored`、`unsupported`；
- SVG 作为 vector image 输出时计为 `vector`，不应计入 raster/simplified；
- ignored、unsupported 和 raster 必须说明原因；
- slide、element 和 diagnostic 稳定排序；
- report 不依赖临时绝对路径，不复制完整用户正文；
- Schema 随 npm package 发布；
- machine stdout 不得被日志、spinner 或内部 `console.log` 污染。

### DH-P0-003：宽松模式与 strict 模式分离

普通网页转换可以继续采用兼容性优先的宽松模式，但自动化和高质量交付需要显式 strict 模式。

建议 API：

```ts
{
  strict: {
    requireElementIdentity: true,
    allowRaster: false,
    allowUnsupported: false,
    allowRemoteResources: false,
    failOnMissingFonts: true
  }
}
```

strict 模式要求：

- 不允许整页 screenshot fallback；
- required element 不得静默 ignored；
- 资源失败、转换异常和字体关键 fallback 不得被 placeholder 掩盖；
- unsupported 影响文本、数据、阅读顺序或主要视觉时 hard fail；
- 失败时不返回看似成功的 PPTX；
- 汇总数据必须能从逐元素 records 重算。

宽松模式仍可允许 raster fallback，但必须在 report 中逐项披露，不能只返回一个无法定位的总数。

### DH-P0-004：显式的元素类型提示

建议允许 HTML 作者提示期望的 PowerPoint 对象类型：

```html
<div data-pptx-kind="shape"></div>
<table data-pptx-kind="table"></table>
<div data-pptx-kind="ignore" aria-hidden="true"></div>
```

建议支持：

```text
text | image | shape | table | group | ignore
```

没有显式 kind 时可以按标签和 computed style 推断；无法无歧义推断时报告 `PPTX_KIND_AMBIGUOUS`。类型提示是通用 HTML 扩展，不应要求网页采用某种项目框架。

最低映射目标：

| kind | PPTX 输出 |
| --- | --- |
| `text` | native text box / runs |
| `image` | native image，保留 crop/object-fit |
| `shape` | native shape，保留 fill/border/opacity/rotation |
| `table` | native table；不支持的 span 明确失败或降级 |
| `group` | native PowerPoint group，并保留 child identity |
| SVG | vector image |
| `ignore` | 明确不导出并记录原因 |

### DH-P0-005：页面选择与 runtime 排除

转换器不应假设传入 HTML 的全部可见节点都属于 slide 内容。建议支持：

- `pageSelector`；
- `excludeSelector`；
- 显式 page list 与顺序；
- runtime/navigation/toolbar 的默认或调用方配置排除；
- 每个 page 的稳定 `slideId`；
- page selector 未匹配、重复匹配或顺序不明确时的 diagnostic。

这可以避免播放器导航、悬浮工具栏和宿主页面 chrome 被误导出。

### DH-P0-006：受控浏览器注入

library API 和 CLI 建议支持：

1. 显式 Chromium executable path；
2. 调用方提供的 browser 或 browser context；
3. 临时 user-data-dir；
4. 完成或失败后的 context/profile 清理；
5. 浏览器不可用时的结构化 diagnostic。

package install/postinstall 不应强制下载浏览器。运行时不应默认写入 `~/browser-data`，也不应要求调用方通过伪造 Playwright revision 才能使用宿主已有 Chromium。

### DH-P0-007：网络与本地资源策略

建议提供明确的 resource policy：

```ts
{
  resourcePolicy: {
    network: "deny",
    allowedRoots: ["/path/to/assets"],
    followSymlinks: false
  }
}
```

要求：

- 可以阻断 `http:`、`https:`、`ws:`、`wss:`；
- 本地严格模式只读取显式 allowed roots；
- 禁止 `..`、symlink 和 URL 编码逃逸；
- remote font/image/script/style 是否允许由调用方明确决定；
- blocked、missing 和 escaped resource 进入逐项 diagnostic；
- “允许本地资源”不应等价于关闭路径 containment；
- local mode 不应因环境中存在 API key 自动切换到 cloud。

### DH-P0-008：library-first、无隐式写入

建议把稳定 programmatic API 作为自动化集成的第一入口：

```ts
type ConvertDeckOptions = {
  pages: Array<{
    slideId: string;
    html: string;
    baseUrl?: string;
  }>;
  viewport: { width: number; height: number };
  identityAttribute?: string;
  pageSelector?: string;
  excludeSelector?: string;
  strict?: StrictConversionOptions;
  browser?: {
    executablePath?: string;
  };
  resourcePolicy?: ResourcePolicy;
};

type ConvertDeckResult = {
  pptx: Uint8Array;
  report: DeckHtmlConversionReport;
};
```

具体命名可以调整，但建议满足：

- 输入页面和顺序由调用方明确给出；
- 输出可以 bytes/stream 返回，不要求直接写最终路径；
- library API 不静默覆盖文件；
- 不自动打开浏览器 UI；
- 不修改输入 HTML；
- local API 不自动启动云任务；
- CLI 的文件输出默认拒绝覆盖，并使用临时文件加原子 rename；
- API types、README examples 和实际实现一致。

### DH-P0-009：结构化 diagnostics

每条 diagnostic 建议至少包含：

```json
{
  "rule_id": "DECKHTML_REMOTE_RESOURCE_BLOCKED",
  "severity": "error",
  "slide_id": "slide-01",
  "element_id": "hero-image",
  "message": "Remote image is not allowed by the active resource policy.",
  "recovery": "Download the image and place it under an allowed asset root."
}
```

`rule_id` 在 patch version 中保持语义稳定。最低规则族：

- identity missing/duplicate；
- kind ambiguous/unsupported；
- style unsupported；
- resource remote/missing/escaped；
- browser unavailable/crashed/timeout；
- font missing/fallback；
- raster fallback；
- geometry invalid/unstable；
- OOXML write/reopen failure；
- slide/element mapping closure failure。

### DH-P0-010：OOXML 自检与确定性

DeckHTML 返回成功前建议至少检查：

- ZIP/package 可重新解析；
- slide count/order 与输入一致；
- mapping record 的 object reference 可回查；
- identified text 可在对应 PPTX object 中找到；
- 是否存在整页 image；
- 是否存在未披露的 remote relationship；
- summary 可由 element records 重算；
- 相同输入在同一 engine/browser major 下两次运行产生 canonical-equivalent OOXML。

生成时间、ZIP entry timestamp 和绝对临时路径不应改变业务对象的顺序、名称、几何或文本。二进制完全一致可以作为更高目标，但最低要求是 canonical OOXML 结构等价。

### DH-P0-011：包、文档与发布质量

- README、CLI help、TypeScript types 与实际 flags/API 一致；
- 不再出现文档声明 flag、实际 Commander 未注册的情况；
- schemas、必要 runtime assets 和 contract examples 随 npm tarball 发布；
- package 带完整非空 LICENSE；
- 从 clean Git tag 由 CI 发布，npm metadata 可追溯到 commit；
- `npm pack` 后在全新目录执行 library/CLI smoke；
- Node、Playwright、PptxGenJS 支持矩阵明确；
- Linux、macOS、Windows 覆盖声明的 Node LTS；
- CLI `--json` 天然保持纯净 stdout，无需依赖额外 `--quiet` 才能解析。

## 4. 当前版本已确认的问题

基于 `@deckflow/deckhtml@0.3.1` 的只读检查和代表性 1920×1080 deck 实跑：

- 转换成功，OOXML 中包含可编辑的 text、shape 和 picture；
- 页面播放器的“← / → to navigate”被误导出；
- `body.page-bg` 被整页 screenshot；
- OOXML object name 使用自动编号，无法关联原 DOM 元素；
- `--json` 未配合 `--quiet` 时 stdout 被内部日志污染；
- CLI 缺少 browser executable override；
- 宿主已有 Chromium 与 Playwright revision 不一致时无法直接复用；
- local resource policy 仍可访问 HTTP/HTTPS；
- local CLI 的宽松资源选项缺少 asset-root containment；
- 默认使用持久化浏览器 profile；
- 输出直接写目标路径，缺少默认拒绝覆盖和 atomic write；
- README 声明的部分 flags 未在实际 Commander 中注册；
- npm tarball 中缺少完整 schemas、contract tests 和可用 LICENSE 内容。

这些问题不否定当前转换能力，但会限制 DeckHTML 在自动化、CI、高质量可编辑交付和安全本地处理场景中的采用。

## 5. 建议测试矩阵

### 5.1 正向 fixtures

- 简体中文、繁体中文、英文、日文、韩文；
- 多语种混排与 script-specific font mapping；
- text/rich text；
- image/object-fit/crop；
- shape/fill/border/rotation/opacity；
- table 与明确支持的 span；
- group 与 child identity；
- SVG vector；
- MathML；
- 多页顺序、z-order 和 page selector。

### 5.2 负向 fixtures

- 缺失、重复 identity；
- ambiguous element kind；
- missing asset、remote request、path/symlink escape；
- Canvas、chart、video、animation、filter、3D 和事实性 pseudo content；
- runtime navigation UI；
- browser missing/crash/timeout；
- output conflict；
- forced raster fallback；
- 损坏或无法重开的 OOXML。

### 5.3 建议的 strict-mode gates

- 所有声明了 identity 的 visible element 都有唯一 mapping record；
- `native + vector + raster + ignored + unsupported` 可重算；
- 配置 `allowRaster: false` 时成功结果 `raster = 0`；
- 配置 `allowUnsupported: false` 时成功结果 `unsupported = 0`；
- 无未披露 runtime UI、整页 image 或 remote relationship；
- 页数、顺序、文本和 object reference 闭合；
- text/image/shape/table/group 达到声明的编辑性；
- 五语种字体、换行、裁切和溢出通过 golden；
- 网络、文件系统、浏览器和输出副作用符合调用参数；
- machine stdout 与 JSON Schema 稳定；
- 两次运行 canonical OOXML 等价。

## 6. P1 增强项

P0 稳定后可以继续增强：

- 复杂 table 的 rowspan/colspan；
- 更完整的 SVG filter/gradient/vector 支持；
- native chart；
- font embedding，并提供字体授权提示；
- PowerPoint group 的更多 transform；
- PowerPoint、LibreOffice、Keynote 兼容性报告；
- 更细粒度的 text run、line break 与 fallback font 报告；
- PNG renderer 与 PPTX renderer 共用稳定的 page-selection contract；
- 性能 profile、并发和大批量转换基线。

## 7. 建议 Definition of Done

一次面向高质量自动化场景的 DeckHTML 升级，建议至少满足：

1. P0 十一项有明确实现或公开 limitation；
2. library API 不要求调用方解析人类日志；
3. 宽松模式保持一般网页的易用性；
4. strict 模式可以拒绝 raster、unsupported、remote resource 和 missing identity；
5. 逐元素 report 与最终 OOXML 对象闭合；
6. 浏览器、网络、资源根和文件输出可控；
7. 五语种、对象类型和负向 fixtures 通过；
8. package 来源、版本、LICENSE、types、schemas 和 tests 可追溯。

完成这些要求后，DeckHTML 将从“能够完成 HTML→PPTX 转换”提升为“适合被各种自动化系统可靠组合的通用 HTML→PPTX 基础组件”。
