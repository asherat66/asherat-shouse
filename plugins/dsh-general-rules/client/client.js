
window.__ModuleLoader__.load({ id: "dsh-general-rules", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  var react = require("react");
  var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
  var h = react.createElement;
  var useState = react.useState;
  var useEffect = react.useEffect;

  var zh = {
    nav: "General Rules",
    title: "General Rules",
    subtitle: "全局最高优先级规则（AGENTS.md）：AI 的回复与你在对话中的要求都不得凌驾于此。保存后新会话生效。",
    load: "加载中…",
    loadFailed: "加载失败：{err}",
    save: "保存",
    saving: "保存中…",
    saved: "已保存 ✓（新会话生效）",
    saveFailed: "保存失败：{err}",
    note: "写入位置：~/.dsh/AGENTS.md — DeepSeek Harness 会在每个会话的基线上下文中自动注入该文件。",
    placeholder: "在此输入你的规则…",
    recentHint: "提示：规则按重要性从上到下排列",
  };
  var en = {
    nav: "General Rules",
    title: "General Rules",
    subtitle: "Global highest-precedence rules (AGENTS.md): neither AI replies nor your in-chat requests may override them. Effective in new sessions after saving.",
    load: "Loading…",
    loadFailed: "Load failed: {err}",
    save: "Save",
    saving: "Saving…",
    saved: "Saved ✓ (takes effect in new sessions)",
    saveFailed: "Save failed: {err}",
    note: "Written to ~/.dsh/AGENTS.md — DeepSeek Harness injects this file into every session's baseline context automatically.",
    placeholder: "Type your rules here…",
    recentHint: "Tip: order rules by importance, top first",
  };

  var name = "dsh-general-rules";
  var inject = ["slots", "locale"];

  function fetchJson(url, opts) {
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); reject(new Error("timeout")); }, opts && opts.timeout || 10000);
      fetch(url, Object.assign({ headers: { Accept: "application/json" } }, opts || {}, { signal: ctrl ? ctrl.signal : undefined }))
        .then(function (r) { return r.json(); })
        .then(function (j) { clearTimeout(timer); resolve(j); })
        .catch(function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function RulesPage(props) {
    var t = props.t;
    var state = useState({ phase: "loading", content: "", err: null, saveState: "idle" });
    var s = state[0], set = state[1];
    useEffect(function () {
      fetchJson("/general-rules/get").then(function (j) {
        set({ phase: "loaded", content: j.content || "", err: j.ok ? null : (j.error || "unknown"), saveState: "idle" });
      }).catch(function (e) {
        set({ phase: "error", content: "", err: String((e && e.message) || e), saveState: "idle" });
      });
    }, []);
    function save() {
      set(Object.assign({}, s, { saveState: "saving" }));
      fetchJson("/general-rules/save", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Origin": location.origin },
        body: JSON.stringify({ content: s.content }),
      }).then(function (j) {
        set(Object.assign({}, s, { saveState: j.ok ? "saved" : "error", err: j.ok ? null : (j.error || "unknown") }));
      }).catch(function (e) {
        set(Object.assign({}, s, { saveState: "error", err: String((e && e.message) || e) }));
      });
    }
    var content = s.content;
    return h("div", { className: "gr-page", style: { display: "flex", flexDirection: "column", gap: 12, maxWidth: 720 } },
      h("div", null,
        h("h3", { style: { margin: "0 0 4px", fontSize: 16, fontWeight: 600 } }, t("title")),
        h("p", { style: { margin: "0", fontSize: 12, color: "var(--dsw-alias-label-secondary)", lineHeight: 1.6 } }, t("subtitle"))),
      s.phase === "loading"
        ? h("p", { style: { fontSize: 13, color: "var(--dsw-alias-label-tertiary)" } }, t("load"))
        : h("textarea", {
            className: "gr-editor",
            value: content,
            spellCheck: false,
            placeholder: t("placeholder"),
            onChange: function (e) { set(Object.assign({}, s, { content: e.target.value, saveState: "dirty" })); },
            style: {
              width: "100%", minHeight: 320, maxHeight: 520, boxSizing: "border-box",
              fontFamily: "var(--ds-font-family-code, ui-monospace, Consolas, monospace)",
              fontSize: 13, lineHeight: 1.6, padding: 12, borderRadius: 10,
              background: "var(--dsw-alias-bg-layer-2)", color: "var(--dsw-alias-label-primary)",
              border: "1px solid var(--dsw-alias-border-l2, rgba(127,127,127,.22))",
              resize: "vertical", outline: "none",
            },
          }),
      h("div", { style: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } },
        h(primitives.Button || "button", {
          type: "button",
          disabled: s.saveState === "saving" || s.phase === "loading",
          onClick: save,
          style: { cursor: "pointer", padding: "6px 16px", borderRadius: 8, fontSize: 13, fontWeight: 500 },
          children: s.saveState === "saving" ? t("saving") : t("save"),
        }),
        s.saveState === "saved" ? h("span", { style: { fontSize: 12, color: "var(--dsw-alias-state-ok-primary, #2f9e44)" } }, t("saved")) : null,
        s.saveState === "dirty" ? h("span", { style: { fontSize: 12, color: "var(--dsw-alias-label-tertiary)" } }, "·") : null,
        s.saveState === "error" ? h("span", { style: { fontSize: 12, color: "var(--dsw-alias-state-error-primary)" } }, t("saveFailed", { err: s.err || "" })) : null,
        h("span", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)" } }, t("recentHint"))),
      h("p", { style: { margin: "0", fontSize: 11, color: "var(--dsw-alias-label-tertiary)" } }, t("note")),
    );
  }

  function apply(ctx) {
    ctx.effect(function () { ctx.locale.register(name, { zh: zh, en: en }); }, "dsh-general-rules: dictionaries");
    var t = ctx.locale.bind(name);
    ctx.slots.inject("settings.section", function () {
      return ctx.slots.register({
        name: "settings.section",
        id: name,
        order: 28,
        label: function () { return t("nav"); },
        locale: name,
        inject: function () { return { t: t }; },
      }, RulesPage);
    });
  }

  exports.name = name;
  exports.inject = inject;
  exports.apply = apply;
  return module.exports;
}});
