'use strict';
// build-shipped-profile.cjs —— 从仓库自建 shipped profile(CI 可复现,不再依赖作者本机 ~/.dsh)。
// 背景(2026-08-28): v0.1.5 的 make-dist 从 $USERPROFILE/.dsh/profiles/web 导出 profile,
// 但 GitHub Actions runner 上没有作者数据 → 静默跳过 → zip 无 .install/profile → 新用户无插件。
// 本脚本: 按 shipped-profile.json 重建同一环境:
//   1. 复制仓库 plugins/ 到 .install-src/profile/plugins(file: 依赖源, 包内)
//   2. 写 profile/package.json(bundles + dependencies)
//   3. pnpm install 拉取 npm/tarball 依赖
//   4. 把 node_modules 全部 symlink 展开为实体(客户端不跑 pnpm, 无外部链接=无死链)
//   5. 复制 AGENTS.md(General Rules, 若存在)
// 输出目录结构 == make-dist 期望的 <out>/{profile,AGENTS.md}。
//
// 用法: node scripts/build-shipped-profile.cjs [--out .install-src] [--agents <file>] [--skip-install]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DESKTOP = path.resolve(__dirname, '..');
const DEF = require(path.join(__dirname, 'shipped-profile.json'));

function argVal(name, dflt) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : dflt;
}
const OUT = path.resolve(argVal('out', path.join(DESKTOP, '.install-src')));
const REPO = path.resolve(argVal('repo', DESKTOP));
const SKIP_INSTALL = process.argv.includes('--skip-install');

function log(...a) { console.log('[build-shipped]', ...a); }

function rmTree(p) { fs.rmSync(p, { recursive: true, force: true }); }

/** 实体复制目录树: symlink 就地展开(目标在 OUT 内), 不再产生任何链接实体。 */
function copyTreeFlat(src, dest, skipNames = []) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (skipNames.includes(entry.name)) continue;
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    let st;
    try { st = fs.lstatSync(s); } catch { continue; }
    if (st.isSymbolicLink()) {
      // 链接目标 -> 实体拷贝; 目标在包内/外都按同一处理(不信任外部链接)
      const t = path.resolve(path.dirname(s), fs.readlinkSync(s));
      // 防环: 文件名已存在于 dest 时跳过
      if (fs.existsSync(d)) { fs.rmSync(d, { force: true, recursive: true }); }
      if (!fs.existsSync(t)) { log('WARN: broken link, skipping:', s, '->', t); continue; }
      copyTreeFlat(t, d, ['node_modules', '.git']); // 展开时不再递归进依赖的 node_modules(已由 pnpm 扁平化)
      continue;
    }
    if (st.isDirectory()) {
      copyTreeFlat(s, d, skipNames);
    } else if (st.isFile()) {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
}

/**
 * 把 node_modules 内全部 symlink 替换为实体(本地 file: 源已复制进包内, npm/tarball 在 .pnpm 内)。
 * 链接目标越出 OUT 的视为构建错误(避免客户端死链)。
 */
function flattenAll(root, outRoot) {
  const normRoot = path.resolve(root);
  const normOut = path.resolve(outRoot);
  let fixed = 0;
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      let l;
      try { l = fs.lstatSync(p); } catch { continue; }
      if (l.isSymbolicLink()) {
        const t = path.resolve(path.dirname(p), fs.readlinkSync(p));
        if (!path.resolve(t).toLowerCase().startsWith(normOut.toLowerCase())) {
          throw new Error(`flatten: 链接目标越出包内: ${p} -> ${t}`);
        }
        fs.rmSync(p, { force: true, recursive: true });
        copyTreeFlat(path.resolve(t), p, ['node_modules', '.git']);
        fixed++;
      } else if (l.isDirectory()) {
        walk(p);
      }
    }
  }
  walk(normRoot);
  return fixed;
}

function dirSize(p) {
  let s = 0;
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    try {
      const st = fs.lstatSync(f);
      if (st.isDirectory()) s += dirSize(f);
      else if (st.isFile()) s += st.size;
    } catch {}
  }
  return s;
}

