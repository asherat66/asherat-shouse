window.__ModuleLoader__.load({ id: "dsh-prompt-copy", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  var react = require("react");
  var reactDom = require("react-dom");
  var h = react.createElement;
  var useState = react.useState;
  var useEffect = react.useEffect;
  var useRef = react.useRef;

  var name = "dsh-prompt-copy";
  var inject = ["locale"];

  var JIRO_URL = "https://jiro.build/";

  var zh = {
    entryHint: "内嵌 jiro.build 风格 Prompt 库（Web / PPT）",
    title: "Prompt Copy",
    tabWeb: "做网页",
    tabPpt: "做 PPT",
    webHint: "在下方浏览并复制风格 Prompt，然后粘贴到你的 AI 工作流中构建网页。",
    pptHint: "在 jiro.build 中浏览并复制风格 Prompt，粘贴到下方，一键转换成 PPT 设计 Prompt。",
    pastePlaceholder: "粘贴从 jiro.build 复制的风格 Prompt…",
    convert: "转换为 PPT Prompt",
    outputPlaceholder: "转换后的 PPT Prompt 将显示在这里",
    copy: "复制",
    copied: "已复制 ✓",
    close: "关闭",
    convertNote: "转换规则：保留原始风格细节，重新定义为 PPT 设计规范（版式/字体/配色/信息层级），并添加逐页建议。",
  };
  var en = {
    entryHint: "Embed jiro.build style-prompt library (Web / PPT)",
    title: "Prompt Copy",
    tabWeb: "For Web",
    tabPpt: "For PPT",
    webHint: "Browse and copy a style prompt below, then paste it into your AI workflow to build a web page.",
    pptHint: "Copy a style prompt from jiro.build, paste it below, and convert it into a PPT design prompt.",
    pastePlaceholder: "Paste the style prompt copied from jiro.build…",
    convert: "Convert to PPT Prompt",
    outputPlaceholder: "The converted PPT prompt will appear here",
    copy: "Copy",
    copied: "Copied ✓",
    close: "Close",
    convertNote: "Conversion keeps the original style details and redefines them as PPT design specs (layout/typography/palette/information hierarchy) plus per-slide guidance.",
  };

  // PPT 转换：把网页风格 Prompt 包装为 PPT 设计 Prompt
  function toPptPrompt(src) {
    var s = (src || "").trim();
    if (!s) return "";
    var webWords = ["网页", "页面", "网站", "landing page", "web page", "website", "UI", "browser", "响应式", "viewport", "布局", "hover", "scroll"];
    var flag = webWords.some(function (w) { return s.toLowerCase().includes(w); });
    var meta = flag
      ? "注意：原始 Prompt 面向网页。以下指导你将其重塑为 PPT 设计：把\"页面\"改为\"幻灯片\"，\"滚动/交互\"改为\"逐页呈现\"，\"响应式\"改为\"一致版式\"，保留配色/字体/风格等审美细节。"
      : "下方原始 Prompt 将被转译为 PPT 设计规范。";
    return [
      "# PPT 设计 Prompt（由网页风格 Prompt 转换）",
      "",
      "你是一位顶级 PPT 设计专家。请基于下方\"原始风格 Prompt\"，产出一套可用于生成 PPT 的完整设计规范。",
      "",
      "## 任务",
      "1. 提取原始风格 Prompt 中的视觉风格要素（配色、字体、图形语言、氛围）。",
      "2. 将其转译为 PPT 专用规范：每页版式、信息层级、标题/正文/图表样式、页脚。",
      "3. 给出封面页与内容页的模板结构，以及 10-15 页的逐页内容建议（含标题、要点、图表建议）。",
      "4. 输出可直接粘贴给 AI 的最终 Prompt（包含风格规范 + 逐页大纲）。",
      "",
      "## 约束",
      "- 保持原始风格的精神，不得丢弃其核心审美。",
      "- 版式比例按 16:9；中文字体优先（如思源黑体/微软雅黑），英文可配 Inter。",
      "- 信息层级：标题 > 要点 > 支撑数据；每页不超过 5 个要点。",
      "",
      meta,
      "",
      "## 原始风格 Prompt",
      "",
      '"""',
      s,
      '"""',
    ].join("\n");
  }

  function tabStyle(active) {
    return {
      padding: "5px 14px", borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: "pointer",
      border: "none", color: active ? "#fff" : "var(--dsw-alias-label-secondary)",
      background: active ? "var(--dsw-alias-brand-primary, #3b82f6)" : "transparent",
    };
  }

  function Panel(props) {
    var onClose = props.onClose;
    var state = useState({ tab: "web", paste: "", output: "" });
    var s = state[0], set = state[1];
    var outRef = useRef(null);
    var t = props.t;

    function convert() {
      var out = toPptPrompt(s.paste);
      set({ tab: "ppt", paste: s.paste, output: out });
      setTimeout(function () { if (outRef.current) outRef.current.focus(); }, 50);
    }
    function copyOut() {
      if (!s.output) return;
      if (navigator.clipboard) navigator.clipboard.writeText(s.output);
      set({ tab: "ppt", paste: s.paste, output: s.output, copied: true });
      setTimeout(function () { set({ tab: "ppt", paste: s.paste, output: s.output }); }, 1200);
    }

    return h("div", { className: "pc-overlay", style: {
        position: "fixed", inset: 0, zIndex: 99999,
        background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center",
      }, onClick: function (e) { if (e.target === e.currentTarget) onClose(); } },
      h("div", { className: "pc-panel", style: {
          width: "min(1080px, 92vw)", height: "min(740px, 88vh)",
          background: "var(--dsw-alias-bg-layer-1, #fff)", color: "var(--dsw-alias-label-primary, #111)",
          borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,.35)", display: "flex", flexDirection: "column", overflow: "hidden",
        } },
        h("div", { style: { display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.22))" } },
          h("span", { style: { fontWeight: 700, fontSize: 15 } }, t("title")),
          h("button", { onClick: function () { set({ tab: "web", paste: s.paste, output: s.output }); }, style: tabStyle(s.tab === "web") }, t("tabWeb")),
          h("button", { onClick: function () { set({ tab: "ppt", paste: s.paste, output: s.output }); }, style: tabStyle(s.tab === "ppt") }, t("tabPpt")),
          h("span", { style: { flex: 1 } }),
          h("button", {
            title: "iframe 内 OAuth 登录(Google)会被浏览器禁止; 点击后在独立窗口登录, 完成后回此页面刷新即可",
            onClick: function () {
              if (window.dshDesktop && window.dshDesktop.openExternalWindow) {
                window.dshDesktop.openExternalWindow(JIRO_URL);
                set({ tab: s.tab, paste: s.paste, output: s.output, loginNote: true });
              } else {
                window.open(JIRO_URL, "_blank");
              }
            },
            style: { cursor: "pointer", padding: "4px 10px", borderRadius: 8, fontSize: 12, border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.22))", background: "transparent" },
            children: "登录 jiro（独立窗口）",
          }),
          s.loginNote
            ? h("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-secondary)" } }, "→ 登录完成后：关闭独立窗口，回到本面板刷新页面即可")
            : null,
          h("button", { onClick: onClose, style: { background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--dsw-alias-label-tertiary)" } }, "✕")),
        s.tab === "web"
          ? h("div", { style: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 } },
              h("p", { style: { margin: "10px 16px 0", fontSize: 12, color: "var(--dsw-alias-label-secondary)" } }, t("webHint")),
              h("iframe", { src: JIRO_URL, style: { flex: 1, width: "100%", border: 0, marginTop: 8 } }))
          : h("div", { style: { flex: 1, display: "flex", flexDirection: "column", minHeight: 0 } },
              h("p", { style: { margin: "10px 16px 0", fontSize: 12, color: "var(--dsw-alias-label-secondary)" } }, t("pptHint")),
              h("iframe", { src: JIRO_URL, style: { flex: 1, width: "100%", border: 0, margin: "8px 0" } }),
              h("div", { style: { display: "flex", gap: 8, padding: "0 16px 12px", alignItems: "stretch" } },
                h("textarea", {
                  value: s.paste, placeholder: t("pastePlaceholder"), rows: 3,
                  onChange: function (e) { set({ tab: "ppt", paste: e.target.value, output: s.output }); },
                  style: { flex: 1.2, minHeight: 64, padding: 8, borderRadius: 8, fontSize: 12, fontFamily: "inherit", border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))", background: "var(--dsw-alias-bg-layer-2, rgba(127,127,127,.06))", resize: "vertical" },
                }),
                h("button", { onClick: convert, style: { flex: "none", padding: "8px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#fff", background: "var(--dsw-alias-brand-primary, #3b82f6)" } }, t("convert"))),
              h("div", { style: { display: "flex", gap: 8, alignItems: "flex-start", padding: "0 16px 12px" } },
                h("textarea", {
                  ref: outRef, value: s.output, placeholder: t("outputPlaceholder"), readOnly: true, rows: 8,
                  style: { flex: 1, minHeight: 120, padding: 8, borderRadius: 8, fontSize: 12, fontFamily: "monospace", border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))", background: "var(--dsw-alias-bg-layer-2, rgba(127,127,127,.06))", resize: "vertical" },
                }),
                h("button", { onClick: copyOut, disabled: !s.output, style: { flex: "none", padding: "8px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.3))", background: "transparent" } },
                  s.copied ? t("copied") : t("copy"))),
              h("p", { style: { margin: "0 16px 12px", fontSize: 11, color: "var(--dsw-alias-label-tertiary)" } }, t("convertNote"))),
      ));
  }

  function apply(ctx) {
    var locale = ctx.locale;
    var t = locale && locale.bind ? locale.bind(name) : (function (k) { return zh[k] || k; });
    if (locale && locale.register) {
      ctx.effect(function () { locale.register(name, { zh: zh, en: en }); }, "dsh-prompt-copy: dict");
    }
    ctx.effect(function () {
      var panelHost = null;
      var open = false;
      function ensureEntry() {
        if (open && panelHost) return;
        var existing = document.querySelector(".pc-entry");
        if (existing) return;
        var logBtn = document.querySelector("button[class*='sessionLogButton']");
        var util = logBtn ? logBtn.parentElement : document.querySelector("#root [class*='headerUtilities'], [class*='headerUtilities']");
        if (!util) return;
        var btn = document.createElement("button");
        btn.className = "pc-entry";
        btn.textContent = "prompt copy";
        btn.title = t("entryHint");
        btn.style.cssText = "display:inline-flex;align-items:center;height:26px;padding:0 10px;margin-right:6px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.22));background:transparent;color:var(--dsw-alias-label-secondary);";
        util.insertBefore(btn, logBtn || util.firstChild);
      }
      function closePanel() {
        if (panelHost) {
          try { reactDom.unmountComponentAtNode(panelHost); } catch (e) {}
          panelHost.remove();
          panelHost = null; open = false;
        }
      }
      function openPanel() {
        if (open) return;
        open = true;
        panelHost = document.createElement("div");
        document.body.appendChild(panelHost);
        try { reactDom.render(h(Panel, { t: t, onClose: closePanel }), panelHost); } catch (e) { console.error('[dsh-prompt-copy] render failed', e); }
      }
      var mo = new MutationObserver(function () { ensureEntry(); });
      mo.observe(document.body, { childList: true, subtree: true });
      ensureEntry();
      document.addEventListener("click", function (ev) {
        var el = ev.target;
        if (el && el.closest && el.closest(".pc-entry")) { ev.preventDefault(); openPanel(); }
      });
      return function () { mo.disconnect(); closePanel(); };
    }, "dsh-prompt-copy: dom");
  }

  exports.name = name;
  exports.inject = inject;
  exports.apply = apply;
  return module.exports;
}});