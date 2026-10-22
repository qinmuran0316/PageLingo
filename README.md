# PageLingo

**让网页以两种语言展开。 / Read the web in two languages.**

`v0.9.0` · 单文件用户脚本 · Tampermonkey / ScriptCat

[简体中文](#简体中文) · [English](#english)

---

## 简体中文

PageLingo（双语网页翻译）是一个面向 Microsoft Edge 的单文件用户脚本，支持 Tampermonkey（油猴）和 ScriptCat（脚本猫）。

点击页面边缘的「译」按钮，即可翻译网页，默认只显示中文译文；取消「仅显示译文」可恢复双语对照，再次点击按钮恢复原文。

当前版本：`0.9.0`。直接查看安装文件：[edge-translator.user.js](edge-translator.user.js)。

### v0.9.0：补齐 Markdown、README 和行内代码

- Markdown 正文、README 文件名、版本号和带标点的句子进入统一批量翻译。
- 行内 `<code>`、`<kbd>` 和 `<samp>` 使用保护占位符，翻译上下文完整，命令、路径和版本号在译文中按原样恢复。
- 翻译只在整批结果准备好后显示，代码、链接、图标和表单仍保持可用；停止翻译会完整还原页面。

> 从 v0.1 升级：v0.2 的脚本名称和 `@namespace` 已改为 PageLingo。安装前请先在 Tampermonkey / ScriptCat 中禁用或删除旧的「双语网页翻译（Edge）」脚本，避免管理器里保留两份。v0.2 已加入 `@updateURL`，之后可在脚本管理器中检查更新。

### v0.8.0：补齐导航、短词和界面提示

- **减少漏译**：导航、侧栏、按钮、菜单、标签页、单字母短标签，以及大段落前后的零散文字均纳入提取；中文页面中的英文、日文和韩文不再因页面语言标记而被跳过。
- **界面提示也能翻译**：覆盖搜索框/文本框的占位提示、悬停提示、图标按钮的无障碍标签、图片替代文字、提交按钮文字和下拉选项。输入内容、密码、选项提交值、代码和可编辑区保持原样。
- **动态内容继续补齐**：展开菜单、更新搜索提示或改变下拉选项后继续翻译；隐藏区域在显示后处理。网站在请求期间改写原文时，不用旧译文覆盖新内容。
- **保留批量速度**：界面提示与正文共用批量队列、去重、缓存和统一显示；关闭强制整页时，它们也遵守大页面只翻译当前屏幕的范围。
- **控件排版与还原**：导航链接和按钮的译文保持紧凑显示，保留按钮图标；仅译文模式保留代码及明确不翻译的部分，恢复时还原节点顺序和属性。

### v0.7.2：默认开启强制整页

- 接口默认为「微软（免费推荐）」，目标语言为「简体中文」。
- 默认开启「允许 MyMemory 低质量兜底」「强制整页（含导航/侧栏）」「仅显示译文」「划词翻译」。
- 默认关闭「接口失败时自动回退」「悬停译文显示原文」「本地保存译文缓存」「本网站自动翻译」「禁用本网站」。
- 已保存的设置会保留。自动回退关闭时，MyMemory 不会作为备用接口被调用；本地缓存关闭时仍可在当前页面复用内存缓存。

### v0.7.0：Google 真批量、自动择快、刷新复用

- **普通页面一次处理整页**：不超过 160 个候选文本块且约 32000 字符时，先收集整页正文，再集中提交，无需滚动触发下方内容。
- **大页面只处理当前屏幕**：超过任一阈值后只提交视口内的文字；滚动后集中翻译新出现的内容，避免屏幕外的段落占用请求。
- **译文一起出现**：同一轮的全部批次完成后，在一个动画帧内统一显示；仅译文模式也等结果就绪后再隐藏原文。接口失败时保留原文，并显示成功部分。
- **Google 真正批量**：改为 POST 多个 `q` 字段，单批最多 128 段、约 24000 字符，不再逐段 GET 或每 600 字符拆一次。微软批量不变，DeepL 仍为 50 段；413/414 后缩小批次。
- **自动择快**：自动模式先用当前页面上次成功的免费线路，450ms 未完成时启动另一条微软/Google 线路，使用先完成的有效结果并取消另一条；快速成功时不会启动备用请求。DeepL 不参与竞速，只在失败后兜底；固定接口保持用户选择。
- **刷新复用**：开启「本地保存译文缓存」后，在脚本管理器本地保存最多约 1000 条/2 MiB 译文，7 天到期。刷新或重新打开页面可直接复用；面板可关闭或清除，不降级存入网站的 localStorage。
- **操作直接**：单击“译”立即翻译/恢复，右键打开设置；双语/仅译文切换直接复用现有节点，不重扫、不重发请求；可在面板开启悬停译文显示原文。
- **对比实测**：与 v0.6.0 各交替运行 3 次，在每次 600ms 的模拟网络下，Google 24 段从 24 次请求、约 9.85 秒降为 1 次、约 0.62 秒。真实 Google POST 120 段已返回 HTTP 200 和完整译文，单次约 3.9 秒。模拟数字不代表真实网络速度。
- **保留已有优化**：两个批次并发、划词优先、取消与重试、免费 Key 保护、接口隔离缓存和动态内容清理继续生效。

升级后确认版本为 **0.9.0**，刷新网页。右键“译”可调整设置；需要自动择快时，将接口设为「自动择快（推荐）」并开启「接口失败时自动回退」。已有设置不会被升级覆盖。

### v0.3.0 新增：仅译文模式

- 在面板勾选「仅显示译文（隐藏原文）」，页面会隐藏原英文，只显示译文，更接近沉浸式翻译的“仅译文”阅读方式。
- 原文节点、链接和目标地址仍保留在页面中，只是暂时隐藏；取消勾选或点击「恢复原文」会完整还原。
- 双语/仅译文切换直接修改显示，不重新翻译；切换语言、接口或范围会按新的策略扫描，命中相应缓存时复用。
- 正文块内的图片、链接和交互内容会随原文一起隐藏，这是替换式阅读的取舍；需要点击正文链接时请切回双语模式。

### v0.2.0 主要更新

- **通用文本块识别**：按实际布局寻找叶子文本块，不再只处理 `p / li / h1`，可覆盖 `div`、`span`、`section`、自定义元素和短文本。
- **减少漏词**：相邻链接、inline-block 小标签、带嵌套列表的段落和混合块会合并提取，避免只翻到一半。
- **排版更稳**：flex / grid 容器中的译文换到独立行；原文节点、链接和交互保持不变。
- **DeepL 可选接口**：填入免费版 API Key 后可作为高质量接口；默认仍使用免 Key 的微软接口。
- **质量优先回退**：MyMemory 不再默认自动兜底，只有勾选「允许 MyMemory 低质量兜底」才会使用。
- **强制整页模式**：需要翻译导航、页脚和侧栏时可手动开启；默认使用自适应范围，页面较大时优先保证当前阅读区域。

### 安装

1. 在 Edge 扩展商店安装 Tampermonkey 或 ScriptCat。
2. 如果扩展详情页出现「允许用户脚本」开关，将其打开。
3. 打开 [edge-translator.user.js](edge-translator.user.js)，点击 **Raw**，由脚本管理器接管安装；也可以新建脚本，把全部内容粘贴进去后保存。
4. 打开任意网页，第一次翻译时脚本管理器会请求跨域权限，请允许：
   - `edge.microsoft.com`（默认免费接口）
   - `api-free.deepl.com`（配置 DeepL 免费 Key 时）
   - `translate.googleapis.com`（自动择快、回退或手动选择 Google 时）
   - `api.mymemory.translated.net`（启用低质量兜底时）

安装后页面右下角会出现蓝色「译」按钮。按钮可以拖动，位置会被记住。

### 使用

| 操作 | 说明 |
| --- | --- |
| 点击「译」 | 默认翻译整页，包含导航和侧栏；关闭强制整页后，大页面只翻译当前屏幕，滚动后继续 |
| 再次点击「译」 | 恢复原文，移除译文和临时容器，还原提示属性 |
| 右键「译」或 `Alt+O` | 打开面板，选择接口、目标语言、站点自动翻译、禁用网站等 |
| 勾选「仅显示译文」 | 隐藏原文，只显示译文；取消勾选恢复双语 |
| 悬停译文 | 默认关闭；在面板开启后可显示原文 |
| 本地保存译文缓存 | 默认关闭；开启后刷新可复用，7 天到期，也可一键清除 |
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
| Google 网页翻译 | 免 Key | POST 整页批量，参与自动择快，也可手动固定；部分网络环境无法连接 |
| MyMemory | 免 Key，匿名额度约每天 5000 字符 | 质量较低，低质量兜底默认勾选；需同时开启自动回退才会作为备用接口使用，也可手动选择 |

默认固定使用微软，自动回退关闭。选择自动模式并开启自动回退后，会在 **微软与 Google** 间择快，当前页面先用上次成功的线路；两者均失败后，才使用已配置的 DeepL。MyMemory 仅在允许低质量兜底时参与回退。关闭自动回退后不会启动备用线路。

这些接口使用的是网页前端端点，不是有 SLA 承诺的官方开发者 API，可能随时调整或失效。脚本已经隔离适配器、校验响应格式，并提供手动切换和失败重试；但不能保证长期可用。

#### 配置 DeepL 免费 Key（可选）

1. 在 DeepL 官网申请 API 免费版 Key（通常以 `:fx` 结尾）。
2. 打开脚本面板，在「DeepL 高质量接口」中填入 Key。
3. 在「接口」中选择 DeepL；也可以保留自动选择，让 DeepL 作为微软和 Google 均失败后的回退。

Key 只保存在脚本管理器本地存储中，只会发送给 DeepL 官方端点。免费额度、账户资格和接口可用性以 DeepL 官方为准。

### 覆盖模式

- **强制整页模式（默认）**：包含导航、页脚和侧栏，跳过大页面的自适应范围限制；部分网站的顶部栏布局可能发生变化。
- **自适应范围模式**：取消勾选「强制整页（含导航/侧栏）」后，仍覆盖导航和控件文字；普通页面整页翻译，大页面仅翻译当前屏幕，滚动后继续。
- 两种模式都保留原文节点；恢复时移除译文、解开临时容器，并还原提示属性。

### 稳定性设计

- **通用文本块识别**：根据布局提取正文和界面短词，包含导航、页脚、按钮、行内文字及常见提示属性；跳过 `pre`、`code`、表单输入值、密码、`contenteditable` 和 `translate="no"`。
- **自适应范围**：关闭强制整页后，先统计候选文本块；不超过 160 块且约 32000 字符时整页处理，大页面用 `IntersectionObserver` 只处理当前屏幕。动态增长的页面达到阈值后同样切换范围。
- **批量与限速**：微软和 Google 每批最多 128 段、约 24000 字符，DeepL 最多 50 段、约 24000 字符；页面最多并发 2 个逻辑批次，每接口最多 2 个请求（MyMemory 1 个）。自动择快可能同时使用两条线路；同接口间隔初始为 250ms（Google 400ms，MyMemory 1000ms），请求超时 10 秒，429 后冷却。
- **划词优先**：划词请求会在接口队列中优先于普通页面批次，减少手动翻译等待。
- **可中断扫描**：候选文本按约 6ms 的协作分片扫描；整页模式先收集再批量排队，大页面只提交当前屏幕的内容。
- **统一显示**：成功结果暂存在内存中，当前一轮的批次全部结束后一起写入；缓存命中与新请求也一起显示。写入前再次检查原文和任务代次。
- **尝试预算**：同一批次最多 3 次接口尝试，包含重试和接口回退；长文本按接口能力分片时，分片请求不计入额外尝试，但受相同的接口间隔和超时约束。
- **错误处理**：自动竞速时网络错误/5xx 直接切换线路；固定接口重试一次。413/414 可以缩批重试。429 尊重 `Retry-After`；401/403、协议异常暂停对应接口；连续失败熔断；DeepL 额度用尽（HTTP 456）暂停 1 小时。
- **回退开关**：自动回退默认关闭；开启后，MyMemory 是否参与由「允许 MyMemory 低质量兜底」控制，该选项默认开启。
- **排版保护**：flex / grid 容器中的译文换到独立行；相邻链接和块边界会补空格后再送入翻译，避免 `HomeDocsAbout` 这类拼接错误。
- **碎片合并**：flex/grid 中大量短 `span` 词块会合并为一个完整翻译单元，避免逐词请求和逐词译文。
- **可逆的仅译文模式**：原文被放进临时隐藏容器而不是删除；恢复原文、切换模式或重译时会解包并还原原始节点，避免留下空页面或重复 DOM。
- **缓存与去重**：内存 LRU 最多约 1000 条或 2 MiB；本地保存默认关闭，开启后同步到脚本管理器本地，7 天到期；相同原文去重，按来源站点、语言和接口策略隔离。没有 GM 存储时只使用内存。
- **页面安全**：原文节点保持原位，只追加纯文本译文节点；译文只通过 `textContent` 写入，避免把接口内容当 HTML 执行。
- **动态页面**：`MutationObserver` 合并新增内容后增量扫描；SPA 路由变化时取消旧任务并重新扫描；渲染前校验任务代次、节点连接状态和原文指纹，防止旧译文贴到新内容。
- **内容变化保护**：同一段内容在 30 秒内频繁变化超过 3 次时暂停自动重译，避免与实时更新页面互相拉扯。
- **后台标签**：页面不可见时暂停新的请求，回到前台后继续。
- **统一取消**：停止、路由切换和语言切换会取消请求、重试退避、接口队列等待和旧批次，防止恢复原文后继续发请求。
- **接口隔离缓存**：缓存记录实际翻译接口，并隔离目标语言、接口选择、自动回退、DeepL Key 指纹和协议版本。
- **凭据保护**：只接受 DeepL `:fx` Key；已保存 Key 不回填输入框，设置 UI 使用 closed Shadow DOM，网页脚本不能通过 `host.shadowRoot` 读取面板内容。

### 隐私

- 只发送当前需要翻译的文本，不上传整页 HTML、页面地址、账号信息或 Cookie。
- 密码框、输入框、可编辑区域和代码块不会自动进入翻译队列。
- DeepL Key 只保存在脚本管理器存储中，不写入网页存储，不进入日志；输入框不会回填已保存 Key，设置面板使用 closed Shadow DOM。
- 仅译文模式只是在本地隐藏原文 DOM，不会删除或上传原文。
- 译文缓存默认只保留在当前页面内存中；开启「本地保存译文缓存」后，原文和译文会保存在脚本管理器本地，7 天到期，取消勾选会清除已有缓存。设置保存在脚本管理器中。
- 脚本没有统计、上报或远程配置功能。

### 已知限制

- 不在真实 Tampermonkey / ScriptCat 中完成安装验收前，不建议直接用于依赖精确排版的工作页面。
- 不支持 PDF 阅读器、图片/Canvas 内文字、OCR、视频字幕、跨域 iframe，以及 Shadow DOM 组件内部文本（开放式和封闭式均暂未遍历）。
- 只处理顶层页面（`@noframes`）；严格 CSP 网站可能阻止页面样式或脚本注入。
- 免费接口可能限流、变更或在特定网络不可达；自动模式可以减少慢线路等待，但两条线路都不可达时仍会失败。固定接口仍受其自身响应速度限制。
- DeepL 需要用户自己的 API Key；脚本不会创建或升级 DeepL 付费账户。
- 关闭强制整页后，大型单页应用、虚拟列表和频繁改写的页面达到规模阈值时会自动只处理当前屏幕，仍可能需要站点级排除规则；当前版本没有图形化的站点规则编辑器。
- 仅译文模式会隐藏合并正文块内的链接；需要点击这类正文链接时请切回双语模式。单独翻译的导航链接和按钮可继续使用，图片、代码和明确不翻译的内容会保留。少数依赖直接子节点的网页脚本可能在隐藏/恢复期间表现异常。
- 多标签页同时翻译时，各标签页独立限流；不会造成单页请求风暴，但不是全局配额管理。

### 验证记录

2026-10-22，在本机做过的检查：

- 微软真实接口：POST 批量英文文本，HTTP 200，返回对应中文；`from=` 留空可自动识别语言。
- MyMemory 真实接口：HTTP 200，`autodetect|zh-CN` 可用。
- Google 批量端点：POST 120 条公开测试句，HTTP 200，返回 120 条对应译文，单次约 3.9 秒；这不证明所有网络均可达。
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
- **仅译文模式（v0.3）**：
  - 原文容器计算样式为 `display: none`，链接不可见；5 个译文块对应 5 个隐藏原文容器；
  - 恢复原文后隐藏容器和译文节点均为 0，原链接、`href` 和段落文本完整还原；
  - 双语 ↔ 仅译文来回切换时，隐藏容器正确创建/解包，不重复请求；
  - 隐藏原文中的文字发生变化后，译文会自动重新翻译；
  - 标题保持原字号，表格/列表/代码块布局正常，控制台无报错。
- **整页速度（v0.6）**：120 个短段落、600ms 模拟请求、3 轮交替测试，完整显示中位耗时由 v0.5.0 的 1473ms 降到约 640ms；请求从 4 次减到 1 次。旧版依次显示 32/64/96/120 段，新版一次显示 120 段。
- **真实微软大批次冒烟**：120 条公开测试句，单次请求返回 HTTP 200，译文数量与非空字段均正确；本次约 3.2 秒。真实接口耗时不能与固定延迟模拟结果等同。
- **v0.7.0 回归**：仓库内保留 57 个浏览器测试，增加 Google 真批量、响应数量和空值校验、自动择快及取消、缓存跨刷新复用/到期/关闭/清除、零请求显示切换和单击操作等断言。
- **v0.8.0 覆盖与速度（2026-10-23）**：79 项浏览器回归通过。针对 GitHub 风格界面构建的 20 项文字模拟夹具中，v0.7.2 提取 5 项，v0.8.0 提取全部 20 项，两版均为一次批量请求；该结果不代表所有网站的覆盖率。与 v0.7.2 交替运行 3 轮，120 段正文在 600ms 模拟响应下的完整显示中位耗时均约 635ms。另以 8 个公开界面词测试真实微软端点，HTTP 200、返回完整译文，约 0.85 秒；真实速度随网络变化。
- **v0.9.0 Markdown 完整度与回归（2026-10-23）**：81 项浏览器回归全部通过，新增 README/Markdown 标题、文件名、版本号、标点句子、GitHub 文档文件名和行内代码保护测试。基准中 Google 批量 24 段保持 1 次请求、约 620ms；自动择快 120 段约 645ms；微软批量 120 段约 643ms；刷新命中缓存约 13ms。模拟数据用于比较调度策略，真实速度随网络变化。
- 尚未在真实 Tampermonkey / ScriptCat 扩展中完成安装、权限和升级验收，也尚未用真实 DeepL Key 调用；这是发布前剩余的人工测试。

### 实现说明

为了安装和分发简单，v0.9.0 使用单个 `.user.js` 文件，不依赖构建工具。文件内按“设置 / 请求 / 接口适配 / 提取 / 调度 / 渲染 / 界面”分段组织。

开发验证使用 Node.js 和 Playwright，不影响用户安装。运行 `npm ci`、`npm run check`、`npm test`；速度对比运行 `npm run bench`。测试会优先使用本机 Edge，也可通过 `PAGELINGO_BROWSER_PATH` 指定浏览器；没有 Edge 时先执行 `npx playwright install chromium`。自动化使用模拟接口，基准报告写入 `tests/results/benchmark.json`；详见 [tests/README.md](tests/README.md)。

接口协议和页面处理的思路参考了以下公开项目，代码为本项目独立实现：

- [fishjar/kiss-translator](https://github.com/fishjar/kiss-translator)：微软免 Key 协议、双语阅读和站点规则思路（GPL-3.0）
- [FilipePS/Traduzir-paginas-web](https://github.com/FilipePS/Traduzir-paginas-web)：请求合并、缓存、增量 DOM 处理思路（MPL-2.0）

本项目代码采用 MIT 许可证。

---

## English

PageLingo (Bilingual Web Page Translation) is a single-file userscript for Microsoft Edge. It works with Tampermonkey and ScriptCat.

Click the **译** button at the edge of a page to translate it into Chinese. Translation-only mode is enabled by default; disable it for bilingual reading, or click the button again to restore the original page.

Current version: `0.9.0`. View the userscript file: [edge-translator.user.js](edge-translator.user.js).

### New in 0.9.0: complete Markdown and inline-code coverage

- Markdown paragraphs, README file names, versions, and punctuation-rich sentences are collected into the same batch.
- Inline `<code>`, `<kbd>`, and `<samp>` content is protected with placeholders, so surrounding sentences translate without rewriting commands, paths, or versions.
- The complete page still appears as one committed batch while links, icons, and controls remain usable.

> Upgrading from v0.1: v0.2 changes both the script name and `@namespace` to PageLingo. Disable or remove the old **双语网页翻译（Edge）** script in Tampermonkey / ScriptCat before installing v0.2 so the manager does not keep two copies. v0.2 includes `@updateURL`, so later versions can be checked from the userscript manager.

### New in 0.8.0: translate navigation, short labels, and interface hints

- **Broader coverage**: include navigation, sidebars, buttons, menus, tabs, single-letter labels, inline siblings, and loose text around large blocks. Chinese page metadata no longer suppresses English, Japanese, or Korean text.
- **Interface hints**: translate placeholders, tooltips, accessible labels, image alternative text, submit captions, and option labels. Typed values, passwords, submitted option values, code, and editable content stay unchanged.
- **Dynamic updates**: translate menus when opened and refresh changed hints or option labels. Hidden regions wait until shown; stale responses cannot overwrite newer site content.
- **Shared batching**: interface hints use the same batching, deduplication, cache, and render commit as ordinary text, including viewport limits on large pages when forced full-page mode is off.
- **Controls and restoration**: keep navigation and button translations compact, preserve icons and protected content, and restore original attributes and node order.

### New in 0.7.2: force full page by default

- Provider: Microsoft; target language: Simplified Chinese.
- Enabled: low-quality MyMemory fallback permission, forced full-page mode (including navigation/sidebar), translation-only mode, and selection translation.
- Disabled: automatic fallback, hover originals, local translation cache, site auto-translation, and site disabling.
- Upgrades preserve saved settings. MyMemory is not used as a fallback while automatic fallback is off; in-memory cache remains available while local persistence is off.

### New in 0.7.0: real Google batches, faster routing, persistent cache

- **Whole-page translation by default**: collect all eligible content first for pages with up to 160 blocks and approximately 32,000 characters, including offscreen paragraphs.
- **Current-screen scope for large pages**: only submit visible text, then translate newly visible content as you scroll.
- **Display together**: buffer the current round until its requests settle, then show the translations in one animation frame. Translation-only mode keeps originals visible until results are ready. Failed blocks retain their originals.
- **Real Google batching**: POST repeated `q` fields, up to 128 items / 24,000 characters. No per-paragraph GET or 600-character request splitting. Microsoft batching remains available; DeepL batches up to 50 items. On 413/414, retry smaller batches.
- **Faster automatic routing**: start with the last successful free route on the current page. After 450ms, try the other Microsoft/Google route if needed; accept the first valid result and cancel the loser. A fast primary never starts a backup. DeepL is only used after failures, never as a speculative probe. Manual provider choices remain respected.
- **Cache across reloads**: enable local translation caching to save up to about 1,000 entries / 2 MiB in userscript-manager storage, expiring after seven days. Disable or clear it in settings. Without GM storage, use memory only; translated text is never persisted in website localStorage.
- **Direct controls**: click **译** to translate/restore; right-click to open settings. Bilingual/translation-only switches reuse existing nodes without scans or requests. Enable hover originals in settings to read source text on hover.
- **Measured completion time**: three alternating runs against v0.6.0, 24 Google paragraphs and 600ms simulated requests: about 9.85s / 24 requests became 0.62s / one request. A separate live Google POST returned all 120 translations with HTTP 200 in about 3.9s. Simulated timings do not predict real network speed.
- **Existing protections remain**: two concurrent page batches, selection priority, cancellation, free-key protection, provider-aware cache, and dynamic-node cleanup.

After upgrading, confirm **0.8.0** and reload the target page. Right-click **译** to adjust settings; select automatic routing and enable automatic fallback when desired. Upgrades preserve saved settings.

### New in 0.3.0: translation-only mode

- Enable **Show translation only (hide original)** in the panel to hide the source text and read only the translation, closer to Immersive Translate's translation-only reading mode.
- Original nodes, links, and hrefs remain in the page in a temporary hidden container. Unchecking the option or clicking **Restore original** brings them back completely.
- Bilingual/translation-only changes update the existing display immediately. Language, provider, and scope changes rescan with the new policy and reuse matching cached translations.
- Inline links merged into a translated paragraph are hidden with the source; switch to bilingual mode to use them. Independently translated navigation links and buttons stay usable, while images, code, and protected content remain visible.

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
   - `api-free.deepl.com` (when a DeepL Free key is configured)
   - `translate.googleapis.com` (automatic routing, fallback, or manual Google)
   - `api.mymemory.translated.net` (when low-quality fallback is enabled)

After installation, a blue **译** button appears in the bottom-right corner of the page. You can drag it to a new position; its position is remembered.

### Usage

| Action | Description |
| --- | --- |
| Click **译** | Translate the whole page, including navigation and sidebars, by default; disable forced full-page mode to translate large pages one viewport at a time |
| Click **译** again | Restore source text and hint attributes, removing translations and temporary wrappers |
| Right-click **译** or press `Alt+O` | Open settings for provider, language, site-level auto-translation, and disabling the site |
| Enable **Show translation only** | Hide the original and show only the translation; disable it to return to bilingual mode |
| Hover a translation | Off by default; enable it in settings to read the original |
| Save translation cache locally | Off by default; enable it to reuse after reload, expire after seven days, or clear it manually |
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
| Google web translation | Keyless | Whole-page POST batches, automatic routing or manual choice; unreachable on some networks |
| MyMemory | Keyless; about 5,000 anonymous characters/day | Lower quality; fallback permission is on by default, but automatic fallback must also be enabled; manual selection is available |

Microsoft is selected by default, with automatic fallback off. Select automatic mode and enable automatic fallback to choose between **Microsoft and Google**, preferring the route that last succeeded on the current page. If both fail, a configured DeepL key can be used. MyMemory participates only when low-quality fallback is allowed. Disabling automatic fallback prevents backup requests.

These providers are web frontend endpoints, not official developer APIs with an SLA. They may change or stop working at any time. PageLingo isolates the adapters, validates response formats, and provides manual switching and retries, but cannot guarantee long-term availability.

#### Configure a DeepL Free key (optional)

1. Request a DeepL API Free key (usually ending in `:fx`).
2. Open the PageLingo panel and paste it into **DeepL high-quality API**.
3. Select DeepL under **Provider**, or leave automatic routing enabled so DeepL can act as a fallback after Microsoft and Google both fail.

The key is stored only in the userscript manager's local storage and is sent only to DeepL's official endpoint. Quota, eligibility, and availability are governed by DeepL.

### Coverage modes

- **Forced full-page mode (default)**: includes navigation, footers, and sidebars and bypasses the large-page adaptive limit. Some site headers or menus may change layout.
- **Adaptive scope**: disable **Force full page (including navigation/sidebar)** to translate normal pages in full and large pages one viewport at a time. Navigation and control captions remain included.
- Both modes preserve source nodes. Restoration removes translations, unwraps temporary containers, and restores hint attributes.

### Reliability and safety design

- **Generic block detection**: extract body text, navigation, footers, buttons, inline labels, and common hint attributes; skip `pre`, `code`, typed form values, passwords, `contenteditable`, and `translate="no"`.
- **Adaptive scope**: with forced full-page mode off, pages with up to 160 blocks and about 32,000 characters enter one whole-page queue; large pages use `IntersectionObserver` for the current screen only. Growing documents also switch scope when they reach the threshold.
- **Batching and rate limiting**: Microsoft and Google batch up to 128 segments / 24,000 characters; DeepL up to 50 / 24,000. Up to two logical page batches run concurrently, with up to two requests per provider (one for MyMemory). Automatic routing may use two providers at once. Starts stay 250ms apart per provider (Google 400ms, MyMemory 1,000ms), with a 10-second timeout.
- **Selection priority**: selection requests move ahead of ordinary page batches in a provider queue.
- **Cooperative scanning**: candidate discovery yields about every 6ms; whole-page mode collects then queues candidates, while large pages submit only currently visible content.
- **One display update**: buffer successful results until the current round settles, including cache hits. Check source text and generation again before the final DOM update.
- **Attempt budget**: each batch gets at most 3 provider attempts, including retries and fallback. Requests split from a long text do not count as additional attempts, but follow the same request interval and timeout rules.
- **Error handling**: automatic racing switches routes directly on network errors or 5xx; fixed providers retry once. 413/414 can retry smaller batches. Honor `Retry-After` on 429; pause after 401/403 or protocol errors; trip a circuit breaker after repeated failures; cool down for one hour on DeepL quota exhaustion (HTTP 456).
- **Fallback controls**: automatic fallback is off by default. When enabled, MyMemory participation follows the low-quality fallback permission, which is on by default.
- **Layout protection**: translations inside flex/grid containers move to a separate row; spaces are inserted at link and block boundaries before translation to avoid `HomeDocsAbout`-style input errors.
- **Fragment coalescing**: short `span` tokens inside flex/grid layouts are merged into one complete translation unit, avoiding word-by-word requests and translations.
- **Reversible translation-only mode**: source content is moved into a temporary hidden container, not deleted. Restoring, switching modes, or retranslating unwraps the original nodes so the page is not left blank or with duplicate DOM.
- **Cache and deduplication**: an LRU cache holds about 1,000 entries or 2 MiB. Local persistence is off by default; enable it to save in userscript-manager storage with seven-day expiration. Cache keys isolate origin, language, and provider policy. Without GM storage, cache only in memory.
- **Page safety**: original nodes stay in place; only plain-text translation nodes are appended; translations are written with `textContent` only, so provider output is never executed as HTML.
- **Dynamic pages**: `MutationObserver` batches new content for incremental scanning; SPA route changes cancel old jobs and trigger a rescan; generation, node connectivity, and source fingerprints are checked before rendering so stale translations do not attach to new content.
- **Content change protection**: if the same block changes more than 3 times within 30 seconds, automatic re-translation pauses to avoid fighting a live-updating page.
- **Background tabs**: new requests pause while the page is hidden and resume when it becomes visible again.
- **Unified cancellation**: stopping, route changes, and language changes cancel active requests, retry backoff, provider-queue waits, and old batches.
- **Provider-aware cache**: entries record the actual provider and isolate provider selection, target language, fallback settings, DeepL key fingerprint, and protocol version.
- **Credential protection**: only `:fx` DeepL keys are accepted; saved keys are never refilled into the input, and the settings UI uses a closed Shadow DOM so page scripts cannot read it through `host.shadowRoot`.

### Privacy

- Only the text that needs translation is sent. Full-page HTML, page URLs, account information, and cookies are not uploaded.
- Password fields, input fields, editable areas, and code blocks do not enter the translation queue automatically.
- A DeepL key is stored only in the userscript manager's storage, not in page storage or logs; saved keys are not refilled into the page input and the settings UI uses a closed Shadow DOM.
- Translation-only mode hides source DOM locally; it does not delete or upload the original content.
- Translation cache stays in the current page's memory by default. Enable local caching to save source and translated text in the userscript manager with seven-day expiration; disabling it clears saved entries. Settings are stored in the userscript manager.
- The script contains no analytics, reporting, or remote configuration.

### Known limitations

- Installation, permissions, and upgrade flows have not yet been accepted in real Tampermonkey / ScriptCat extensions. Until that validation is complete, PageLingo is not recommended for work pages that depend on precise layout.
- PDF readers, text inside images or Canvas, OCR, video subtitles, cross-origin iframes, and text inside Shadow DOM components (neither open nor closed shadow roots are traversed) are not supported.
- Only the top-level page is processed (`@noframes`). Sites with strict CSP may block injected page styles or scripts.
- Free providers may rate-limit, change, or become unreachable. Automatic routing reduces waits for a slow route, but fails if both are unreachable. A fixed provider remains limited by its own response speed.
- DeepL requires your own API key; PageLingo does not create or upgrade paid DeepL accounts.
- With forced full-page mode off, large single-page apps, virtualized lists, and frequently rewritten pages are limited to the current screen after reaching the size threshold, but may still need site-level exclusion rules. There is no graphical site-rule editor in the current version.
- Translation-only mode hides inline links merged into a translated paragraph. Switch back to bilingual mode to use those links. Independently translated navigation links and buttons remain usable, and images, code, and protected content stay visible. A few sites whose scripts depend on direct child nodes may behave unexpectedly while content is hidden or restored.
- When several tabs translate at once, each tab rate-limits independently. This avoids request storms within one page, but is not a global quota manager.

### Verification notes

Checks performed locally on 2026-10-22:

- Microsoft production endpoint: batch English text in a POST returned HTTP 200 with matching Chinese translations; leaving `from=` empty detected the source language.
- MyMemory production endpoint: HTTP 200; `autodetect|zh-CN` worked.
- Google batch endpoint: POST with 120 public test sentences returned HTTP 200 and 120 corresponding translations in about 3.9s. This does not establish reachability on every network.
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
- **Translation-only mode (v0.3)**:
  - Source containers computed to `display: none` and links became invisible; five translated blocks produced five hidden source containers;
  - After restore, hidden containers and translation nodes both dropped to zero, and the original link, `href`, and paragraph text were intact;
  - Switching between bilingual and translation-only modes created and unwrapped hidden containers correctly without duplicate requests;
  - Editing text inside a hidden source container triggered retranslation;
  - Heading size was preserved, and table/list/code layout remained normal with no console errors.
- **Whole-page speed (v0.6)**: 120 short paragraphs, 600ms simulated requests, three alternating runs: median complete display fell from 1,473ms on v0.5.0 to about 640ms. The old display counts were 32/64/96/120; the new version displayed all 120 together with one request.
- **Microsoft production smoke test**: one 120-item request returned HTTP 200 and 120 non-empty translations in about 3.2 seconds. This real endpoint measurement is separate from the fixed-latency simulation.
- **v0.7.0 regression checks**: 57 browser tests include Google batches and response validation, automatic routing and cancellation, cache across reloads/expiration/disabling/clearing, request-free display switches, and single-click controls.
- **v0.9.0 Markdown coverage and regression**: all 81 browser tests pass, including README/Markdown headings, file names, versions, punctuation-rich sentences, GitHub documentation filenames, and inline-code protection. The benchmark keeps Google's 24-item batch at one request and about 620ms, automatic routing for 120 paragraphs at about 645ms, Microsoft batching at about 643ms, and reload cache hits at about 13ms under simulated conditions.
- Installation, permission, and upgrade acceptance in real Tampermonkey / ScriptCat extensions is still pending, and DeepL has not been tested with a real key. These remain the required manual tests before release.

### Implementation notes

To keep installation and distribution simple, v0.9.0 is a single `.user.js` file with no build step. The file is organized into settings, requests, provider adapters, extraction, scheduling, rendering, and UI sections.

Development checks use Node.js and Playwright: `npm ci`, `npm run check`, `npm test`, and `npm run bench`. Tests prefer a local Edge installation or `PAGELINGO_BROWSER_PATH`. Without Edge, first run `npx playwright install chromium`. Requests are mocked; benchmark results are written to `tests/results/benchmark.json`. See [tests/README.md](tests/README.md).

The protocol and page-processing approach were informed by the following open-source projects. The implementation here is independent:

- [fishjar/kiss-translator](https://github.com/fishjar/kiss-translator): Microsoft keyless protocol, bilingual reading, and site-rule ideas (GPL-3.0)
- [FilipePS/Traduzir-paginas-web](https://github.com/FilipePS/Traduzir-paginas-web): request coalescing, caching, and incremental DOM ideas (MPL-2.0)

This project is licensed under the MIT License.

---

**PageLingo** · Made for focused, bilingual reading.
