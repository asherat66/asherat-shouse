# dsh-raw-html · 项目状态快照（PROGRESS.md）

> 本文件是会话交接文档：任何新会话读到本文件即可恢复全部上下文。
> 最后更新：2026-08-25（当前版本 0.6.0 · 思考门移除：v4 强制思考是模型边界，插件回归「渲染 + 美学」；协议保留思考最小化/初稿即定稿）。
> 版本演进 / 审计整改明细一律见 CHANGELOG.md，本文件不再重复记录。

## 1. 项目是什么

`dsh-raw-html` —— DeepSeek Harness 的 **VCP 视觉通感协议渲染插件**：
让模型输出的 HTML 在聊天中渲染为真实视觉界面（卡片/图表/交互组件），
支持流式渲染、表情包、安全过滤。插件位于 `G:\AI\H3MINI\dsh-raw-html\`。

架构三部分：
- `lib/index.js`（Host 端）：系统提示词注入（VCP 协议说明）+ /fonts 字体服务 + 开关状态持久化
- `lib/client.js`（浏览器端）：「</>」开关按钮 + `window.__dshInput` 交互桥
- `patch/patch-frontend.cjs`（核心）：改 dsh-web-frontend 的 dist bundle，注入 HTML 渲染能力

## 2. 当前进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| 基础 | 表情包渲染 + 流式卡片成型（v2） | ✅ 先生验收 |
| 防闪 | 图表/进度条闪烁治理（v3） | ✅ 先生验收 |
| 循环动画 | infinite 保留策略（v4） | ✅ 先生验收 |
| P0-地基 | patch v5.1：自动健康检查（node --check）+ 失败自动回滚 + 锚点预检 | ✅ |
| P0-安全 | vc() 增强 v2：URL 协议白名单 + style 危险属性剥离 + 图片转换白名单 | ✅ |
| P0-测试 | 三套测试 60 项断言全绿 | ✅ |
| P1-交互 | 折叠/选项卡/手风琴/轮播/按钮 渲染验证 + 文档 | ✅ |
| P1-提示词 | 「交互能力 + 图片通道」已注入 lib/index.js（**需重启 DSH 生效**） | ⏳ 待重启 |
| P2-稳定区 | **v6 稳定区固化**：已渲染块固化 + 只重渲染尾巴（容器感知块级增量） | ✅ 补丁已应用，99 项断言全绿 |
| P3-数学公式 | **KaTeX 公式渲染**（v6.12）：单美元安全判定 + 流式不渲染/终帧一次渲染 + /vendor 静态服务（参考 VCPChat 方案） | ✅ 补丁已应用，154 项断言全绿 |
| P3-公式占位 | **流式公式占位**（v6.16）：流式中已闭合公式（$$/\[/\(）显示「浅蓝底 + 斜体 + 公式渲染中」占位框，结束后解占位 KaTeX 渲染；源码层替换防 React 重建重置 | ✅ 已应用，178 项断言全绿；花体×颜色×艺术字体混测先生验收通过 |
| P3-Mermaid | **VCP 卡片内 Mermaid 查看器**（演进至 v6.17+）：白底淡色主题（低饱和淡蓝/淡紫/淡绿 classDef 分色）+ 窗口封顶（max-height 520 双层结构：外层固定挂控制条 + 内层滚动/拖拽）+ 工具栏（− 实时百分比 ＋ 适应，点击百分比还原 100%）+ 小手拖拽平移 + 真实尺寸缩放（可滚动溢出）+ SVG 渲染缓存（重建秒恢复）+ 引擎预热（warmup）+ 布局让位/尺寸重试 | ✅ 先生验收（超复杂 22 节点图通过）；204 项断言全绿 |
| P3-提示词 | **Mermaid 用法已注入系统提示词**（lib/index.js【Mermaid 图表】段：pre.language-mermaid + &#10; 转义 + classDef 分色 + 工具栏说明）——模型可主动输出图表 | ⏳ 待重启 DSH 生效 |
| P3-装帧 | **SVG 顶栏封面轻提示已注入系统提示词**（【故事装帧】段 + FRAMING.md 手册：可选加分项、设计自由不写死、技术要点、示例仅演示手法）——写故事/散文时模型可主动加封面 | ✅ 已写入 · 需重启 DSH 生效 |
| P3-SVG流式 | **SVG 流式渲染修复（方案 A+B）**：根因——`<svg>` 不在 CommonMark HTML 块白名单（type 1-6），未闭合行被 mdast 当段落文本（显示代码），且 DOMParser 对半标签整体丢弃（空窗）。方案 A：协议铁律「SVG 一律包在 vcp-root 内」（div 白名单 → 首行即 HTML 块）；方案 B：v6 tail 半标签 → 「SVG 绘制中…」占位 span（已闭合内容照常渲染，标签写完占位自然消失） | ✅ 已应用，210 项断言全绿（43+59+15+33+38+22） |
| ~~P3-SVG稳定~~ | ~~SVG 高度稳定（v6.6）~~：svg 半开标签 → 块级 div 占位 + aspect-ratio（解析 viewBox 比例）对齐最终高度防跳变。**先生实测观感不佳，已完整还原**（v6-inject.js / lib/index.js / stable.test.mjs / bundle 全部回退，bundle 已回注 v6.5） | ❌ 已还原（备份 `.v66-20260820-195234`） |
| P3-美学 | **lieflat 编辑美学迁移**：新增 `EDITORIAL.md`（四色系/四件套/视觉词汇库/非图表迁移/自检）+ 协议按需指针——用户明确要 汇总/卡片/图表/排版/海报/装帧 时才读，普通回复零 token 开销；渲染层与格式规范零改动 | ✅ 已写入 · 需重启 DSH 生效 |
| P3-美学系统 | **美学系统 RAG 化（0.5.0）**：`styles/` 按风格分文档知识库（_INDEX + porcelain-data / wire-news / wabi-sabi）+ `examples/` 成品档案（八卦晚报收为首个样本，技法回填 wire-news）+ 注入管线改造——检索指引（必做）→ 命中风格文档 / 未命中走【兜底美学】；克莉丝建议①自检后置（动笔三问+落盘一勾）②惊艳出口（深色渐变+光效合法场合）；协议正文安全/流式铁律 12 条精简为落盘一勾 | ✅ 已写入 · **需重启 DSH 生效** |
| P3-思考门 | **思考门战役（0.5.5~0.5.16）→ 0.6.0 移除**：agent/request 瀑布 + reasoningEffort 删除 + 关键词分类 + 日志落盘——五层全通（通道/缓存/分类/删除/日志）但 DeepSeek v4 **忽略 thinking:disabled 且无低档 effort**（先生实测 maxTokens=4096 思考吃满正文截断实锤），模型强制思考是能力边界，插件层无法突破。全部代码已移除（lib 578→345 行），协议保留【心流纪律·思考最小化】【初稿即定稿】；未来换支持 effort=off 的模型时参考 CHANGELOG v0.5.5~0.5.16 git 历史恢复 | ✅ 已移除 · 结论入档 |

## 3. 关键文件（改动清单）

- `patch/patch-frontend.cjs`：**v6 补丁脚本**（锚点 C 注入稳定区模块 + 锚点 A 替换 case"html" 分支）
- `patch/update-v6-inject.cjs`：**v6 模块增量更新脚本**（bundle 已注入旧模块时整段夹取替换为磁盘最新 v6-inject.js，健康检查+回滚）
- `patch/v6-inject.js`：**v6 稳定区模块 + P3 数学公式模块**（轻量 HTML 扫描器 + 状态机 + 组装 + 单美元安全判定 + KaTeX 渲染 + **流式公式占位 mathPlaceholder/undecorateMathPlaceholders**，注入 vc() 定义前，挂 window.__vcpStable 与 window.__vcpMath）
- `lib/index.js`：buildProtocolText 已追加【交互能力】【图片通道】【数学公式】三段（模板字符串，勿用反引号！）；已注册 /fonts 与 **/vendor** 两个静态服务（KaTeX 后备资源）
- `lib/client.js`：开关按钮 + input 桥；**KaTeX 自备全套注入**（改名版 katex-vd.css + katex.min.js + auto-render.min.js 链式加载——DSH 自带 KaTeX 是延迟加载，消息渲染时可能未就绪导致公式 fallback 普通字体，故自备并改名字体名防冲突）
- `assets/vendor/`：**KaTeX 资源 + Mermaid 引擎**（katex.min.js/css + auto-render.min.js + 20 字体 + katex-vd.css 改名版 + **mermaid.min.js 11.9.0**，自 VCPChat vendor 抽取；katex-vd.css 的字体名加 _VD 后缀避免与 DSH 自带 KaTeX 的 @font-face 冲突）
- `tests/stable.test.mjs`：**32 项稳定区帧序列测试**（node:vm 加载 v6-inject.js + jsdom stub，验证元素引用跨帧稳定/动画策略/回退/边界/style 修复/压力场景）
- `tests/math.test.mjs`：**46 项 P3 数学公式测试**（单美元安全判定/字符扫描/DOM 兜底/终帧挂载钩子/KaTeX 配置/幂等轮询/改名 CSS 正确性）
- `tests/security.test.mjs`：31 项正则行为测试
- `tests/bundle.test.mjs`：**29 项 bundle 完整性测试**（含 v6 特征断言 + P3 数学公式特征断言）
- `tests/smoke.test.mjs`：15 项 jsdom 渲染链路测试
- `VCP-INTERACTIONS.md`：交互手册；`DESIGN.md`：设计规范；`FRAMING.md`：故事装帧轻提示手册（SVG 顶栏封面，只教方法不写死设计）

## 4. Bundle 状态

- 已应用补丁版本：**v6.16**（v6.15 全部 + **流式公式占位**：mathPlaceholder 源码层替换 + undecorateMathPlaceholders 解占位 + render 流式路径接入）
- 位置：`%APPDATA%\npm\node_modules\@deepseek-ai\dsh\node_modules\@deepseek-ai\dsh-web-frontend\dist\assets\index-Dqw48FrP.js`
- 备份：同目录 `.bak-v6u-2026-08-20T08-44-55-075Z`（v6.16 模块更新前）；v5 基线保留
- 验证：`node --check` 通过；六套测试 **194 项断言全绿**（stable 37 + security 33 + bundle 38 + smoke 15 + math 59 + mermaid 12）；**puppeteer + Edge 真实浏览器 e2e：4/4 图型（流程图/时序图/甘特图/智能字符）渲染成 SVG、无错误、中文正常**（截图存 comfy_output/e2e_mermaid_*.png，8090 可看）

## 5. 如何运行测试 / 打补丁

```powershell
# 打补丁（自动健康检查 + 失败回滚；写 %APPDATA% 需 danger-full-access）
node "G:\AI\H3MINI\dsh-raw-html\patch\patch-frontend.cjs"
# 跑测试（bundle.test 内部 node --check 需 danger-full-access）
node "G:\AI\H3MINI\dsh-raw-html\tests\stable.test.mjs"
node "G:\AI\H3MINI\dsh-raw-html\tests\security.test.mjs"
node "G:\AI\H3MINI\dsh-raw-html\tests\bundle.test.mjs"
node "G:\AI\H3MINI\dsh-raw-html\tests\smoke.test.mjs"
```

## 6. 注意事项（血泪教训）

- **模板字符串（反引号）里不能写反引号**：lib/index.js 的 buildProtocolText 里引用 `<code>` 标签不能反引号包裹
- **文件头注释里不能出现 `*/`**：会提前终止块注释
- **vcp-root 内部禁止空行**（`\n\n`）：markdown 会把 HTML 块拆开，背景断裂
- **style 过滤正则**：content 值常带引号（`content:"x"`），正则要匹配引号（`[^;]*` 而非 `[^;"']*`）
- **bundle 升级后锚点失效**：dsh-web-frontend 更新后需重新提取锚点更新 patch 脚本
- **锚点 C 的 `}` 陷阱**：`}function vc(n,r){` 作为 from 时 split 会切掉 hp 函数的结束 `}`，AFTER **必须以 `}` 开头**补回（否则括号断裂，node --check 报 Unexpected end of input）
- **case"html" 分支锚点含 `}();`**：BEFORE 是含尾部 `}();` 的完整分支文本（v5 状态），AFTER 必须**同样以 `}();` 结尾**（IIFE 调用收尾），否则丢失调用
- **v6 全量兜底场景**：容器闭合帧、前缀失配（LLM 修正/多消息交替流式）→ 全量重建（一帧代价 / 多消息时性能退化，正确性优先）
- **块间裸文本阻止固化**：vcp-root 下直接写裸文本（不包标签内）会让其后内容全部进 tail 每帧重建；协议建议块结构（div/p/h* 等）
- **嵌套未闭合容器**：vcp-root 内再套未闭合 div → 内部整体进 tail（退化为每帧重建，正确性优先）
- **jsdom 容错差异**：DOMParser 解析 `'<p'`（无内容未闭合）返回空 body；真实浏览器/流式中不会出现（测试已用 `<p>文` 规避）
- **DOMParser 片段解析：`<style>`/`<link>` 进 `<head>`**（HTML 规范行为）！`parseFrag` 必须**同时收集 head 的 style/link**，否则 keyframes 永久丢失 → 动画全不播。真实浏览器与 jsdom 行为一致
- **RAWTEXT 标签（style/script）不能只「跳过」**：v6 早期实现扫描时跳过 style 导致它既不固化也不进 tail → 永久消失。修复：**完整闭合的 style/script 整体固化为一个块**（inContainer → inner；顶层 → outer）；未闭合时归 tail
- **style 未闭合瞬间**（流式中 `<style>` 刚输出）→ tail 解析时 DOMParser 会把后续内容吞进 style raw text → 视觉缺内容（style 闭合后立即固化恢复，一帧级窗口，无害）
- **CSS 内空行 = 截断炸弹（puppeteer 真实 bundle 验证）**：`<div>` 开头的 html 块按 CommonMark type 6 处理，**遇到空行提前结束**；`<style>` 在块内**不触发 raw text 模式**。CSS 内一旦有空行 → html 节点在空行处截断（style 未闭合 → 动画失效），空行后的 CSS 被解析成 paragraph/text 节点 → 泄漏为可见文本。修复：① 提示词铁律「CSS 内禁止空行」（lib/index.js 已加）；② v6 sanitizeStyle 防御（移除完整 style 内空行）
- **真实链路验证工具**：puppeteer + 真实 Edge + 改造 bundle 副本（`new qm(Vc).run()` 替换为 `window.__vcpTest={...}`）可完整复现真实渲染（Mp 流式 + bc 组件 + React）；验证：无空行卡片全部正常（动画+无泄漏），空行卡片必截断泄漏
- **伪标签防御（v6.3）**：文字里的 `<style>` 反引号字样会被 v6 扫描器误判为真标签 → RAWTEXT 吞掉后续内容 → style 污染（先生实测 style 内容 = HTML 源码片段）。修复：① scan 对未闭合的 style/script 跳过而非归 tail；② parseFrag 对「其后无闭合标签」的 style/script 开标签转义为文本
- **content 过滤正则误伤 justify-content（v6.5，动画不生效的最终根因）**：安全过滤 `/content\s*:[^;]*/` 没有词边界，把 `justify-content` 里的 `content` 误判为「content: 注入」剥掉 → 残留 `justify-` 与后随的 `animation` 粘连成 `justify-animation` → **animation 属性整个消失、动画不播**。修复：加后行断言 `(?<![\w-])` 仅匹配独立的 content 属性。血泪：**任何针对 CSS 属性名的正则必须加词边界**，否则会误伤「前缀/中缀含同名」的属性（justify-content / align-content / background 等）
- **动画问题排查方法论**：泄漏（CSS 变可见文本）与动画不生效是**两个独立 bug**，不要混为一谈——本轮泄漏根因是「CSS 空行截断 + 伪标签污染」，动画不生效根因是「content 正则误伤」；用 `getComputedStyle(el).animationName` 逐层定位（style 存在？→ animation 属性存在？→ keyframes 解析成功？→ 播放状态？）
- **流式中间态防泄漏/防闪动（v6.6-v6.9 收尾）**：流式中「开标签写到一半（无 `>`）」或「style/script 未闭合」时，DOMParser 会把后续内容吞进 raw text → CSS 泄漏为文本；早期「整卡不渲染」防御导致闪动。最终方案：① 整个 html 连一个 `>` 都没有（首个开标签写到一半）→ 不渲染；② tail 里未闭合的 style/script → **只截断丢弃这一小段**（已闭合内容持续显示），既不泄漏也不闪动
- **文字样式优先级锁定（v6.11）**：卡片内联 style 的文字颜色/字体/字号必须最高优先级，不被其他字体/主题插件的全局 `!important` 覆盖。关键：**React 内联 style 不支持 `!important`**（style 值带 `"!important"` 后缀会被 `setProperty(name, val, '')` 吞掉，实测不生效）；唯一可靠方式是在 vc()/parseOpen 里给元素加 **ref 回调，挂载时 `el.style.setProperty(prop, val, 'important')`**。锁定属性：color/font-family/font-size/font-weight/font-style/line-height/letter-spacing/text-align/text-shadow（不含布局与 animation，避免影响流式动画与排版）。puppeteer 实测：外部 `#mount * { color:red !important; font-family:SimSun !important }` 也无法覆盖卡片文字
- **P3 数学公式（v6.12）血泪**：
  - **lib/index.js 模板字符串里不能有裸反引号**（`'PingFang SC'` 曾用反引号包裹导致 SyntaxError——`node --check` 一跑就现形；模板内写转义 `\`` 或干脆去掉反引号）
  - **patch 重复应用要先回滚 v5 基线**：锚点 C（`}function vc(n,r){`）注入后不再命中，直接重跑 patch 会因命中 0 次中止；升级 v6-inject.js 的正确姿势：v5 基线 → 跑 patch → bundle.test 验证
  - **KaTeX 资源必须带字体**：katex.min.css 引用 fonts/KaTeX_*.woff2（20 个），缺字体时 \sum/\int 等符号渲染不全；已随插件分发（assets/vendor/fonts），/vendor 静态服务按扩展名白名单放行
  - **单美元安全判定移植 VCP 规则**：`$x$ $n$ $abc$` 渲染、`$10`（价格无闭合）、`$PATH`（/ 开头）、`${x}`（模板）、`a|b`（表格跨列）不渲染；**闭合的 $10$ 按设计放行**（简单数字数学），价格靠「无闭合」自然排除；不安全候选只释放开头 `$`，`"$12.5 ... $2.49 ... $\Delta$"` 不吞后续真公式
  - **KaTeX 定界符只注册 $$/\[/\(**：故意不注册宽松 `$...$`（防价格强配，VCP 同款）；单美元公式由预处理转成 `\(...\)` 再交给 auto-render
  - **流式不渲染公式**：流式中 `$...$` 保持原文，消息结束后（非流式终帧）attachMathRef 挂载时一次渲染——避免公式半成品闪烁 + KaTeX 重复计算；KaTeX 未就绪时 processMath 轮询重试（20×200ms，本地资源秒加载）
  - **KaTeX 输出不经过 vc() 过滤**（直接操作 DOM 生成 span.katex），无 href/src/onclick 风险；样式锁定 ref 只 setProperty 在带 style 元素本身，不影响 .katex 子树的数学字体（子元素自带 font-family 声明优先于继承值）
  - **DSH 自带 KaTeX，勿重复注入（v8 诊断血泪）**：dsh-web-frontend 内置 KaTeX 0.16.x（window.katex / window.renderMathInElement 全局）+ 完整字体（/assets/fonts/KaTeX_*.woff2 带 hash）。最初从 VCPChat 复制三件套注入 + 自建 /vendor 字体，结果公式全部 fallback 成普通字体——根因：注入的 katex.min.css 与 DSH 的 @font-face **同名冲突**，浏览器按文档顺序匹配「第一个」FontFace 条目（DSH 的 src 指向 hash 字体），而我的 src 覆盖被忽略/顺序靠后 → 渲染用 fallback。puppeteer 真实页面实测：`document.fonts.check('16px KaTeX_Main')` false → **移除注入后 true**。
  - **DSH 的 KaTeX 是延迟加载的（v10-v15 血泪）**：以为「复用 DSH 自带」即可，但实测 window.katex **时有时无**（v8 有、v10 没有）——DSH 异步注入 KaTeX，消息渲染（终帧挂载）时可能 CSS/字体未注册 → 公式渲染了但字体 fallback 成普通字体（先生实测「没有报错但字体都是普通字体」的根因）。**终极方案：自备全套 + 改名 CSS**——把 katex.min.css 的字体名全部加 `_VD` 后缀（`(?<![\w/])KaTeX_[A-Za-z0-9]+ → $&_VD`，**只改 font-family 声明、url() 文件名保留**——第一版正则把文件名也改了导致 404 `KaTeX_AMS_VD-Regular.woff2`！），改名后与 DSH 的 KaTeX_* 字体名**零冲突**、匹配唯一确定。puppeteer 实测：改名 CSS + 自备 JS → 字体 200、`document.fonts.check('26px KaTeX_Main_VD')=true`
  - **fonts.check 的陷阱**：`document.fonts.check()` 匹配 font-family 时选「第一个」FontFace 条目（按注册顺序），同名 @font-face 多个并存时，即使后面有条目已 loaded 也可能返回 false——排查字体问题要看 `[...document.fonts]` 全条目状态 + 实际网络请求（`requestfailed` 的 errorText 能区分 CORS/404），不能只看 check；about:blank 页面的字体请求会被 CORS 拦截（服务器 200 但浏览器 FAILED）
  - **主题插件覆盖 KaTeX（v6.13 内联 !important 锁定）**：先生启用皮肤/主题插件后，其全局 `!important`（如 `* { color/font-family: ... !important }`）会覆盖 KaTeX 的 .katex font-family 声明与 \textcolor 的内联 color → 公式 fallback 普通字体 + 颜色全单色（headless 默认环境复现不了，必须先生环境实测才能暴露）。解法：processMath 渲染后对每个 `.katex span` 用**内联 `!important`** 锁回正确字体/颜色——`el.style.setProperty('font-family', 映射字体, 'important')` + 读 `el.style.color` 再 `setProperty('color', ..., 'important')`。内联 important 是 CSS 优先级天花板，任何样式表规则（含主题全局 !important）都无法覆盖。字体映射按 span 的 class 硬编码（mathbb→AMS、mathcal→Caligraphic、mathfrak→Fraktur、mathscr→Script、mathsf→SansSerif、mathtt→Typewriter、mathnormal/mathit→Math、其余→Main，均 _VD 后缀）
  - **DSH 流式结束从不发 streaming=false 帧（v6.14 防抖调度，P3 最终根因）**：puppeteer 实测 DSH 渲染一条消息，`__vcpStable.render` 被调用 45 次**全部 streaming=true、0 次 false**——attachMathRef 原先只在非流式（streaming=false）挂 ref，导致 processMath **从未触发**、公式一直是纯文本（先生看到「字体普通 + 颜色白 + NO_KATEX」的真正原因，与主题/缓存无关）。解法：attachMathRef 流式时也挂 ref（记录最近挂载容器 `lastMathEl`），render 流式分支每次帧重置**防抖计时器**（600ms），流式停顿 600ms 后对 lastMathEl 跑一次 processMath（幂等 + 未闭合公式被 auto-render 自然忽略）。单元测试用 fake timer 验证「流式帧 → ref 记录容器 → 防抖触发 → processMath 渲染一次」
  - **React 18 元素 ref 在顶层字段（v6.15，ref 不执行的根因）**：`f.jsx` 是 react/jsx-runtime 的 jsx 工厂、vc 返回 `R.createElement(...)`——两者都会把 `props.ref` **提取到元素的顶层 `ref` 字段**（`{$$typeof,type,key,ref,props}`）。v6.14 的 attachMathRef 写 `node.props.ref` = 改错位置，React 根本不读 → ref 回调不执行 → processMath 仍 0 次（puppeteer 抓到 render 126 帧含 false 帧但 processMath 0 次）。修复：attachMathRef 用 `'ref' in node` 区分（真实元素设 `node.ref`、测试 stub {tag,props,children} 设 `props.ref`），并用 `node.ref || node.props.ref` 读取旧 ref 包装。修复后端到端：processMath 触发 2 次、.katex 渲染 6 个。血泪：**任何给 React 元素挂 ref 的代码必须操作顶层 `element.ref`，不是 `element.props.ref`**
  - **流式占位必须改「源码层」而非 DOM 层（v6.16）**：最初想在 attachMathRef 挂载后对 DOM 包 span——但 React 下一帧 diff 会用 vdom 重置被外部改动的 DOM（占位消失/闪烁）。正确做法：在 render() 的 HTML 字符串层用正则把公式包进占位 span（vdom 一致，重建不丢），processMath 时 unwrap 恢复。血泪：**给 React 渲染的内容加装饰，必须在进 React 之前（源码层），不能在挂载后改 DOM**
  - **测试断言的反斜杠转义层级（v6.16）**：JS 字符串 `'\\('` 是字面 `\(`（单反斜杠），写 `'\\\\('` 是 `\\(`（双反斜杠）——断言 mathPlaceholder 输出时用错层级会误报。先确认「实际输出字符」再写断言

## 7. 图片来源（本机实测可用）

- 表情包：`http://127.0.0.1:3080/emoji/<文件名.png>`（dsh-maid-emoji 服务，47+ 张）
- 本地出图：`http://127.0.0.1:8090/<文件名.png>`（http.server 映射 `G:\深鲸湾\biaoqingbao\comfy_output`）
- 外网图片：**当前环境网络受限**（picsum 连接被拒）

## 8. 下一步计划（路线图）

1. **P2 稳定区固化 ✅**：v6 已应用（容器感知块级增量 + 动画流式中真循环 + 全量兜底）
2. **P3 数学公式 ✅**：v6.12 已应用（KaTeX 本地渲染 + 单美元安全判定 + 流式不渲染/终帧一次渲染，参考 VCPChat 方案）
3. **P3 剩余扩展（可选）**：Mermaid（dsh-mermaid ★9 已有）/ artifact 体系，按需接入
4. **P4 生态发布**：README 完善 + 发布 DSH 市场

## 9. 待办（先生侧）

- [ ] 重启 DSH 进程（让 lib/index.js 的新提示词段落【数学公式】生效；/vendor 静态服务随之注册）
- [ ] 强刷页面（Ctrl+F5）让 bundle v6.12 生效
- [ ] 实测数学公式卡片：行内 \\(...\\)、块级 $$...$$、单美元 $x$（注意价格 $10 不被误渲染）
- [ ] 实测 KaTeX 字体显示（assets/vendor/fonts 20 个 woff2 是否随 /vendor 正常加载）
- [ ] 实测长卡片流式：观察流式不掉帧 + 动画真循环（含一次性动画在块稳定时播放）
- [ ] 实测交互演示卡（折叠/选项卡/轮播/按钮四件套）
- [ ] 若开新会话：直接说「继续 P3 数学公式任务，先读 dsh-raw-html/PROGRESS.md」
