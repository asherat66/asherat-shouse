# dsh-raw-html 进化成果报告

日期：2026-08-24
执行：克莉丝（女仆长）
前因：主人要选一块插件做骨干，妾身审计 A（dsh-raw-html）与 B（dsh-raw-htmlB）后定夺「A 做主干、吸收 B 的增益」，本报告记录落地成果与当前能力全景。
对比审计原文：`G:\AI\H3MINI\dsh-raw-html-vs-htmlB-审计.md`

---

## 一、背景与决策

A、B 是同一血统的两个分支：B 是 A 在「v0.3.0 审计整改」之前分叉的旧版（铁证：B 仍随包分发 A 已删除的 12 款商业字体，且 on* 安全洞、t0 计时器 bug 未修）。

审计结论（六维）：

| 维度 | 胜方 |
|---|---|
| 代码稳固 / 测试背书 | A（2300 行测试 vs B 单点） |
| 渲染能力深度 | B（尾巴稳定器 + 锚定锁 + 色彩引擎） |
| 数学 / 审美 / token / 安全 / 字体授权 | A |

决策：**A 为主干**，把 B 三个真实增益移植进 A，同时刻意避开 B 的坑（无限递归软重置、最长门控排序、scrollTop 属性遮蔽泄漏、hex+oklch 双声明 bug、商业字体、自检清单）。

---

## 二、进化成果（三轮落地）

### 第一轮 · 渲染能力增强

| 移植项 | 落点 | 状态 |
|---|---|---|
| SVG `transform-box:fill-box` + `transform-origin` 防抖条款 | BREATH.md §6 规则8（权威）+ EDITORIAL §5 指针 + 协议【流式稳定】一行 | ✅ 已落地 |
| VCPColorEngine 色彩引擎（声明式配色） | 复制 `assets/vendor/VCPColorEngine.js`；`client.js` 经 /vendor 加载；`v6-inject.js` 挂 `chromeForProps`/`applyColorVars`/`injectRootChrome`/`makeMathRef` | ✅ 已落地 |
| 流式锚定锁（CSS-only） | `v6-inject.js` 加 `anchorLock`/`anchorUnlock`/`ensureStreamingNoFollow`/`followStop`，流式期间注入 `overflow-anchor:none!important`，600ms 防抖后解除 | ✅ 已落地 |
| ref 闭包身份稳定 | `attachMathRef` 重写为缓存 ref 闭包（`__vcpRefSetter` + `__vcpMathRef` 标记） | ✅ 已落地 |

**主动修掉 B 的一个 bug**：B 的「hex + oklch 双声明」在 `setProperty` 逐条调用下后写覆盖、最终只剩 oklch（与 vdom 层只写 hex 不一致 → 流式结束颜色微跳），A 统一只写 hex（引擎已做 sRGB 色域裁剪）。

**刻意不移植**：B 的 scrollTop setter 劫持版追踪器（属性遮蔽泄漏风险），CSS-only 锚定锁已覆盖绝大多数场景。

### 第二轮 · 渲染/美学分层 + 按钮主题化

| 项 | 内容 | 状态 |
|---|---|---|
| 双开关分层注入 | `lib/index.js` 状态拆 `render`（渲染）+ `aesthetic`（美学注入）双键持久化；协议拆 `buildStructuralText`（结构铁律，渲染开必注入）+ `buildAestheticText`（美学工具包，美学开才注入）。**省 token 点：只开渲染时美学整段零注入** | ✅ 已落地 |
| 「</>」按钮三态面板 | `client.js` 按钮点开是设置面板（「渲染 HTML」「美学注入」两行开关，渲染关美学置灰）；按钮三态 `</> OFF` / `</> 渲染` / `</> ON` | ✅ 已落地 |
| 主题令牌化 | 按钮/面板/下载按钮样式从硬编码青色（`rgba(64,180,255,...)`）改为 DSH 设计系统别名层 `var(--dsw-alias-*)`，深/浅色主题自动契合 | ✅ 已落地 |
| 旧状态迁移 | 旧单开关 `enabled` → 双开（仅一次）；浏览器侧 `dsh.rawHtml` + `dsh.rawHtmlAesthetic` 双键 | ✅ 已落地 |

### 第三轮 · 下载按钮字体同步（主人反馈修复）

- 根因：下载按钮挂 `body` 下、`font-family:inherit` 只继承 body 默认字体；主人的字体插件改的是 DSH 面板/设置栏/左侧栏/composer 等原生 UI 区域（body 未变）。
- 修法：`nativeUIFontFamily()` 每次 hover 显示下载按钮时，从 DSH 原生元素（composer）读 `getComputedStyle(...).fontFamily` 实时同步。
- 附带：下载按钮字号 12px → 11px 对齐面板区按钮；去掉 `backdrop-filter` 改实色 `--dsw-alias-bg-overlay` + 阴影。

---

## 三、当前插件能力全景（八维）

### 1. 渲染引擎（核心）
- VCP 增量状态机：流式 HTML 逐帧解析，已闭合块缓存，元素引用跨帧不变 → React 跳过 diff → 动画不重启、长卡不掉帧。
- 三级缓存：整串缓存（上限 200）+ 块级缓存 + Mermaid SVG 缓存（上限 30）。
- 容器感知：vcp-root 未闭合期间内部闭合子块照样固化；消息级作用域化 `vcp-msg-N` 防后卡样式污染前卡。

