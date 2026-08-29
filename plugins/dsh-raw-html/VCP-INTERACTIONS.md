# VCP 交互元素手册（P1 · 白名单交互第一弹）

> dsh-raw-html 渲染链路支持的原生交互元素。全部**零 JS**——依赖浏览器原生
> 控件行为与 CSS，在安全红线（无 script / 无自定义事件）内即可获得交互能力。

## 原则

1. **交互零 JS**：折叠用 `<details>`、选项卡/手风琴用 radio/checkbox hack、轮播用 CSS 动画——都不需要脚本。
2. **唯一 JS 通道**：`onclick="input('...')"` 由渲染层桥接为真实发送（先生点按钮 → 输入框填入并发送）。
3. **流式注意**：流式输出过程中元素会被反复重建，**交互状态（展开/选中）可能重置**；交互请在流结束后使用。卡片结构（元素类型/文本/样式）在流式中稳定。
4. **安全边界**：script/iframe/object/embed 会被过滤；href/src 仅放行 http/https/mailto/data:image/相对路径；style 中 `position:fixed`、`z-index>=1000`、`content:` 会被剥离。

---

## 1. 折叠面板（details/summary）

浏览器原生折叠，`open` 属性控制默认展开。

```html
<details style="border:1px solid rgba(64,180,255,.3);border-radius:10px;padding:12px;background:rgba(64,180,255,.05);">
  <summary style="cursor:pointer;font-weight:600;color:#40dcff;">点击展开 · 实现细节</summary>
  <div style="padding:10px 4px;font-size:13px;line-height:1.8;">
    这里是折叠内容……可以放代码、表格、长文本。
  </div>
</details>
```

## 2. 选项卡（radio hack，CSS-only）

用 `input[type=radio]` + `label` + 兄弟选择器实现无 JS 切换。
要点：radio 隐藏、label 做按钮、`:checked + ... ~ 面板` 控制显示。

```html
<style>
  .tab-demo .tab-input{display:none}
  .tab-demo .tab-panel{display:none;padding:12px;border-radius:0 0 10px 10px;background:#0a1626;}
  .tab-demo .tab-label{display:inline-block;padding:8px 16px;cursor:pointer;border-radius:8px 8px 0 0;background:rgba(64,180,255,.08);color:#7fa8c9;margin-right:4px;}
  .tab-demo .tab-label:focus-visible{outline:2px solid #40dcff;outline-offset:2px;}
  .tab-demo input:checked + .tab-label{background:#40dcff;color:#06182e;font-weight:600;}
  .tab-demo input:checked + .tab-label + .tab-panel{display:block}
</style>
<div class="tab-demo" style="border:1px solid rgba(64,180,255,.3);border-radius:10px;overflow:hidden;">
  <input type="radio" name="tab1" id="t-a" class="tab-input" checked>
  <label for="t-a" class="tab-label">概览</label>
  <div class="tab-panel">概览内容……</div>
  <input type="radio" name="tab1" id="t-b" class="tab-input">
  <label for="t-b" class="tab-label">数据</label>
  <div class="tab-panel">数据内容……</div>
</div>
```

## 3. 手风琴（checkbox hack）

多个 checkbox 各自控制一个面板，可同时展开多个。

```html
<style>
  .acc-item{border:1px solid rgba(64,180,255,.25);border-radius:8px;margin-bottom:8px;overflow:hidden;}
  .acc-item input{display:none}
  .acc-item .acc-body{display:none;padding:10px 14px;background:#0a1626;font-size:13px;}
  .acc-item input:checked + label + .acc-body{display:block}
  .acc-item label{display:block;padding:10px 14px;cursor:pointer;font-weight:600;color:#cfe6f8;background:rgba(64,180,255,.06);}
  .acc-item label:focus-visible{outline:2px solid #40dcff;outline-offset:2px;}
  .acc-item input:checked + label{color:#40dcff}
</style>
<div>
  <div class="acc-item"><input type="checkbox" id="a1"><label for="a1">第一步 · 收集</label><div class="acc-body">……</div></div>
  <div class="acc-item"><input type="checkbox" id="a2"><label for="a2">第二步 · 分析</label><div class="acc-body">……</div></div>
</div>
```

## 4. 轮播（CSS 动画自动播放）

纯 CSS 平移循环；多张面板容器横向排布，父容器溢出隐藏，`@keyframes` 整体平移。
注意：这是「自动轮播」，无法手动切换（无 JS）。时长建议 4~8s 一屏。

```html
<style>
  @keyframes lx-carousel{0%,28%{transform:translateX(0)}33%,61%{transform:translateX(-100%)}66%,94%{transform:translateX(-200%)}100%{transform:translateX(0)}}
  .car{overflow:hidden;border-radius:10px;border:1px solid rgba(64,180,255,.3);}
  .car-track{display:flex;width:300%;animation:lx-carousel 9s infinite;}
  .car-slide{width:33.333%;padding:18px;box-sizing:border-box;background:#0a1626;}
</style>
<div class="car"><div class="car-track">
  <div class="car-slide">第一屏内容……</div>
  <div class="car-slide">第二屏内容……</div>
  <div class="car-slide">第三屏内容……</div>
</div></div>
```

## 5. 按钮交互（onclick → input 桥）

唯一被放行的 JS 通道：点击后把文本填入输入框并发送。可做「一键追问 / 快捷指令 / 选项确认」。

```html
<button onclick="input('请展开讲讲第二步')" style="background:#40dcff;color:#06182e;border:none;border-radius:999px;padding:8px 18px;font-weight:600;cursor:pointer;font-size:13px;">展开讲讲第二步</button>
```

## 6. 系统提示词注入（可选）

把下面这段加入模型系统提示词，模型就会主动使用交互元素：

