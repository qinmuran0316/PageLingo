# PageLingo

**让网页以两种语言展开。 / Read the web in two languages.**

`v0.1.0` · 单文件用户脚本 · Tampermonkey / ScriptCat

[简体中文](#简体中文) · [English](#english)

---

## 简体中文

PageLingo（双语网页翻译）是一个面向 Microsoft Edge 的单文件用户脚本，支持 Tampermonkey（油猴）和 ScriptCat（脚本猫）。

点击页面边缘的「译」按钮，即可在原文下方显示中文译文；再次点击恢复原文。脚本会尽量保留原有的链接、排版和页面交互。

当前版本：`0.1.0`。直接查看安装文件：[edge-translator.user.js](edge-translator.user.js)。

### 安装

1. 在 Edge 扩展商店安装 Tampermonkey 或 ScriptCat。
2. 如果扩展详情页出现「允许用户脚本」开关，将其打开。
3. 打开 [edge-translator.user.js](edge-translator.user.js)，点击 **Raw**，由脚本管理器接管安装；也可以新建脚本，把全部内容粘贴进去后保存。
4. 打开任意网页，第一次翻译时脚本管理器会请求跨域权限，请允许：
   - `edge.microsoft.com`（默认接口）
   - `api.mymemory.translated.net`（备用接口）
   - 只有手动选择 Google 时才需要 `translate.googleapis.com`

安装后页面右下角会出现蓝色「译」按钮。按钮可以拖动，位置会被记住。

### 使用

| 操作 | 说明 |
| --- | --- |
| 点击「译」 | 翻译当前屏幕附近的内容，滚动后继续翻译 |
| 再次点击「译」 | 恢复原文，只删除脚本插入的译文节点 |
| 点击按钮打开面板 | 选择接口、目标语言、站点自动翻译、禁用网站等 |
| 选中文字 | 出现小「译」按钮，点击后翻译选中内容，可复制结果 |
| `Alt+T` | 翻译 / 恢复当前页面 |
| `Alt+O` | 打开设置面板 |
| 脚本管理器菜单 | 翻译、打开设置、切换本网站启用状态、清除缓存 |

快捷键可以在面板的「快捷键与维护」中修改。

### 免费翻译接口

| 接口 | 默认用途 | 说明 |
| --- | --- | --- |
| 微软 Edge 网页翻译 | 主接口 | 不需要 Key，自动识别源语言，支持批量请求 |
| MyMemory | 自动回退 | 不需要 Key，匿名额度约每天 5000 字符，质量低于微软 |
| Google 网页翻译 | 手动可选 | 不需要 Key，但部分网络环境无法连接，因此未放入默认回退顺序 |

默认自动顺序为 **微软 → MyMemory**。在面板中可以选择固定接口，也可以关闭自动回退。

这些接口使用的是网页前端端点，不是有 SLA 承诺的官方开发者 API，可能随时调整或失效。脚本已经隔离适配器、校验响应格式，并提供手动切换和失败重试；但不能保证长期可用。

### 稳定性设计

- **只翻译需要的内容**：优先扫描 `main`、`article` 等正文区域，跳过 `pre`、`code`、表单、密码框、`contenteditable`、`translate="no"`、导航和页脚。
- **可见区域优先**：使用 `IntersectionObserver`，先翻译视口上下约 700px 的段落，滚动后再继续。
- **批量与限速**：微软接口按最多 8 段、约 3000 字符合并；同接口两次请求至少间隔 800ms；单个请求 8 秒超时。
- **尝试预算**：同一批次最多 3 次接口尝试，包含重试和接口回退；长文本按接口能力分片时，分片请求不计入额外尝试，但受相同的接口间隔和超时约束。
- **错误处理**：网络错误/5xx 重试一次；429 尊重 `Retry-After` 并冷却；401/403、协议异常会暂停对应接口；连续失败会自动熔断。
- **缓存与去重**：内存 LRU 缓存最多约 1000 条或 2 MiB；相同原文不会重复请求；缓存按目标语言隔离。
- **页面安全**：原文节点保持原位，只追加纯文本译文节点；译文只通过 `textContent` 写入，避免把接口内容当 HTML 执行。
- **动态页面**：`MutationObserver` 合并新增内容后增量扫描；SPA 路由变化时取消旧任务并重新扫描；渲染前校验任务代次、节点连接状态和原文指纹，防止旧译文贴到新内容。
- **内容变化保护**：同一段内容在 30 秒内频繁变化超过 3 次时暂停自动重译，避免与实时更新页面互相拉扯。
- **后台标签**：页面不可见时暂停新的请求，回到前台后继续。

### 隐私

- 只发送当前需要翻译的段落文本，不上传整页 HTML、页面地址、账号信息或 Cookie。
- 密码框、输入框、可编辑区域和代码块不会自动进入翻译队列。
- 译文缓存只保存在当前页面内存中，刷新即清空；设置保存在脚本管理器本地存储。
- 脚本没有统计、上报或远程配置功能。

### 已知限制

- 不在真实 Tampermonkey / ScriptCat 中完成安装验收前，不建议直接用于依赖精确排版的工作页面。
- 不支持 PDF 阅读器、图片/Canvas 内文字、OCR、视频字幕、跨域 iframe，以及 Shadow DOM 组件内部文本（开放式和封闭式均暂未遍历）。
- 只处理顶层页面（`@noframes`）；严格 CSP 网站可能阻止页面样式或脚本注入。
- 免费接口可能限流、变更或在特定网络不可达；Google 在当前网络环境测试时连接超时，因此默认不启用。
- 大型单页应用、虚拟列表和频繁改写的页面可能需要站点级排除规则；当前版本没有图形化的站点规则编辑器。
- 多标签页同时翻译时，各标签页独立限流；不会造成单页请求风暴，但不是全局配额管理。

### 验证记录

2026-10-22，在本机做过的检查：

- 微软真实接口：POST 批量英文文本，HTTP 200，返回对应中文；`from=` 留空可自动识别语言。
- MyMemory 真实接口：HTTP 200，`autodetect|zh-CN` 可用。
- Google 端点：当前命令行网络连接超时；保留为手动选项，未作为默认可达接口宣传。
- headless Edge + 模拟 `GM_xmlhttpRequest`：
  - 桌面和窄屏视口下按钮、面板、译文布局正常；
  - 段落、列表、表格、引用、链接内联文本可翻译，代码/导航/页脚/编辑区被跳过；
  - 连续翻译/恢复 3 轮无重复或残留译文节点；
  - 缓存命中后不再发请求，状态计数正确；
  - 划词气泡、结果卡片和复制可用；
  - 动态插入段落和已翻译段落文本更新可自动重译；
  - 429 后自动切换 MyMemory，并在冷却期内跳过故障接口；
  - 全部接口失败后可显示失败状态并通过「重试失败段落」恢复；
  - 页面隐藏时暂停请求；恢复原文会取消在途页面请求。
- 尚未在真实 Tampermonkey / ScriptCat 扩展中完成安装、权限和升级验收；这是发布前剩余的必要人工测试。

### 实现说明

为了安装和分发简单，v0.1.0 使用单个 `.user.js` 文件，不依赖构建工具。文件内按“设置 / 请求 / 接口适配 / 提取 / 调度 / 渲染 / 界面”分段组织，后续如果继续扩展站点规则或接口，可以再拆分源码和构建流程。

接口协议和页面处理的思路参考了以下公开项目，代码为本项目独立实现：

- [fishjar/kiss-translator](https://github.com/fishjar/kiss-translator)：微软免 Key 协议、双语阅读和站点规则思路（GPL-3.0）
- [FilipePS/Traduzir-paginas-web](https://github.com/FilipePS/Traduzir-paginas-web)：请求合并、缓存、增量 DOM 处理思路（MPL-2.0）

本项目代码采用 MIT 许可证。

---

## English

PageLingo (Bilingual Web Page Translation) is a single-file userscript for Microsoft Edge. It works with Tampermonkey and ScriptCat.

Click the **译** button at the edge of a page to add Chinese translations below the original text. Click it again to restore the original page. PageLingo preserves links, layout, and page interactions as much as possible.

Current version: `0.1.0`. View the userscript file: [edge-translator.user.js](edge-translator.user.js).

### Installation

1. Install Tampermonkey or ScriptCat from the Edge Add-ons store.
2. If the extension details page shows an **Allow user scripts** switch, turn it on.
3. Open [edge-translator.user.js](edge-translator.user.js) and click **Raw** to let your userscript manager install it. Alternatively, create a new script and paste the full file contents into it.
4. On the first translation, your userscript manager will ask for cross-origin permissions. Allow:
   - `edge.microsoft.com` (default provider)
   - `api.mymemory.translated.net` (fallback provider)
   - `translate.googleapis.com` only if you select Google manually

After installation, a blue **译** button appears in the bottom-right corner of the page. You can drag it to a new position; its position is remembered.

### Usage

| Action | Description |
| --- | --- |
| Click **译** | Translate content near the current viewport and continue as you scroll |
| Click **译** again | Restore the original page by removing only the translation nodes added by the script |
| Open the panel from the button | Choose a provider, target language, site-level auto-translation, or disable the site |
| Select text | A small **译** button appears; click it to translate the selection and copy the result |
| `Alt+T` | Translate / restore the current page |
| `Alt+O` | Open the settings panel |
| Userscript manager menu | Translate, open settings, toggle the current site, clear cache |

You can change the shortcuts under **Shortcuts & Maintenance** in the panel.

### Free translation providers

| Provider | Default role | Notes |
| --- | --- | --- |
| Microsoft Edge web translation | Primary | No key required; detects the source language automatically; supports batched requests |
| MyMemory | Automatic fallback | No key required; anonymous quota is about 5,000 characters per day; lower quality than Microsoft |
| Google web translation | Manual option | No key required, but unreachable in some networks; not part of the default fallback chain |

The default fallback order is **Microsoft → MyMemory**. You can pin a provider in the panel or disable automatic fallback.

These providers are web frontend endpoints, not official developer APIs with an SLA. They may change or stop working at any time. PageLingo isolates the adapters, validates response formats, and provides manual switching and retries, but cannot guarantee long-term availability.

### Reliability and safety design

- **Translate only what is needed**: prioritize `main`, `article`, and similar content areas; skip `pre`, `code`, forms, password fields, `contenteditable`, `translate="no"`, navigation, and footers.
- **Viewport first**: use `IntersectionObserver` to translate content within roughly 700px above and below the viewport, then continue on scroll.
- **Batching and rate limiting**: the Microsoft provider batches up to 8 segments and about 3,000 characters; consecutive requests to the same provider are at least 800ms apart; each request times out after 8 seconds.
- **Attempt budget**: each batch gets at most 3 provider attempts, including retries and fallback. Requests split from a long text do not count as additional attempts, but follow the same request interval and timeout rules.
- **Error handling**: retry network errors and 5xx once; honor `Retry-After` on 429 and cool down; pause a provider after 401/403 or protocol errors; trip a circuit breaker after repeated failures.
- **Cache and deduplication**: an in-memory LRU cache holds about 1,000 entries or 2 MiB; identical source text is not requested twice; cache keys are isolated by target language.
- **Page safety**: original nodes stay in place; only plain-text translation nodes are appended; translations are written with `textContent` only, so provider output is never executed as HTML.
- **Dynamic pages**: `MutationObserver` batches new content for incremental scanning; SPA route changes cancel old jobs and trigger a rescan; generation, node connectivity, and source fingerprints are checked before rendering so stale translations do not attach to new content.
- **Content change protection**: if the same block changes more than 3 times within 30 seconds, automatic re-translation pauses to avoid fighting a live-updating page.
- **Background tabs**: new requests pause while the page is hidden and resume when it becomes visible again.

### Privacy

- Only the text that needs translation is sent. Full-page HTML, page URLs, account information, and cookies are not uploaded.
- Password fields, input fields, editable areas, and code blocks do not enter the translation queue automatically.
- Translation cache lives only in page memory and is cleared on refresh. Settings are stored in the userscript manager's local storage.
- The script contains no analytics, reporting, or remote configuration.

### Known limitations

- Installation, permissions, and upgrade flows have not yet been accepted in real Tampermonkey / ScriptCat extensions. Until that validation is complete, PageLingo is not recommended for work pages that depend on precise layout.
- PDF readers, text inside images or Canvas, OCR, video subtitles, cross-origin iframes, and text inside Shadow DOM components (neither open nor closed shadow roots are traversed) are not supported.
- Only the top-level page is processed (`@noframes`). Sites with strict CSP may block injected page styles or scripts.
- Free providers may rate-limit, change, or become unreachable on some networks. Google timed out in the current test environment, so it is not enabled by default.
- Large single-page apps, virtualized lists, and frequently rewritten pages may need site-level exclusion rules. There is no graphical site-rule editor in the current version.
- When several tabs translate at once, each tab rate-limits independently. This avoids request storms within one page, but is not a global quota manager.

### Verification notes

Checks performed locally on 2026-10-22:

- Microsoft production endpoint: batch English text in a POST returned HTTP 200 with matching Chinese translations; leaving `from=` empty detected the source language.
- MyMemory production endpoint: HTTP 200; `autodetect|zh-CN` worked.
- Google endpoint: the network connection timed out from the current command-line environment. It remains a manual option and is not advertised as a reachable default.
- Headless Edge with a simulated `GM_xmlhttpRequest`:
  - Button, panel, and translation layout rendered correctly at desktop and narrow viewports;
  - Paragraphs, lists, tables, blockquotes, and inline link text were translated; code, navigation, footers, and editable areas were skipped;
  - Three consecutive translate/restore cycles left no duplicate or orphan translation nodes;
  - Cache hits made no new requests and status counts were correct;
  - The selection bubble, result card, and copy action worked;
  - Dynamically inserted paragraphs and text updates in translated paragraphs were retranslated;
  - After a 429, the script switched to MyMemory and skipped the failing provider during its cooldown;
  - When all providers failed, the failure state appeared and **Retry failed paragraphs** recovered;
  - Requests paused while the page was hidden; restoring the original page cancelled in-flight page requests.
- Installation, permission, and upgrade acceptance in real Tampermonkey / ScriptCat extensions is still pending. This remains the required manual test before release.

### Implementation notes

To keep installation and distribution simple, v0.1.0 is a single `.user.js` file with no build step. The file is organized into settings, requests, provider adapters, extraction, scheduling, rendering, and UI sections. If site rules or providers grow, the source and build process can be split later.

The protocol and page-processing approach were informed by the following open-source projects. The implementation here is independent:

- [fishjar/kiss-translator](https://github.com/fishjar/kiss-translator): Microsoft keyless protocol, bilingual reading, and site-rule ideas (GPL-3.0)
- [FilipePS/Traduzir-paginas-web](https://github.com/FilipePS/Traduzir-paginas-web): request coalescing, caching, and incremental DOM ideas (MPL-2.0)

This project is licensed under the MIT License.

---

**PageLingo** · Made for focused, bilingual reading.