function main() {
  const def = DEF;
  const profileSrc = path.join(REPO, def.pluginsDir || 'plugins');
  if (!fs.existsSync(profileSrc)) throw new Error('plugins 目录不存在: ' + profileSrc);

  log('out =', OUT, '| repo =', REPO);
  rmTree(OUT);
  fs.mkdirSync(OUT, { recursive: true });

  // 1) 复制插件源码 -> out/profile/plugins(保留全部源码, 不含 node_modules/.git)
  const pluginsDest = path.join(OUT, 'profile', 'plugins');
  copyTreeFlat(profileSrc, pluginsDest, ['node_modules', '.git', '.DS_Store']);

  // 2) profile/package.json(注意: pnpm 11 不再读 package.json 的 "pnpm" 字段,
  //    allowBuilds 由 approve-builds 写入 profile/pnpm-workspace.yaml)
  const pkg = {
    name: 'dsh-profile-web',
    private: true,
    dependencies: def.profile.dependencies,
    dsh: { profile: { bundles: def.profile.bundles } },
  };
  const pkgPath = path.join(OUT, 'profile', 'package.json');
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  log('bundles:', def.profile.bundles.length, '| deps:', Object.keys(def.profile.dependencies).length);

  // 3) pnpm install(node-linker=hoisted: 传统扁平实体布局, 无 .pnpm virtual store、
  //    无 junction —— 只有零链接树才保证客户端(不跑 pnpm)可用; 默认布局的互链展开会爆炸)
  //    pnpm 11 默认拒绝依赖生命周期脚本(ERR_PNPM_IGNORED_BUILDS, sharp/tesseract 原生二进
  //    制会缺失)且不再读 package.json 的 pnpm 字段 —— 需要 install -> approve-builds -> install。
  if (!SKIP_INSTALL) {
    log('pnpm install (node-linker=hoisted) ...');
    // Windows 下 pnpm 是 .cmd 封装, execFileSync 需经 shell 转发(cmd.exe /bin/sh 均适用)
    const PNPM = process.env.PNPM || 'pnpm';
    const profileDir = path.join(OUT, 'profile');
    const pnpmRun = (args, fatal = true) => {
      try {
        execFileSync(PNPM, args, { cwd: profileDir, stdio: 'inherit', env: process.env, shell: true });
        return true;
      } catch (e) {
        // 第一轮 install 因 ERR_PNPM_IGNORED_BUILDS 退出非零是可预期路径 —— 继续 approve 流程
        if (!e.status) log('pnpm 调用失败(非构建审批原因):', e.message);
        if (fatal) throw e;
        return false;
      }
    };
    pnpmRun(['install', '--node-linker=hoisted'], false);
    pnpmRun(['approve-builds', '--all']);           // 写入 profile/pnpm-workspace.yaml(仅生成本机)
    pnpmRun(['install', '--node-linker=hoisted']);  // 命中审批, 原生依赖脚本正式执行
  }

  // 4) 展开 symlink -> 实体(客户端零链接)
  const nm = path.join(OUT, 'profile', 'node_modules');
  if (fs.existsSync(nm)) {
    const fixed = flattenAll(nm, OUT);
    log('flatten: replaced', fixed, 'links');
  }

  // 5) AGENTS.md(General Rules; 缺失仅警告 —— make-dist 打包时以实际存在为准)
  const agents = path.resolve(argVal('agents', path.join(REPO, def.agentsFile || 'AGENTS.md')));
  if (fs.existsSync(agents)) {
    fs.copyFileSync(agents, path.join(OUT, 'AGENTS.md'));
    log('AGENTS.md copied from', agents);
  } else {
    log('WARN: AGENTS.md 不存在(新用户将无 General Rules):', agents);
  }

  log('DONE. size =', (dirSize(OUT) / 1024 / 1024).toFixed(1), 'MB');
}

main();
