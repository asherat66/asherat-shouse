"use strict";
// dsh-autofix — 每次 dsh 启动时自动检查并重打本机补丁(幂等)。
// 补丁模板在 ../patches/*.old.txt / *.new.txt(外置,维护清晰)。
// 覆盖三个目标(补丁丢失 = 第三方更新/重装覆盖后):
//   1. dsh-file-drop      client.js: 图片拖拽放行给 DSH 原生(多模态草稿)
//   2. dsh-file-upload    lib/client.js: 图片走 createDraftImages 原生附件
//   3. dsh llm-deepseek   lib/index.js: General Rules 注入(ESM 安全版)
// 每个补丁都有唯一标记; 已存在跳过, 缺失自动应用。

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

exports.name = "dsh-autofix";
exports.inject = [];

const HOME = process.env.DSH_HOME || os.homedir();
const PROFILE_NM = path.join(HOME, ".dsh", "profiles", "web", "node_modules");
const DSH_TREE = process.cwd(); // dsh 启动 cwd = DSH_ROOT
const PATCHES = path.join(__dirname, "..", "patches");

// 补丁 1/2 模板(外置文件)
const FD_MARK = "const allImages = files.length > 0";
const FD_OLD = fs.readFileSync(path.join(PATCHES, "file-drop.old.txt"), "utf8");
const FD_NEW = fs.readFileSync(path.join(PATCHES, "file-drop.new.txt"), "utf8");
const II_HOST_MARK = "from-url";
const II_HOST_OLD = fs.readFileSync(path.join(PATCHES, "ii-host-url.old.txt"), "utf8");
const II_HOST_NEW = fs.readFileSync(path.join(PATCHES, "ii-host-url.new.txt"), "utf8");
const II_CLIENT_MARK = "url-images";
const II_CLIENT_OLD = fs.readFileSync(path.join(PATCHES, "ii-client-url.old.txt"), "utf8");
const II_CLIENT_NEW = fs.readFileSync(path.join(PATCHES, "ii-client-url.new.txt"), "utf8");
const FD_FOLDER_MARK = "drainDroppedImages";
const FD_REG_OLD = fs.readFileSync(path.join(PATCHES, "fd-register.old.txt"), "utf8");
const FD_REG_NEW = fs.readFileSync(path.join(PATCHES, "fd-register.new.txt"), "utf8");
const FD_HANDLE_OLD = fs.readFileSync(path.join(PATCHES, "fd-handle.old.txt"), "utf8");
const FD_HANDLE_NEW = fs.readFileSync(path.join(PATCHES, "fd-handle.new.txt"), "utf8");
const FU_MARK = "cv.createDraftImages";
const FU_OLD = fs.readFileSync(path.join(PATCHES, "file-upload.old.txt"), "utf8");
const FU_NEW = fs.readFileSync(path.join(PATCHES, "file-upload.new.txt"), "utf8");

// 补丁 3: dsh llm adapter General Rules 注入(ESM 安全)
const ADAPTER_MARK = "__grRf";
const ADAPTER_HELPER =
  "import { readFileSync as __grRf, existsSync as __grEf } from 'node:fs';\n" +
  "import { join as __grJoin } from 'node:path';\n" +
  "import { homedir as __grHd } from 'node:os';\n";
const ADAPTER_FN =
  "\nfunction withGlobalRules(system) {\n" +
  "  if (system === void 0) return system\n" +
  "  if (system.includes('Create a concise title')) return system\n" +
  "  try {\n" +
  "    const p = __grJoin(process.env.DSH_HOME || __grHd(), '.dsh', 'AGENTS.md')\n" +
  "    if (!__grEf(p)) return system\n" +
  "    const extra = __grRf(p, 'utf8')\n" +
  "    if (extra.trim() === '') return system\n" +
  "    return system + String.fromCharCode(10, 10) + extra\n" +
  "  } catch { return system }\n" +
  "}\n";

