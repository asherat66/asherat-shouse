'use strict';
// install-plugins.cjs — 一键安装本仓库内置插件到 dsh web profile。
// 用法: node scripts/install-plugins.cjs [--dsh <path-to-dsh-repo>]
//
// 做什么:
//   1. 安装 plugins/ 下所有自研插件 (file: 引用 → 记录到 profile package.json)
//   2. 把插件追加到 profile 的 dsh.profile.bundles
//   3. 初始化 ~/.dsh/AGENTS.md (General Rules 模板,存在则不覆盖)
//   4. 打印第三方插件(市场)的安装提示
// 要求: Node 22+, pnpm 11+ 已安装并在 PATH。

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const REPO_ROOT = path.resolve(__dirname, '..');
const PLUGINS_DIR = path.join(REPO_ROOT, 'plugins');
const HOME = process.env.DSH_HOME || process.env.USERPROFILE || os.homedir();
const PROFILE_DIR = path.join(HOME, '.dsh', 'profiles', 'web');
const PACKAGE_JSON = path.join(PROFILE_DIR, 'package.json');
const AGENTS_MD = path.join(HOME, '.dsh', 'AGENTS.md');
const RULES_TEMPLATE = path.join(PLUGINS_DIR, 'dsh-general-rules', 'lib', 'template.txt');

function sh(cmd) {
  console.log('>', cmd);
  execSync(cmd, { cwd: PROFILE_DIR, stdio: 'inherit', env: process.env });
}

function main() {
  if (!fs.existsSync(PROFILE_DIR)) {
    console.error('未找到 dsh web profile:', PROFILE_DIR);
    console.error('请先运行 dsh (--profile web) 一次,或用 dsh web 初始化 profile。');
    process.exit(1);
  }

  const plugins = fs.readdirSync(PLUGINS_DIR).filter((d) => fs.existsSync(path.join(PLUGINS_DIR, d, 'package.json')));
  if (plugins.length === 0) {
    console.error('plugins/ 目录为空');
    process.exit(1);
  }
  console.log('发现插件:', plugins.join(', '));

  // 1) pnpm add file: (绝对路径,可移植到任意安装位置)
  const specs = plugins.map((p) => 'file:' + path.join(PLUGINS_DIR, p).split(path.sep).join('/'));
  sh('pnpm add ' + specs.map((s) => '"' + s + '"').join(' '));

  // 2) bundles 注册
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || [];
  let changed = false;
  for (const p of plugins) {
    if (!bundles.includes(p)) { bundles.push(p); changed = true; }
  }
  if (changed) {
    pkg.dsh = pkg.dsh || {};
    pkg.dsh.profile = pkg.dsh.profile || {};
    pkg.dsh.profile.bundles = bundles;
    fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n');
    console.log('bundles 已更新:', bundles.join(', '));
  } else {
    console.log('bundles 已包含全部插件,跳过');
  }

  // 3) General Rules 模板初始化
  if (!fs.existsSync(AGENTS_MD) && fs.existsSync(RULES_TEMPLATE)) {
    fs.mkdirSync(path.dirname(AGENTS_MD), { recursive: true });
    fs.copyFileSync(RULES_TEMPLATE, AGENTS_MD);
    console.log('已初始化 ~/.dsh/AGENTS.md (General Rules)');
  } else if (fs.existsSync(AGENTS_MD)) {
    console.log('~/.dsh/AGENTS.md 已存在,保留现有内容');
  }

  // 4) 第三方插件提示
  console.log('');
  console.log('========================================================');
  console.log('下一步:');
  console.log('  1) 重启 dsh (或刷新页面) 加载插件');
  console.log('  2) 可选:第三方插件(插件市场/文件上传/费用统计等)通过市场安装:');
  console.log('     dsh plugin --profile web add dshmarket');
  console.log('     dsh plugin --profile web add dsh-file-upload');
  console.log('     dsh plugin --profile web add dsh-cost-meter');
  console.log('     dsh plugin --profile web add dsh-plugin-image-input');
  console.log('  3) General Rules 可在 设置 → General Rules 中编辑');
  console.log('========================================================');
  console.log('DONE');
}

main();
