// relink.cjs - 修复 DeepSeek Harness 绿色版中的 junction 目标路径。
// 用途:绿色版目录被拷贝/移动到新位置后,内部 node_modules 的 junction 目标仍指向旧路径,
// 运行本脚本可把所有 junction 目标改写为新目录内的对应路径(旧根 -> 新根)。
// 用法: node relink.cjs <绿色版目录根路径>
//
// === DeepSeek Harness 桌面版(绿色版)使用说明 ===
// 1. 启动: 双击 DeepSeek Harness.exe(或桌面快捷方式 DeepSeek Harness.lnk)。
//    应用会自动启动内置 dsh web 服务(http://127.0.0.1:3080)并加载到窗口,
//    首次启动约需 10~30 秒。
// 2. 不要直接移动/拷贝本目录: 内部依赖大量 Windows junction 链接(pnpm workspace),
//    其目标指向本位置的绝对路径。当前位置运行无问题。
// 3. 若拷贝到新位置, 先在新目录内运行一次: node relink.cjs
//    即可把所有 junction 目标改写为新路径。
// 4. 若杀毒软件拦截, 请允许运行(应用未签名)。
// 5. 端口 3080 被占用会导致启动失败, 请先释放该端口。
// 6. 需要安装包(.exe/.zip)的说明: pnpm workspace 的 junction 网络无法被
//    zip/NSIS 无损打包(7za 跟随链接会无限递归), 故以绿色版目录交付。
'use strict';
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

function stripVerbatim(p) {
  if (typeof p !== 'string') return p;
  for (const prefix of [String.fromCharCode(92, 92, 63, 92), String.fromCharCode(92, 63, 63, 92), String.fromCharCode(63, 92)]) {
    if (p.startsWith(prefix)) return p.slice(prefix.length);
  }
  return p;
}
function norm(p) { return path.resolve(stripVerbatim(p)).toLowerCase(); }

async function walkRelink(root) {
  let fixed = 0, ok = 0, failed = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = await fsp.readdir(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      let st;
      try { st = await fsp.lstat(p); } catch { continue; }
      if (st.isSymbolicLink()) {
        let target;
        try { target = await fsp.readlink(p); } catch { failed++; continue; }
        const clean = stripVerbatim(target);
        // 目标在旧根内 -> 改写为新根内相对路径(基于当前目录根)
        const oldRoot = norm(root);
        // 尝试从任意"根"识别:目标通常是 <旧根>\resources\dsh\... 或 <旧根>\node_modules\.pnpm\...
        // 通用做法:找出目标中属于"旧根"的最长前缀段
        const tn = norm(path.isAbsolute(clean) ? clean : path.resolve(dir, clean));
        if (tn.startsWith(oldRoot + path.sep)) {
          const rel = path.relative(oldRoot, tn);
          const newTarget = path.join(root, rel);
          try {
            await fsp.symlink(newTarget, p, 'junction'); // 重建 junction(覆盖)
            fixed++;
          } catch (err) {
            // 可能目标已存在,删除后重建
            try { await fsp.rm(p, { recursive: false }); await fsp.symlink(newTarget, p, 'junction'); fixed++; }
            catch (e2) { failed++; console.warn('relink fail:', p, e2.code); }
          }
        } else {
          ok++; // 目标在树外,保持原样
        }
      } else if (st.isDirectory()) {
        stack.push(p);
      }
    }
  }
  console.log('RELINK_DONE fixed=' + fixed + ' untouched=' + ok + ' failed=' + failed);
}

const root = path.resolve(process.argv[2] || '.');
console.log('root =', root);
walkRelink(root).catch((e) => { console.error('RELINK_FAILED:', e); process.exit(1); });
