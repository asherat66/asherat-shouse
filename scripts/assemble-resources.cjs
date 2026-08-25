'use strict';
// eslint-disable-next-line no-undef
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { copyTree } = require('./lib/copy-tree.cjs');

const DESKTOP = path.resolve(__dirname, '..');
const RES = path.join(DESKTOP, 'resources');
// dsh 主仓库源码位置:默认取 desktop 的上一级目录(相邻 clone),可用环境变量 DSH_SRC 覆盖
const DSH_SRC = path.resolve(process.env.DSH_SRC || path.resolve(DESKTOP, '..'));
const DSH_DEST = path.join(RES, 'dsh');             // desktop/resources/dsh

const NODE_SRC = (process.env.NODE_SYSTEM_DIR || path.dirname(process.execPath)).trim();
const NODE_EXE_NAME = process.platform === 'win32' ? 'node.exe' : 'node';

// 复制的排除项(相对 DSH_SRC 根的路径片段)
const SKIP = ['.git', '.dsh-build', 'desktop', 'node_modules/.cache'];

function reset(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  console.log('reset:', dir);
}

async function main() {
  console.log('DSH_SRC =', DSH_SRC);
  console.log('DSH_DEST =', DSH_DEST);
  fs.mkdirSync(RES, { recursive: true });

  // 1) 组装 dsh 代码库(junction 保留并改写目标前缀)
  reset(DSH_DEST);
  await copyTree(DSH_SRC, DSH_DEST, { skipNames: SKIP });
  console.log('dsh copied ->', DSH_DEST);

  // 2) 复制独立 Node 运行时(C:\ *\node.exe)
  const nodeDir = path.join(RES, 'node');
  reset(nodeDir);
  const srcNode = path.join(NODE_SRC, NODE_EXE_NAME);
  if (!fs.existsSync(srcNode)) throw new Error('未找到 node.exe:' + srcNode);
  fs.copyFileSync(srcNode, path.join(nodeDir, NODE_EXE_NAME));
  console.log('node copied ->', path.join(nodeDir, NODE_EXE_NAME));

  console.log('ASSEMBLE_DONE');
}

main().catch((e) => { console.error('ASSEMBLE_FAILED:', e); process.exit(1); });