function patchFile(file, mark, applyFn, label) {
  try {
    if (!fs.existsSync(file)) { console.log("[dsh-autofix]", label, "target not found:", file); return; }
    let d = fs.readFileSync(file, "utf8");
    if (d.includes(mark)) { console.log("[dsh-autofix]", label, "already patched"); return; }
    const next = applyFn(d);
    if (next === null || next === d) { console.log("[dsh-autofix]", label, "SKIP (pattern not matched)"); return; }
    fs.writeFileSync(file, next, "utf8");
    console.log("[dsh-autofix]", label, "PATCHED");
  } catch (e) {
    console.error("[dsh-autofix]", label, "FAILED:", e && e.message);
  }
}

function apply(_ctx) {
  // 1) file-drop: 图片拖拽放行
  patchFile(path.join(PROFILE_NM, "dsh-file-drop", "client.js"), FD_MARK, (d) => {
    if (!d.includes(FD_OLD)) return null;
    return d.replace(FD_OLD, FD_NEW);
  }, "file-drop image pass-through");

  // 1b) file-drop: 目录/文件图片 → 原生多模态草稿(桌面壳解析)
  const fdClient = path.join(PROFILE_NM, "dsh-file-drop", "client.js");
  patchFile(fdClient, FD_FOLDER_MARK, (dd) => {
    if (!dd.includes(FD_REG_OLD)) return null;
    dd = dd.replace(FD_REG_OLD, FD_REG_NEW);
    if (dd.includes(FD_HANDLE_OLD)) dd = dd.replace(FD_HANDLE_OLD, FD_HANDLE_NEW);
    return dd;
  }, "file-drop folder images");

  // 1c) image-input: 图片链接 URL → 下载入草稿(host + client)
  const iiHost = path.join(PROFILE_NM, "dsh-plugin-image-input", "lib", "index.js");
  patchFile(iiHost, II_HOST_MARK, (dd) => {
    if (!dd.includes(II_HOST_OLD)) return null;
    return dd.replace(II_HOST_OLD, II_HOST_NEW);
  }, "image-input from-url route");
  const iiClient = path.join(PROFILE_NM, "dsh-plugin-image-input", "lib", "client.js");
  patchFile(iiClient, II_CLIENT_MARK, (dd) => {
    if (!dd.includes(II_CLIENT_OLD)) return null;
    return dd.replace(II_CLIENT_OLD, II_CLIENT_NEW);
  }, "image-input url-images intercept");

  // 2) file-upload: 图片原生附件
  patchFile(path.join(PROFILE_NM, "dsh-file-upload", "lib", "client.js"), FU_MARK, (d) => {
    if (!d.includes(FU_OLD)) return null;
    return d.replace(FU_OLD, FU_NEW);
  }, "file-upload image draft");

  // 3) llm adapter: General Rules 注入
  const adapter = path.join(DSH_TREE, "packages", "llm", "llm-deepseek", "lib", "index.js");
  patchFile(adapter, ADAPTER_MARK, (d) => {
    if (!d.includes("function serializeRequest(options, defaults = {})") || !d.includes('role: "system"')) return null;
    let next = ADAPTER_HELPER + d;
    next = next.replace("function serializeRequest(options, defaults = {}) {", ADAPTER_FN + "\nfunction serializeRequest(options, defaults = {}) {");
    const before = next;
    next = next.replace(/(\tconst messages = \[\];\n\tif \(options\.system !== void 0\) messages\.push\(\{\n\t\trole: "system",\n\t\tcontent: )options\.system(\n\t\}\);)/g, "$1gsys$2");
    next = next.replace(/(\tconst messages = \[\];)/g, "\tconst gsys = withGlobalRules(options.system)\n$1");
    if (next === before || !next.includes("const gsys = withGlobalRules") || !next.includes("content: gsys")) return null;
    return next;
  }, "llm adapter General Rules injection");
}

exports.apply = apply;