### 2. 视觉表达画布（AI 可用）
- HTML/CSS 卡片、SVG 矢量图、图片（Markdown `![]()` 转 `<img>` + URL 白名单）。
- KaTeX 数学：单美元安全判定（价格/路径/模板串不误配）+ 流式占位 + 600ms 防抖 + 字体锁定抗主题覆盖。
- Mermaid 图表：双层结构 + 缩放工具栏 + 拖拽平移 + 缓存 + 失败回退源码。
- **声明式配色（本轮新增）**：`data-vcp-preset="editorial|chiaroscuro|fauvism|cyberpunk|wabi_sabi"` 免写 hex，引擎确定性生成整套 `--vcp-*` 变量 + 卡片基座，WCAG 对比度闭环保证。
- 交互：`<details>` 折叠、radio hack 选项卡、CSS 轮播、`onclick="input('...')"` 桥接。

### 3. 安全
- `on*` 属性双重全拒收（只放行 onclick 白名单桥接）。
- `javascript:`/`data:`/`blob:`/`file:` 协议拦截；href/src 白名单。
- style 危险属性剥离（position:fixed / z-index≥1000 / content:）。
- script/iframe/object/embed 过滤；未闭合 rawtext 防吞内容。

### 4. 流式稳定 / 防抖
- 增量固化（已闭合块不重建）、600ms 数学防抖、一次性动画剥离 + infinite 保留。
- SVG 半标签占位（防空窗）、`prefers-reduced-motion` 无障碍降级。
- **锚定锁（本轮新增）**：流式期间关闭浏览器原生 overflow-anchor，视口冻结防抖动。
- **ref 闭包稳定（本轮新增）**：容器流式重建时 ref 身份跨帧不变，避免每帧 setProperty 风暴。

### 5. 审美体系（设计知识层）
- DESIGN.md（纯技术手册：字体/中文排版/安全铁律）+ EDITORIAL.md（四色系/明度契约/可数单位词汇库）+ BREATH.md（灵魂手册 + 流式稳定 8 条）+ FRAMING.md（故事装帧）+ VCP-INTERACTIONS.md（交互白名单）。
- 「一规则一权威」文档地图。

### 6. Token 优化
- 心流纪律（不列弃案/不自检/正文只写一次）、协议瘦身约 74%。
- **渲染/美学分层（本轮新增）**：只开渲染时美学整段零注入。
- **声明式配色免写 hex（本轮新增）**。

### 7. 工程健壮性
- 补丁安装链：备份 + 锚点唯一性 + node --check + 特征校验 + 自动回滚。
- 测试：2300 行（数学/安全/防抖/Mermaid/流式/打包，含 4 个真实浏览器 e2e）。
- 7 款 OFL 开源字体（无授权风险）；git 仓库 + CHANGELOG/PROGRESS。

### 8. UI 体验（本轮新增主题化）
- 「</>」三态面板按钮、渲染/美学双开关持久化。
- 主题令牌 `--dsw-alias-*` 深浅色自动契合。
- 「⤓ 下载 HTML」按钮：主题化 + 字体同步 DSH 原生 UI + 开源字体内嵌 data URI 存档。

---

## 四、与 B 的最终定位

- A 现在是「成熟主干 + 已吸收 B 的两件半增益」，B 的「强」只剩**尾巴稳定器**这一件尚未吸收。
- B 保留的价值：尾巴稳定器思路（供第二阶段参考）+ 色彩引擎已迁走 + transform-box 条款已迁走。
- B 应弃用：商业字体、两套自检清单、scrollTop 劫持追踪器、probe 调试脚本。

---

## 五、验证状态

| 项 | 状态 |
|---|---|
| 三个核心 JS `node --check`（v6-inject.js / client.js / index.js） | ✅ 通过 |
| VCPColorEngine.js `node --check` | ✅ 通过 |
| 冒烟测试（vcp-migrate-smoke.mjs，12 项：模块加载/色彩引擎/幂等/锚定锁挂卸） | ✅ 通过 |
| A 完整回归 `tests/stable.test.mjs`（jsdom 硬依赖主人本机路径，沙箱跑不了） | ⏳ 待主人真机执行 |
| 浏览器实测（按钮三态面板 / 主题适配 / 下载按钮字体同步 / 声明式配色卡片） | ⏳ 待主人强刷验证 |

---

## 六、遗留事项（第二阶段，非阻塞）

1. **尾巴稳定器 processTail**：主人实测「抖动还行、可接受」，暂缓。触发条件：一张大 SVG 图表生成过程反复闪烁/重画时再做；届时先写量化回归（重挂数基线）再动，规避 B 的门控排序/软重置/scrollTop 三处坑。
2. **安全缺口（A、B 共有）**：`xlink:href`（SVG `<a>`）、`<form action>`/`formaction` 未过 URL 白名单。威胁面为「提示注入诱导模型输出恶意 HTML」，属低概率，可择机补 URL 全属性白名单。
3. **测试可移植性**：4 份测试硬依赖绝对路径 `G:/AI/AI 助手/VCPChat-main/node_modules/jsdom`，跨机器即碎；建议改为本地 devDependency。
4. **render() 流式尾部多顶层块数学盲区**（A 原生）：`attachMathRef` 只挂最后一个顶层块的 ref，多顶层块时前面块的数学占位徽标可能残留（协议规定单 `#vcp-root`，边角）。

---

*—— 克莉丝 · 2026-08-24 ——*
