# PageLingo

**让网页以两种语言展开。 / Read the web in two languages.**

`v0.2.0` · 单文件用户脚本 · Tampermonkey / ScriptCat

[简体中文](#简体中文) · [English](#english)

---

## 简体中文

PageLingo（双语网页翻译）是一个面向 Microsoft Edge 的单文件用户脚本，支持 Tampermonkey（油猴）和 ScriptCat（脚本猫）。

点击页面边缘的「译」按钮，即可在原文下方显示中文译文；再次点击恢复原文。脚本会尽量保留原有的链接、排版和页面交互。

当前版本：`0.2.0`。直接查看安装文件：[edge-translator.user.js](edge-translator.user.js)。

### v0.2.0 主要更新

- **通用文本块识别**：按实际布局寻找叶子文本块，不再只处理 `p / li / h1`，可覆盖 `div`、`span`、`section`、自定义元素和短文本。
- **减少漏词**：相邻链接、inline-block 小标签、带嵌套列表的段落和混合块会合并提取，避免只翻到一半。
- **排版更稳**：flex / grid 容器中的译文换到独立行；原文节点、链接和交互保持不变。
- **DeepL 可选接口**：填入免费版 API Key 后可作为高质量接口；默认仍使用免 Key 的微软接口。
- **质量优先回退**：MyMemory 不再默认自动兜底，只有勾选「允许 MyMemory 低质量兜底」才会使用。
- **全页模式**：需要翻译导航、页脚和侧栏时可手动开启，默认只处理正文以避免破坏页面。

### 安装

1. 在 Edge 扩展商店安装 Tampermonkey 或 ScriptCat。
2. 如果扩展详情页出现「允许用户脚本」开关，将其打开。
3. 打开 [edge-translator.user.js](edge-translator.user.js)，点击 **Raw**，由脚本管理器接管安装；也可以新建脚本，把全部内容粘贴进去后保存。
4. 打开任意网页，第一次翻译时脚本管理器会请求跨域权限，请允许：
   - `edge.microsoft.com`（默认免费接口）
   - `api-free.deepl.com` / `api.deepl.com`（配置 DeepL 时）
   - `translate.googleapis.com`（自动回退或手动选择 Google 时）
   - `api.mymemory.translated.net`（启用低质量兜底时）

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

### 翻译接口与质量

| 接口 | 费用/门槛 | 用途和说明 |
| --- | --- | --- |
| 微软 Edge 网页翻译 | 免 Key | 默认主接口，自动识别源语言，支持批量请求 |
| DeepL | 免费版每月约 50 万字符，需要注册 Key | 可选高质量接口；Key 以 `:fx` 结尾时自动使用免费端点 |
| Google 网页翻译 | 免 Key | 自动回退/手动可选；部分网络环境无法连接 |
| MyMemory | 免 Key，匿名额度约每天 5000 字符 | 质量较低，默认不自动兜底，需手动选择或勾选低质量兜底 |

默认自动顺序为 **微软 → DeepL（配置 Key 后）→ Google**。MyMemory 默认不参与自动回退，避免在用户不知情时把整页译文降级。在面板中可以固定接口，也可以关闭自动回退。

这些接口使用的是网页前端端点，不是有 SLA 承诺的官方开发者 API，可能随时调整或失效。脚本已经隔离适配器、校验响应格式，并提供手动切换和失败重试；但不能保证长期可用。

#### 配置 DeepL 免费 Key（可选）

1. 在 DeepL 官网申请 API 免费版 Key（通常以 `:fx` 结尾）。
2. 打开脚本面板，在「DeepL 高质量接口」中填入 Key。
3. 在「接口」中选择 DeepL；也可以保留自动选择，让 DeepL 作为微软失败后的回退。

Key 只保存在脚本管理器本地存储中，只会发送给 DeepL 官方端点。免费额度、账户资格和接口可用性以 DeepL 官方为准。

### 覆盖模式

- **正文模式（默认）**：扫描页面主体，跳过导航、页脚、侧栏、按钮、菜单、代码块和表单控件，布局最稳。
- **全页模式（实验）**：在面板中勾选「全页模式」，额外翻译导航、页脚和侧栏文字；部分网站的顶部栏布局可能发生变化。
- 无论哪种模式，原文节点都保持原位，恢复时只移除脚本插入的译文节点。

### 稳定性设计

- **通用文本块识别**：根据实际布局寻找叶子文本块，覆盖 `div`、`span`、`section` 和自定义元素；跳过 `pre`、`code`、按钮、表单控件、密码框、`contenteditable`、`translate="no"`、导航和页脚。需要时可在面板开启全页模式。
- **可见区域优先**：使用 `IntersectionObserver`，先翻译视口上下约 700px 的内容，滚动后再继续。
- **批量与限速**：微软/DeepL 每批最多 8 段、约 3000 字符合并；同接口两次请求至少间隔 800ms；单个请求 8 秒超时。
- **尝试预算**：同一批次最多 3 次接口尝试，包含重试和接口回退；长文本按接口能力分片时，分片请求不计入额外尝试，但受相同的接口间隔和超时约束。
- **错误处理**：网络错误/5xx 重试一次；429 尊重 `Retry-After` 并冷却；401/403、协议异常会暂停对应接口；连续失败自动熔断；DeepL 额度用尽（HTTP 456）暂停 1 小时。
- **质量优先**：默认自动回退不包含 MyMemory；低质量兜底必须由用户显式开启。
- **排版保护**：flex / grid 容器中的译文换到独立行；相邻链接和块边界会补空格后再送入翻译，避免 `HomeDocsAbout` 这类拼接错误。
- **缓存与去重**：内存 LRU 缓存最多约 1000 条或 2 MiB；相同原文不会重复请求；缓存按目标语言隔离。
- **页面安全**：原文节点保持原位，只追加纯文本译文节点；译文只通过 `textContent` 写入，避免把接口内容当 HTML 执行。
- **动态页面**：`MutationObserver` 合并新增内容后增量扫描；SPA 路由变化时取消旧任务并重新扫描；渲染前校验任务代次、节点连接状态和原文指纹，防止旧译文贴到新内容。
- **内容变化保护**：同一段内容在 30 秒内频繁变化超过 3 次时暂停自动重译，避免与实时更新页面互相拉扯。
- **后台标签**：页面不可见时暂停新的请求，回到前台后继续。

### 隐私

- 只发送当前需要翻译的文本，不上传整页 HTML、页面地址、账号信息或 Cookie。
- 密码框、输入框、可编辑区域和代码块不会自动进入翻译队列。
- DeepL Key 只保存在脚本管理器存储中，不写入网页存储，不进入日志。
- 译文缓存只保存在当前页面内存中，刷新即清空；设置保存在脚本管理器本地存储。
- 脚本没有统计、上报或远程配置功能。

### 已知限制

- 不在真实 Tampermonkey / ScriptCat 中完成安装验收前，不建议直接用于依赖精确排版的工作页面。
- 不支持 PDF 阅读器、图片/Canvas 内文字、OCR、视频字幕、跨域 iframe，以及 Shadow DOM 组件内部文本（开放式和封闭式均暂未遍历）。
- 只处理顶层页面（`@noframes`）；严格 CSP 网站可能阻止页面样式或脚本注入。
- 免费接口可能限流、变更或在特定网络不可达；Google 在当前网络环境测试时连接超时，自动回退到它时可能等待超时。
- DeepL 需要用户自己的 API Key；脚本不会创建或升级 DeepL 付费账户。
- 全页模式、大型单页应用、虚拟列表和频繁改写的页面可能需要站点级排除规则；当前版本没有图形化的站点规则编辑器。
- 多标签页同时翻译时，各标签页独立限流；不会造成单页请求风暴，但不是全局配额管理。

### 验证记录

2026-10-22，在本机做过的检查：

- 微软真实接口：POST 批量英文文本，HTTP 200，返回对应中文；`from=` 留空可自动识别语言。
- MyMemory 真实接口：HTTP 200，`autodetect|zh-CN` 可用。
- Google 端点：当前命令行网络连接超时；保留为回退/手动选项，不保证当前网络可达。
- headless Edge + 模拟 `GM_xmlhttpRequest`（v0.2 夹具）：
  - 普通 `div` 文本、span 拼接、卡片、表格单元格、自定义元素和短文本均能翻译；
  - 内联链接、inline-block 标签、混合块和嵌套列表不漏词；
  - 代码、按钮、`translate="no"`、隐藏节点、表单输入和可编辑区被跳过；
  - flex 行的译文换行显示，不挤在原文同一行；
  - 连续翻译/恢复后无残留译文，缓存命中后不再请求；
  - 动态新增通用块可自动翻译，已翻译块文字更新可自动重译；
  - DeepL 模拟接口验证了请求体、批量响应解析和状态显示；
  - 微软/Google 都失败时不调用 MyMemory，勾选低质量兜底后才回退；
  - 2000 个文本块首次扫描约 60ms（本机 headless 环境）。
- 尚未在真实 Tampermonkey / ScriptCat 扩展中完成安装、权限和升级验收，也尚未用真实 DeepL Key 调用；这是发布前剩余的人工测试。

### 实现说明

为了安装和分发简单，v0.2.0 使用单个 `.user.js` 文件，不依赖构建工具。文件内按“设置 / 请求 / 接口适配 / 提取 / 调度 / 渲染 / 界面”分段组织，后续如果继续扩展站点规则或接口，可以再拆分源码和构建流程。

接口协议和页面处理的思路参考了以下公开项目，代码为本项目独立实现：

- [fishjar/kiss-translator](https://github.com/fishjar/kiss-translator)：微软免 Key 协议、双语阅读和站点规则思路（GPL-3.0）
- [FilipePS/Traduzir-paginas-web](https://github.com/FilipePS/Traduzir-paginas-web)：请求合并、缓存、增量 DOM 处理思路（MPL-2.0）

本项目代码采用 MIT 许可证。

---

## English

PageLingo (Bilingual Web Page Translation) is a single-file userscript for Microsoft Edge. It works with Tampermonkey and ScriptCat.

Click the **译** button at the edge of a page to add Chinese translations below the original text. Click it again to restore the original page. PageLingo preserves links, layout, and page interactions as much as possible.

Current version: `0.2.0`. View the userscript file: [edge-translator.user.js](edge-translator.user.js).

### What's new in 0.2.0

- **Generic text-block detection**: finds leaf text blocks based on rendered layout instead of a fixed tag list, covering `div`, `span`, `section`, custom elements, and short text.
- **Fewer gaps**: adjacent links, inline-block badges, nested-list parents, and mixed blocks are grouped so a sentence is less likely to be left half-translated.
- **Safer layout**: translations inside flex/grid containers move to their own row; original nodes, links, and interactions are preserved.
- **Optional DeepL**: add a DeepL Free API key for higher translation quality; Microsoft remains the default keyless provider.
- **Quality-first fallback**: MyMemory is no longer used silently. It is only used when **Allow low-quality MyMemory fallback** is enabled.
- **Full-page mode**: optionally include navigation, footers, and sidebars; the default content mode avoids breaking page chrome.

### Installation

1. Install Tampermonkey or ScriptCat from the Edge Add-ons store.
2. If the extension details page shows an **Allow user scripts** switch, turn it on.
3. Open [edge-translator.user.js](edge-translator.user.js) and click **Raw** to let your userscript manager install it. Alternatively, create a new script and paste the full file contents into it.
4. On the first translation, your userscript manager will ask for cross-origin permissions. Allow:
   - `edge.microsoft.com` (default keyless provider)
   - `api-free.deepl.com` / `api.deepl.com` (when DeepL is configured)
   - `translate.googleapis.com` (automatic fallback or manual Google)
   - `api.mymemory.translated.net` (when low-quality fallback is enabled)

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

### Translation providers and quality

| Provider | Cost / requirements | Role and notes |
| --- | --- | --- |
| Microsoft Edge web translation | Keyless | Default primary provider; automatic source detection; batched requests |
| DeepL | Free tier around 500k characters/month; API key required | Optional high-quality provider; keys ending in `:fx` use the free endpoint automatically |
| Google web translation | Keyless | Automatic fallback / manual option; unreachable on some networks |
| MyMemory | Keyless; about 5,000 anonymous characters/day | Lower quality; not used automatically unless **Allow low-quality MyMemory fallback** is enabled |

The default automatic order is **Microsoft → DeepL (if configured) → Google**. MyMemory is excluded from automatic fallback by default so a page is never silently downgraded. You can pin a provider or disable automatic fallback in the panel.

These providers are web frontend endpoints, not official developer APIs with an SLA. They may change or stop working at any time. PageLingo isolates the adapters, validates response formats, and provides manual switching and retries, but cannot guarantee long-term availability.

#### Configure a DeepL Free key (optional)

1. Request a DeepL API Free key (usually ending in `:fx`).
2. Open the PageLingo panel and paste it into **DeepL high-quality API**.
3. Select DeepL under **Provider**, or leave the provider on automatic so DeepL can act as a fallback after Microsoft.

The key is stored only in the userscript manager's local storage and is sent only to DeepL's official endpoint. Quota, eligibility, and availability are governed by DeepL.

### Coverage modes

- **Content mode (default)**: scans page content and skips navigation, footers, sidebars, buttons, menus, code blocks, and form controls. This is the safest layout choice.
- **Full-page mode (experimental)**: enable **Full-page mode** in the panel to also translate navigation, footers, and sidebars. Some site headers or menus may change layout.
- In both modes, original nodes stay in place; restoring removes only translation nodes created by PageLingo.

### Reliability and safety design

- **Generic block detection**: find leaf text blocks from rendered layout, covering `div`, `span`, `section`, and custom elements; skip `pre`, `code`, buttons, form controls, password fields, `contenteditable`, `translate="no"`, navigation, and footers. Full-page mode can include page chrome when needed.
- **Viewport first**: use `IntersectionObserver` to translate content within roughly 700px above and below the viewport, then continue on scroll.
- **Batching and rate limiting**: Microsoft/DeepL batches up to 8 segments and about 3,000 characters; consecutive requests to the same provider are at least 800ms apart; each request times out after 8 seconds.
- **Attempt budget**: each batch gets at most 3 provider attempts, including retries and fallback. Requests split from a long text do not count as additional attempts, but follow the same request interval and timeout rules.
- **Error handling**: retry network errors and 5xx once; honor `Retry-After` on 429 and cool down; pause a provider after 401/403 or protocol errors; trip a circuit breaker after repeated failures; cool down for one hour when the DeepL quota is exhausted (HTTP 456).
- **Quality first**: MyMemory is excluded from automatic fallback unless the user enables low-quality fallback explicitly.
- **Layout protection**: translations inside flex/grid containers move to a separate row; spaces are inserted at link and block boundaries before translation to avoid `HomeDocsAbout`-style input errors.
- **Cache and deduplication**: an in-memory LRU cache holds about 1,000 entries or 2 MiB; identical source text is not requested twice; cache keys are isolated by target language.
- **Page safety**: original nodes stay in place; only plain-text translation nodes are appended; translations are written with `textContent` only, so provider output is never executed as HTML.
- **Dynamic pages**: `MutationObserver` batches new content for incremental scanning; SPA route changes cancel old jobs and trigger a rescan; generation, node connectivity, and source fingerprints are checked before rendering so stale translations do not attach to new content.
- **Content change protection**: if the same block changes more than 3 times within 30 seconds, automatic re-translation pauses to avoid fighting a live-updating page.
- **Background tabs**: new requests pause while the page is hidden and resume when it becomes visible again.

### Privacy

- Only the text that needs translation is sent. Full-page HTML, page URLs, account information, and cookies are not uploaded.
- Password fields, input fields, editable areas, and code blocks do not enter the translation queue automatically.
- A DeepL key is stored only in the userscript manager's storage, not in page storage or logs.
- Translation cache lives only in page memory and is cleared on refresh. Settings are stored in the userscript manager's local storage.
- The script contains no analytics, reporting, or remote configuration.

### Known limitations

- Installation, permissions, and upgrade flows have not yet been accepted in real Tampermonkey / ScriptCat extensions. Until that validation is complete, PageLingo is not recommended for work pages that depend on precise layout.
- PDF readers, text inside images or Canvas, OCR, video subtitles, cross-origin iframes, and text inside Shadow DOM components (neither open nor closed shadow roots are traversed) are not supported.
- Only the top-level page is processed (`@noframes`). Sites with strict CSP may block injected page styles or scripts.
- Free providers may rate-limit, change, or become unreachable on some networks. Google timed out in the current test environment, so automatic fallback to Google may wait for a timeout.
- DeepL requires your own API key; PageLingo does not create or upgrade paid DeepL accounts.
- Full-page mode, large single-page apps, virtualized lists, and frequently rewritten pages may need site-level exclusion rules. There is no graphical site-rule editor in the current version.
- When several tabs translate at once, each tab rate-limits independently. This avoids request storms within one page, but is not a global quota manager.

### Verification notes

Checks performed locally on 2026-10-22:

- Microsoft production endpoint: batch English text in a POST returned HTTP 200 with matching Chinese translations; leaving `from=` empty detected the source language.
- MyMemory production endpoint: HTTP 200; `autodetect|zh-CN` worked.
- Google endpoint: the network connection timed out from the current command-line environment. It remains a fallback/manual option and is not guaranteed on this network.
- Headless Edge with a simulated `GM_xmlhttpRequest` (v0.2 fixture):
  - Plain `div` text, span-only text, cards, table cells, custom elements, and short text were translated;
  - Inline links, inline-block badges, mixed blocks, and nested lists did not lose text;
  - Code, buttons, `translate="no"`, hidden nodes, form inputs, and editable areas were skipped;
  - Flex-row translations moved to their own line;
  - Translate/restore cycles left no orphan nodes; cache hits made no new requests;
  - Dynamically inserted generic blocks and changed translated text were handled;
  - DeepL request/response handling and provider status were verified against a simulated endpoint;
  - When Microsoft and Google both failed, MyMemory was not called; it was used only after low-quality fallback was enabled;
  - First scan of 2,000 text blocks took about 60ms in the local headless environment.
- Installation, permission, and upgrade acceptance in real Tampermonkey / ScriptCat extensions is still pending, and DeepL has not been tested with a real key. These remain the required manual tests before release.

### Implementation notes

To keep installation and distribution simple, v0.2.0 is a single `.user.js` file with no build step. The file is organized into settings, requests, provider adapters, extraction, scheduling, rendering, and UI sections. If site rules or providers grow, the source and build process can be split later.

The protocol and page-processing approach were informed by the following open-source projects. The implementation here is independent:

- [fishjar/kiss-translator](https://github.com/fishjar/kiss-translator): Microsoft keyless protocol, bilingual reading, and site-rule ideas (GPL-3.0)
- [FilipePS/Traduzir-paginas-web](https://github.com/FilipePS/Traduzir-paginas-web): request coalescing, caching, and incremental DOM ideas (MPL-2.0)

This project is licensed under the MIT License.

---

**PageLingo** · Made for focused, bilingual reading.
