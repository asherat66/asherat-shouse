window.__ModuleLoader__.load({ id: "dsh-update-checker", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  var react = require("react");
  var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
  var h = react.createElement;
  var useState = react.useState;
  var useEffect = react.useEffect;

  var zh = {
    rowTitle: "DeepSeek Harness 版本",
    current: "当前版本 {v}",
    check: "检查更新",
    checking: "检查中…",
    latest: "已是最新版本 ✓",
    update: "发现新版本 {v}（发布于 {date}）",
    failed: "检查失败：{err}",
    view: "前往查看",
    open: "打开 GitHub 发布页",
  };
  var en = {
    rowTitle: "DeepSeek Harness version",
    current: "Current {v}",
    check: "Check for updates",
    checking: "Checking…",
    latest: "Up to date ✓",
    update: "New version {v} available (released {date})",
    failed: "Check failed: {err}",
    view: "View release",
    open: "Open GitHub releases",
  };

  var name = "dsh-update-checker";
  var inject = ["slots", "locale"];

  function fmtDate(iso) {
    if (!iso) return "";
    try { return new Date(iso).toISOString().slice(0, 10); } catch { return ""; }
  }

  // fetch with timeout so a stalled proxy never hangs the row
  function fetchJson(url, ms) {
    return new Promise(function (resolve, reject) {
      var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); reject(new Error("timeout")); }, ms || 10000);
      fetch(url, { headers: { Accept: "application/json" }, signal: ctrl ? ctrl.signal : undefined })
        .then(function (r) { return r.json(); })
        .then(function (j) { clearTimeout(timer); resolve(j); })
        .catch(function (e) { clearTimeout(timer); reject(e); });
    });
  }

  function UpdateRow(props) {
    var t = props.t;
    var state = useState({ phase: "idle", data: null, err: null });
    var s = state[0], set = state[1];
    function check() {
      set({ phase: "checking", data: null, err: null });
      fetchJson("/update-checker/check").then(function (j) {
        set({ phase: "done", data: j, err: j.ok ? null : (j.error || "unknown") });
      }).catch(function (e) {
        set({ phase: "done", data: null, err: String((e && e.message) || e) });
      });
    }
    // 状态文案:当前版本常显;检查结果独立一行
    var versionText = s.data && s.data.current ? t("current", { v: s.data.current }) : t("current", { v: "…" });
    var status = null;
    if (s.phase === "checking") {
      status = h("span", { style: { fontSize: 12 } }, t("checking"));
    } else if (s.phase === "done") {
      if (s.err) {
        status = h("span", { style: { fontSize: 12, color: "var(--dsw-alias-state-error-primary)" } }, t("failed", { err: s.err }));
      } else if (s.data.isUpdate) {
        var l = s.data.latest || {};
        status = h("a", { href: l.htmlUrl || "#", target: "_blank", rel: "noreferrer", style: { fontSize: 12, color: "var(--dsw-alias-state-warning-primary, #e6a23c)" } },
          t("update", { v: l.version || l.tag || "", date: fmtDate(l.publishedAt) }) + " → " + t("view"));
      } else {
        status = h("span", { style: { fontSize: 12, color: "var(--dsw-alias-state-ok-primary, #2f9e44)" } }, t("latest"));
      }
    }
    return h("div", { className: "uc-row", style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
      h("span", { className: "uc-title", style: { fontWeight: 600, minWidth: 150 } }, t("rowTitle")),
      h("span", { className: "uc-version", style: { fontVariantNumeric: "tabular-nums" } }, versionText),
      h(primitives.Button || "button", {
        type: "button",
        disabled: s.phase === "checking",
        onClick: check,
        style: { cursor: "pointer", padding: "4px 10px", borderRadius: 6, fontSize: 12 },
        children: t("check"),
      }),
      status,
    );
  }

  function apply(ctx) {
    ctx.effect(function () { ctx.locale.register(name, { zh: zh, en: en }); }, "dsh-update-checker: dictionaries");
    var t = ctx.locale.bind(name);
    ctx.slots.inject("settings.general.item", function () {
      return ctx.slots.register({
        name: "settings.general.item",
        id: name,
        order: 10,
        locale: name,
        inject: function () { return { t: t }; },
      }, UpdateRow);
    });
  }

  exports.name = name;
  exports.inject = inject;
  exports.apply = apply;
  return module.exports;
}});
