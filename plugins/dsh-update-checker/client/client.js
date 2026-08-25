
window.__ModuleLoader__.load({ id: "dsh-update-checker", factory: (require) => {
  var module = { exports: {} };
  var exports = module.exports;
  var react = require("react");
  var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
  var h = react.createElement;
  var useState = react.useState;
  var useEffect = react.useEffect;

  var zh = {
    nav: "版本更新", title: "版本更新",
    subtitle: "检查 DeepSeek Harness 主仓库的最新发布版本",
    current: "当前版本", latest: "最新版本",
    check: "检查更新", checking: "检查中…",
    upToDate: "已是最新版本 ✓",
    updateFound: "发现新版本", view: "前往查看", openHome: "打开 GitHub 仓库",
    failed: "检查失败：{err}",
    releaseHistory: "最近发布", released: "发布于 {date}", currentTag: "(当前)",
  };
  var en = {
    nav: "Version updates", title: "Version updates",
    subtitle: "Check for new DeepSeek Harness releases from the main repo",
    current: "Current version", latest: "Latest version",
    check: "Check for updates", checking: "Checking…",
    upToDate: "Up to date ✓",
    updateFound: "New version available", view: "View release", openHome: "Open GitHub repo",
    failed: "Check failed: {err}",
    releaseHistory: "Recent releases", released: "Released {date}", currentTag: "(current)",
  };

  var name = "dsh-update-checker";
  var inject = ["slots", "locale"];

  function fmtDate(iso) {
    if (!iso) return "";
    try { return new Date(iso).toISOString().slice(0, 10); } catch { return ""; }
  }

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

  function UpdatePage(props) {
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
    useEffect(function () { check(); }, []);

    var data = s.data;
    var status;
    if (s.phase === "checking") {
      status = h("span", { className: "uc-status", style: { color: "var(--dsw-alias-label-secondary)" } }, t("checking"));
    } else if (s.phase === "done" && s.err) {
      status = h("span", { className: "uc-status", style: { color: "var(--dsw-alias-state-error-primary)" } }, t("failed", { err: s.err }));
    } else if (data && data.isUpdate) {
      var l = data.latest || {};
      status = h("span", { className: "uc-status", style: { color: "var(--dsw-alias-state-warning-primary, #e6a23c)" } },
        t("updateFound") + " " + (l.version || l.tag || "") + (l.publishedAt ? " · " + t("released", { date: fmtDate(l.publishedAt) }) : ""));
    } else if (data) {
      status = h("span", { className: "uc-status", style: { color: "var(--dsw-alias-state-ok-primary, #2f9e44)" } }, t("upToDate"));
    }

    var recent = (data && data.recent) || [];
    return h("div", { className: "uc-page", style: { display: "flex", flexDirection: "column", gap: 16, maxWidth: 560, padding: "12px 0" } },
      h("div", null,
        h("h3", { style: { margin: "0 0 4px", fontSize: 16, fontWeight: 600 } }, t("title")),
        h("p", { style: { margin: "0 0 12px", fontSize: 12, color: "var(--dsw-alias-label-secondary)" } }, t("subtitle"))),
      h("div", { style: { display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", padding: "12px 14px", borderRadius: 10, background: "var(--dsw-alias-bg-layer-2)" } },
        h("div", null,
          h("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)" } }, t("current")),
          h("div", { style: { fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" } }, data ? data.current : "…")),
        h("div", null,
          h("div", { style: { fontSize: 11, color: "var(--dsw-alias-label-tertiary)" } }, t("latest")),
          h("div", { style: { fontSize: 18, fontWeight: 600, fontVariantNumeric: "tabular-nums" } }, data && data.latest ? (data.latest.version || data.latest.tag) : "…")),
        h(primitives.Button || "button", {
          type: "button",
          disabled: s.phase === "checking",
          onClick: check,
          style: { cursor: "pointer", padding: "6px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500 },
          children: t("check"),
        })),
      status ? h("div", { style: { fontSize: 13 } }, status) : null,
      data && data.isUpdate
        ? h("a", { href: (data.latest || {}).htmlUrl || "#", target: "_blank", rel: "noreferrer", style: { fontSize: 13, color: "var(--dsw-alias-brand-primary)" } }, t("view") + " →")
        : data && !data.isUpdate
          ? h("a", { href: "https://github.com/deepseek-ai/deepseek-harness", target: "_blank", rel: "noreferrer", style: { fontSize: 12, color: "var(--dsw-alias-label-secondary)" } }, t("openHome") + " ↗")
          : null,
      recent.length > 0
        ? h("div", null,
            h("h4", { style: { margin: "8px 0 8px", fontSize: 13, fontWeight: 600 } }, t("releaseHistory")),
            h("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
              recent.map(function (r) {
                var isCur = r.version === (data && data.current);
                return h("div", { key: r.tag, style: { display: "flex", alignItems: "center", gap: 10, fontSize: 12, padding: "6px 10px", borderRadius: 8, background: "var(--dsw-alias-bg-layer-2, rgba(127,127,127,.06))" } },
                  h("span", { style: { fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 110 } }, r.version || r.tag),
                  h("span", { style: { color: "var(--dsw-alias-label-tertiary)" } }, t("released", { date: fmtDate(r.publishedAt) })),
                  isCur ? h("span", { style: { color: "var(--dsw-alias-state-ok-primary, #2f9e44)" } }, t("currentTag")) : null,
                  h("a", { href: r.htmlUrl || "#", target: "_blank", rel: "noreferrer", style: { marginLeft: "auto", color: "var(--dsw-alias-label-secondary)" } }, "↗"));
              })))
        : null
    );
  }

  function apply(ctx) {
    ctx.effect(function () { ctx.locale.register(name, { zh: zh, en: en }); }, "dsh-update-checker: dictionaries");
    var t = ctx.locale.bind(name);
    ctx.slots.inject("settings.section", function () {
      return ctx.slots.register({
        name: "settings.section",
        id: name,
        order: 30,
        label: function () { return t("nav"); },
        locale: name,
        inject: function () { return { t: t }; },
      }, UpdatePage);
    });
  }

  exports.name = name;
  exports.inject = inject;
  exports.apply = apply;
  return module.exports;
}});