```
## VCP 交互能力（渲染层支持，零 JS）
卡片内可用原生交互：`<details><summary>` 做折叠；radio/checkbox hack 做选项卡与手风琴（样式在 <style> 中定义）；CSS 动画做自动轮播；`onclick="input('...')"` 按钮会真实发送该文本。交互状态在流式输出中可能重置，请把交互元素放在卡片稳定结构内；不要在交互元素上依赖流式中的状态保持。
```

## 7. Mermaid 图表（VCP 卡片内 · 白底淡色主题）

> 模型在 vcp-root 内输出 `<pre class="language-mermaid">…</pre>`，渲染层自动：
> 白底框体 + 蓝灰线条 + 石墨文字 + 右上角工具栏（− / 100% / ＋ / 适应）。
> 渲染逻辑见 patch/v6-inject.js 的 mermaid 模块；测试 tests/mermaid.test.mjs + e2e-mermaid*.cjs。

### 7.1 基础用法（三种高频图型）

```html
<pre class="language-mermaid"><code class="language-mermaid">flowchart TD&#10;  A[开始] --&gt; B{判断}&#10;  B --&gt;|是| C[完成]&#10;  B --&gt;|否| D[重试]</code></pre>
<pre class="language-mermaid"><code class="language-mermaid">sequenceDiagram&#10;  蓝汐-&gt;&gt;先生: 输出卡片&#10;  先生--&gt;&gt;蓝汐: 反馈效果</code></pre>
<pre class="language-mermaid"><code class="language-mermaid">gantt&#10;  title 排期&#10;  dateFormat YYYY-MM-DD&#10;  section 阶段&#10;  任务A :done, a1, 2026-08-20, 1d</code></pre>
```
注意：mermaid 源码内的换行用 `&#10;`（HTML 实体），避免 vcp-root 出现空行；`>` 等符号用实体（`--&gt;`）。

### 7.2 分类型淡色染色（classDef，推荐）

给不同类型的节点/子图用低饱和淡色区分（主流程淡蓝、决策淡紫、终端淡绿），优雅且高级：

```html
<pre class="language-mermaid"><code class="language-mermaid">flowchart TD&#10;  classDef main fill:#e8f1fb,stroke:#7db3e8,color:#1e293b;&#10;  classDef decide fill:#f3eef9,stroke:#b39ddb,color:#1e293b;&#10;  classDef done fill:#eaf7ee,stroke:#8fd6a8,color:#1e293b;&#10;  A[发起请求]:::main --&gt; B{校验}:::decide&#10;  B --&gt;|通过| C[处理数据]:::main&#10;  B --&gt;|拒绝| D[返回错误]:::done</code></pre>
```

### 7.3 状态图着色陷阱（stateDiagram-v2 · 必读）

状态图染色**不要**用后缀绑定语法 `state "待支付" as pending :::main`——在部分 Mermaid 版本里 `:::` 类名不会落到状态节点上，classDef 颜色渲染失败（实测确认）。改用单独的 `class 状态名 类名` 语句绑定，且 classDef 名与状态名要错开（避免 `done` 这类重名冲突）：

```html
<pre class="language-mermaid"><code class="language-mermaid">stateDiagram-v2&#10;  [*] --&gt; pending&#10;  pending --&gt; done : 完成&#10;  done --&gt; [*]&#10;  state "待处理" as pending&#10;  state "已完成" as done&#10;  classDef primary fill:#e8f1fb,stroke:#7db3e8,color:#1e293b&#10;  classDef finish fill:#eaf7ee,stroke:#8fd6a8,color:#1e293b&#10;  class pending primary&#10;  class done finish</code></pre>
```

- 规则：`classDef 类名` 负责定义样式，`class 状态名 类名` 负责绑定，两者缺一不可；顺序上 classDef 在前、class 绑定在后。
- 流程图（flowchart）里的 `节点:::类名` 后缀语法正常生效，此坑**只针对 stateDiagram-v2**。

### 7.4 样式约定
- 框体由渲染层统一白底（模型无需写容器样式，写了也会被 div.mermaid 统一样式覆盖）
- 建议淡色系：淡蓝 `#e8f1fb` / 淡紫 `#f3eef9` / 淡绿 `#eaf7ee` / 淡黄 `#fdf6e3`，边框用同色系加深 30%，文字统一石墨 `#1e293b`
- 图表渲染失败自动回退为代码块（源码可读），不会闪错误
---

## 8. 卡片下载（浏览器半侧 · 非模型能力）

> 这是**渲染侧提供的能力**，模型无需在 HTML 里写任何下载按钮——用户把鼠标移到
> 任意已渲染的 VCP 卡片上，右上角会浮出「⤓ 下载 HTML」小按钮，点击即把该卡片
> 下载为**自包含 HTML 存档**（装帧小说 / 图表 / 卡片皆可）。

- **自包含**：下载文件会把卡片用到的**开源字体内嵌为 data URI**——
  内置精选 `/fonts/Lanxi-*.woff2`（7 款 OFL）与 KaTeX `/vendor/fonts/*.woff2`（OFL）。
  任何电脑、任何时间、离线打开，装帧字体都完整还原。
- **不内嵌**：外置大库字体（`/fonts/<子目录>/*.ttf`，可能商业授权）保留相对路径——
  本机打开仍正常，换机器则 fallback 系统字体（授权安全优先）。
- **已自包含**：Mermaid 渲染后是内联 SVG；表情包 `<img>` 是绝对 URL，本机仍可加载。
- 模型侧**无需任何动作**，正常输出 VCP 卡片即可；下载入口由插件自动附加。


---

*维护：本文件与 `patch/v6-inject.js`、`tests/` 配套，改动渲染能力时同步更新。*
