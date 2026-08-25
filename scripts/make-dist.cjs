'use strict';
// make-dist.cjs - 作者端:把构建好的绿色版(dist/win-unpacked)打包为可分发的发行包。
//
// 关键:绿色版含大量 Windows junction(pnpm workspace),zip/tar 无法无损保存。
// 本脚本把"实体文件"去重打包(junction 目标只打一次),并把每个链接记录到
// manifest.links.json;安装器解压后按清单重建 junction -> 任何位置可用。
//
// 副产品:同时导出本机 dsh profile(插件+配置,剔除凭据)与 AGENTS.md,
// 使安装器能初始化出与作者一致的插件环境(API Key 由用户首次填写)。
//
// 用法: node scripts/make-dist.cjs [--out dist/release] [--skip-profile]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const DESKTOP = path.resolve(__dirname, '..');
const SRC = process.argv.includes('--src') ? process.argv[process.argv.indexOf('--src') + 1] : path.join(DESKTOP, 'dist', 'win-unpacked');
const OUT_DIR_ARG = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(DESKTOP, 'dist', 'release');
const SKIP_PROFILE = process.argv.includes('--skip-profile');
const HOME = process.env.USERPROFILE || process.env.HOME;
const PROFILE_SRC = path.join(HOME, '.dsh', 'profiles', 'web');
const AGENTS_SRC = path.join(HOME, '.dsh', 'AGENTS.md');

if (!fs.existsSync(SRC)) { console.error('源目录不存在:', SRC); process.exit(1); }

// ── 1) 扫描:staging 放实体文件,记录链接清单 ──
const STAGING = path.join(DESKTOP, 'dist', '.staging');
const links = [];
fs.rmSync(STAGING, { recursive: true, force: true });
fs.mkdirSync(STAGING, { recursive: true });

function stripVerbatim(p) {
  if (typeof p !== 'string') return p;
  var BS = String.fromCharCode(92);
  for (const prefix of [BS + BS + '?' + BS, BS + '??' + BS, '?' + BS]) {
    if (p.startsWith(prefix)) return p.slice(prefix.length);
  }
  return p;
}

function rel(p) { return path.relative(SRC, p).split(path.sep).join('/'); }

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const s = path.join(dir, entry.name);
    const d = path.join(STAGING, rel(s));
    const st = fs.lstatSync(s);
    if (st.isSymbolicLink()) {
      const target = stripVerbatim(fs.readlinkSync(s));
      // target 可能在包内/包外;记录原样,安装器再做解析(包内转相对)
      links.push({ path: rel(s), target });
      continue;
    }
    if (st.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      walk(s);
    } else if (st.isFile()) {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
    }
  }
}
walk(SRC);
fs.writeFileSync(path.join(STAGING, 'manifest.links.json'), JSON.stringify(links, null, 1));
console.log('scanned:', links.length, 'links | staging:', STAGING);

// ── 2) profile 导出(剔除凭据) ──
if (!SKIP_PROFILE && fs.existsSync(PROFILE_SRC)) {
  const PROFILE_STAGING = path.join(STAGING, '.install', 'profile');
  fs.mkdirSync(PROFILE_STAGING, { recursive: true });
  // 用同 walk 逻辑复制 profile(跳过 junction? profile 内可能也有 .pnpm)
  function walkProfile(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === '.credentials.yaml' || entry.name.includes('token') || entry.name.includes('secret')) continue;
      const s = path.join(dir, entry.name);
      const d = path.join(PROFILE_STAGING, path.relative(PROFILE_SRC, s).split(path.sep).join('/'));
      const st = fs.lstatSync(s);
      if (st.isSymbolicLink()) { links.push({ path: '.install/profile/' + path.relative(PROFILE_SRC, s).split(path.sep).join('/'), target: stripVerbatim(fs.readlinkSync(s)) }); continue; }
      if (st.isDirectory()) { fs.mkdirSync(d, { recursive: true }); walkProfile(s); }
      else if (st.isFile()) { fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(s, d); }
    }
  }
  walkProfile(PROFILE_SRC);
  if (fs.existsSync(AGENTS_SRC)) {
    fs.mkdirSync(path.join(STAGING, '.install'), { recursive: true });
    fs.copyFileSync(AGENTS_SRC, path.join(STAGING, '.install', 'AGENTS.md'));
  }
  fs.writeFileSync(path.join(STAGING, 'manifest.links.json'), JSON.stringify(links, null, 1));
  console.log('profile exported (credentials excluded)');
}

// ── 3) 压缩 ──
fs.mkdirSync(OUT_DIR_ARG, { recursive: true });
const version = JSON.parse(fs.readFileSync(path.join(DESKTOP, 'package.json'), 'utf8')).version;
const outZip = path.join(OUT_DIR_ARG, `dsh-desktop.v${version}.win-x64.zip`);
if (fs.existsSync(outZip)) fs.rmSync(outZip);
// 用 7za(无 junction,快速) 或系统 tar
const SEVEN_ZIP = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache', '7zip@1.0.0', '7zip-win-x64-a34pt', 'bin', '7za.exe');
const use7z = fs.existsSync(SEVEN_ZIP);
if (use7z) {
  execFileSync(SEVEN_ZIP, ['a', '-tzip', '-mx=5', '-mmt=on', outZip, '.'], { cwd: STAGING, stdio: 'inherit' });
} else {
  execFileSync('C:\Windows\System32\tar.exe', ['--options', 'zip:compression=deflate', '-a', '-cf', outZip, '.'], { cwd: STAGING, stdio: 'inherit' });
}
const sz = fs.statSync(outZip).size;
console.log('DONE:', outZip, '(', (sz / 1024 / 1024).toFixed(1), 'MB )');
fs.rmSync(STAGING, { recursive: true, force: true });
