'use strict';
// electron-builder afterPack 钩子:
// electron-builder 自身的复制器无法正确处理含 Windows junction 的 1.4G node_modules
// (递归进入交叉引用网络,导致复制不完整/死循环)。
// 因此 extraResources 不声明 dsh,改由本钩子在 win-unpacked 生成后,
// 用我们验证过的 copyTree(保留 junction + 改写绝对路径前缀)把 dsh 注入 resources/。
const fs = require('node:fs');
const path = require('node:path');
const { copyTree } = require('./lib/copy-tree.cjs');

const DESKTOP = path.resolve(__dirname, '..');
const RES = path.join(DESKTOP, 'resources');
const SRC_DSH = path.join(RES, 'dsh');     // desktop/resources/dsh(assemble 产物)
const SRC_NODE = path.join(RES, 'node');   // desktop/resources/node(独立 node.exe)

function reset(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = async function afterPack(context) {
  const appOutDir = context.appOutDir; // win-unpacked
  const resOut = path.join(appOutDir, 'resources');
  fs.mkdirSync(resOut, { recursive: true });

  console.log('[afterPack] inject dsh ->', path.join(resOut, 'dsh'));
  reset(path.join(resOut, 'dsh'));
  await copyTree(SRC_DSH, path.join(resOut, 'dsh'));

  console.log('[afterPack] inject node ->', path.join(resOut, 'node'));
  reset(path.join(resOut, 'node'));
  await copyTree(SRC_NODE, path.join(resOut, 'node'));

  console.log('[afterPack] done');
};
