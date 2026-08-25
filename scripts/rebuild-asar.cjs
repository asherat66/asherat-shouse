'use strict';
// rebuild-asar.cjs - 修改 src/ 下的 Electron 壳代码(main.js/preload.js)后,
// 重新打包 app.asar 并更新到已解包的绿色版目录(dist/win-unpacked)。
// 秒级完成,无需重新 assemble / electron-builder。
//
// 用法: node scripts/rebuild-asar.cjs [目标 app.asar 路径]
// 默认目标: dist/win-unpacked/resources/app.asar
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

const DESKTOP = path.resolve(__dirname, '..');
const asarBin = path.join(DESKTOP, 'node_modules', '@electron', 'asar', 'bin', 'asar.js');
const defaultOut = path.join(DESKTOP, 'dist', 'win-unpacked', 'resources', 'app.asar');
const out = path.resolve(process.argv[2] || defaultOut);
const srcDir = path.join(DESKTOP, 'src');

if (!fs.existsSync(asarBin)) {
  console.error('未找到 asar:', asarBin);
  console.error('请先在 desktop 目录执行 npm install');
  process.exit(1);
}
if (!fs.existsSync(srcDir)) {
  console.error('未找到 src 目录:', srcDir);
  process.exit(1);
}

// app.asar 需要 package.json + src/ 的结构(与 electron-builder 打包结构一致)
const buildDir = path.join(DESKTOP, '.asar-build');
fs.rmSync(buildDir, { recursive: true, force: true });
fs.mkdirSync(path.join(buildDir, 'src'), { recursive: true });
fs.copyFileSync(path.join(DESKTOP, 'package.json'), path.join(buildDir, 'package.json'));
fs.copyFileSync(path.join(srcDir, 'main.js'), path.join(buildDir, 'src', 'main.js'));
fs.copyFileSync(path.join(srcDir, 'preload.js'), path.join(buildDir, 'src', 'preload.js'));

console.log('打包 app.asar ->', out);
const r = spawnSync(process.execPath, [asarBin, 'pack', buildDir, out], { stdio: 'inherit' });
fs.rmSync(buildDir, { recursive: true, force: true });
if (r.status !== 0) {
  console.error('ASAR_REBUILD_FAILED');
  process.exit(1);
}
console.log('DONE: app.asar 已更新');
