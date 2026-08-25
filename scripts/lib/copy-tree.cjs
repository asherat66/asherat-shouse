'use strict';
// 共享:递归复制目录树,正确处理 Windows junction/symlink。
// 符号链接/junction:读取目标并按「源根 → 目标根」重写后重建为 junction,避免递归展开与死循环。
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

function stripVerbatim(p) {
  if (typeof p !== 'string') return p;
  return p.replace(/^(\\\\\?\\|\\\?\\|\?\?\\)/, '');
}

function norm(p) {
  return path.resolve(stripVerbatim(p)).toLowerCase();
}

function retargetFactory(srcRoot, destRoot) {
  const S = norm(srcRoot);
  const D = norm(destRoot);
  return function retarget(absPath) {
    const cleaned = stripVerbatim(absPath);
    const n = norm(cleaned);
    if (n === S) return destRoot;
    if (n.startsWith(S + path.sep)) {
      return path.join(destRoot, path.relative(S, n));
    }
    return absPath; // 不在源树内,保留原样
  };
}

// skipNames:相对源根的子路径片段(如 "desktop"、".git")或 node_modules 缓存
function shouldSkip(relPath, skipSet) {
  const low = relPath.toLowerCase();
  for (const s of skipSet) {
    if (s === '.') continue;
    if (low === s) return true;
    if (low.startsWith(s + path.sep)) return true;
  }
  return false;
}

async function copyTree(srcRoot, destRoot, { skipNames = [] } = {}) {
  const skipSet = new Set(skipNames.map((s) => s.toLowerCase().replace(/[\\/]+$/, '')));
  const retarget = retargetFactory(srcRoot, destRoot);
  await fsp.mkdir(destRoot, { recursive: true });

  async function walk(src, dest, rel) {
    await fsp.mkdir(dest, { recursive: true }); // 为当前目录确保存在
    for (const entry of await fsp.readdir(src, { withFileTypes: true })) {
      const s = path.join(src, entry.name);
      const d = path.join(dest, entry.name);
      const relPath = rel ? rel + '/' + entry.name : entry.name;
      // 文件/目录级排除
      const stat = await fsp.lstat(s).catch(() => null);
      if (!stat) continue;
      if (shouldSkip(relPath, skipSet)) continue;

      if (stat.isSymbolicLink()) {
        // junction/symlink:readlink 目标 → 重写 → 重建 junction
        const target = await fsp.readlink(s);
        const nt = retarget(target);
        try { await fsp.symlink(nt, d, 'junction'); } catch (e) {
          console.error('  symlink create failed:', d, '->', nt, e.code);
        }
        continue;
      }
      if (stat.isDirectory()) { await walk(s, d, relPath); continue; }
      if (stat.isFile()) { await copyFileStream(s, d); }
    }
  }
  await walk(srcRoot, destRoot, '');
}

function copyFileStream(src, dest) {
  return new Promise((resolve, reject) => {
    const rs = fs.createReadStream(src);
    const ws = fs.createWriteStream(dest);
    rs.on('error', (e) => ws.destroy(e));
    ws.on('error', reject);
    ws.on('close', resolve);
    rs.pipe(ws);
  });
}

module.exports = { copyTree, retargetFactory, norm, stripVerbatim };
