'use strict';
// 绿包/桌面壳的 profile 初始化 —— 与安装器的 initProfile 对齐。
// 背景(v0.1.4 缺陷): 绿色包没有初始化步骤, dsh CLI 首次启动只会生成裸模板
// (官方 2 个 bundle + 空依赖, 见 dsh-app-boot PROFILE_TEMPLATES.web),
// 新用户的插件/General Rules/Prompt Copy 全部缺失。
// 本模块: 新用户启动时把发行包 .install/profile(全套插件+规则)落到 DSH_HOME/profiles/web,
// 并种子 AGENTS.md。幂等规则:
//   - profile 不存在         → 全量初始化
//   - 裸模板(官方2项+空依赖, dsh CLI 自动生成的) → 合并补全(升级自愈)
//   - 完整/用户自定义 profile → 不干预(绝不覆盖 cordis.patch.yml 等用户层)
const fs = require('node:fs');
const path = require('node:path');

/** dsh CLI 首次启动生成的 web 裸模板 bundles(PROFILE_TEMPLATES.web)。 */
const WEB_TEMPLATE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'];

function stripVerbatim(p) {
  if (typeof p !== 'string') return p;
  return p.replace(/^(\\\\\?\\|\\\?\\|\?\?\\)/, '');
}

function norm(p) {
  return path.resolve(stripVerbatim(p)).toLowerCase();
}

/** 源根 → 目标根 重写 junction 目标(构建机绝对路径 → 本机), 源树外路径保留原样。 */
function retargetFactory(srcRoot, destRoot) {
  const S = norm(srcRoot);
  return function retarget(absPath) {
    const n = norm(absPath);
    if (n === S) return destRoot;
    if (n.startsWith(S + path.sep)) {
      return path.join(destRoot, path.relative(S, n));
    }
    return absPath;
  };
}

/** 递归复制目录树: junction/symlink 重写目标后重建, 避免展开成死链; 文件级覆盖。 */
function copyDir(srcRoot, destRoot) {
  const retarget = retargetFactory(srcRoot, destRoot);
  function walk(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      let stat;
      try { stat = fs.lstatSync(s); } catch { continue; }
      if (stat.isSymbolicLink()) {
        try {
          // 目标位置若是普通文件/目录(解压器把 junction 展开成占位), 先清理再建链
          if (fs.existsSync(d) && !fs.lstatSync(d).isSymbolicLink()) fs.rmSync(d, { force: true, recursive: true });
          fs.symlinkSync(retarget(fs.readlinkSync(s)), d, 'junction');
        } catch { /* 单条失败跳过, 其余继续 */ }
        continue;
      }
      if (stat.isDirectory()) { walk(s, d); continue; }
      if (stat.isFile()) fs.writeFileSync(d, fs.readFileSync(s));
    }
  }
  walk(srcRoot, destRoot);
}

function readManifest(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function isBareTemplate(m) {
  return m !== null
    && m.name === 'dsh-profile-web'
    && JSON.stringify(m.dsh?.profile?.bundles || []) === JSON.stringify(WEB_TEMPLATE_BUNDLES)
    && Object.keys(m.dependencies || {}).length === 0;
}

/**
 * 确保 DSH_HOME 的 web profile 已初始化。
 * @param {object} opts
 * @param {string} opts.appRoot - 应用根(exe 同级, 含 .install)
 * @param {string} opts.home - DSH_HOME(与启动 dsh 子进程注入的一致)
 * @param {(msg: string) => void} opts.log - 日志回调
 * @returns {{action: string}} init | heal-bare | seed-agents | noop | no-shipped
 */
function ensureProfile({ appRoot, home, log = () => {} }) {
  const profileSrc = path.join(appRoot, '.install', 'profile');
  const agentsSrc = path.join(appRoot, '.install', 'AGENTS.md');
  if (!fs.existsSync(profileSrc)) {
    log('ensureProfile: 无内置 .install/profile, 跳过');
    return { action: 'no-shipped' };
  }
  if (typeof home !== 'string' || home.trim() === '') {
    log('ensureProfile: home 为空, 跳过');
    return { action: 'no-home' };
  }
  const webDir = path.join(home, 'profiles', 'web');
  const manifestPath = path.join(webDir, 'package.json');
  let action = 'noop';

  if (!fs.existsSync(manifestPath)) {
    log('ensureProfile: 初始化 profile -> ' + webDir);
    fs.mkdirSync(webDir, { recursive: true });
    copyDir(profileSrc, webDir);
    action = 'init';
  } else if (isBareTemplate(readManifest(manifestPath))) {
    // dsh 自动生成的裸模板 → 升级自愈: 合并依赖与 bundles, 补齐插件实体, 不动用户 patch 层
    const shipped = readManifest(path.join(profileSrc, 'package.json'));
    const m = readManifest(manifestPath);
    if (shipped && shipped.dependencies) {
      log('ensureProfile: 检测到裸模板, 合并 ' + Object.keys(shipped.dependencies).length + ' 依赖 + ' +
        (shipped.dsh?.profile?.bundles || []).length + ' bundles');
      m.dependencies = shipped.dependencies;
      m.dsh = m.dsh || {};
      m.dsh.profile = m.dsh.profile || {};
      m.dsh.profile.bundles = [...(shipped.dsh?.profile?.bundles || [])];
      fs.writeFileSync(manifestPath, JSON.stringify(m, undefined, 2) + '\n');
      copyDir(path.join(profileSrc, 'node_modules'), path.join(webDir, 'node_modules'));
      action = 'heal-bare';
    }
  }
  // AGENTS.md 种子(仅缺失时; 与安装器一致, 绝不覆盖已有内容)
  if (fs.existsSync(agentsSrc) && !fs.existsSync(path.join(home, 'AGENTS.md'))) {
    fs.mkdirSync(home, { recursive: true });
    fs.writeFileSync(path.join(home, 'AGENTS.md'), fs.readFileSync(agentsSrc));
    if (action === 'noop') { action = 'seed-agents'; log('ensureProfile: 种子 AGENTS.md'); }
  }
  return { action };
}

// CLI 自测入口:  node ensure-profile.cjs --appRoot <app> --home <home> [--log]
function cliMain() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i += 2) {
    if (argv[i].startsWith('--')) args[argv[i].slice(2)] = argv[i + 1];
  }
  const appRoot = args.appRoot || path.resolve(__dirname, '..');
  const home = args.home;
  if (!home) { console.error('usage: node ensure-profile.cjs --appRoot <app> --home <home>'); process.exit(2); }
  console.log(JSON.stringify(ensureProfile({ appRoot, home, log: (m) => console.log(m) })));
}

module.exports = { ensureProfile, copyDir, isBareTemplate };

if (require.main === module) cliMain();
