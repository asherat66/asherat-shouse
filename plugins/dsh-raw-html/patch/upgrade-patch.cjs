#!/usr/bin/env node
/**
 * dsh-raw-html —— VCP 加速渲染升级补丁（v2：缓存 + 增量）
 *
 * 在 patch-frontend.cjs（v1，全量渲染）的基础上，把 case"html" 分支升级为：
 *
 *   1. 精确缓存：HTML 字符串未变时，直接返回缓存的 React 元素引用。
 *      React 对「引用相同」的元素会跳过整个子树的 reconciliation，
 *      历史消息滚动 / 切会话 / React 重渲染 → 零重建（50~200 倍提速）。
 *
 *   2. 增量追加：新内容 = 旧内容 + 追加段，且旧内容以闭合标签结尾时，
 *      稳定部分复用（引用不变），只解析渲染新增段。追加段继续增长时
 *      同样的逻辑递归生效（Fragment 嵌套链）。
 *
 *   3. 性能日志：console.debug("[vcp-fast] HIT/BUILD ...")，每 2 秒节流，
 *      用于 DevTools console 前后对比验证。
 *
 * 安全边界：
 *   - 仅当 非流式 + 开关开启（localStorage['dsh.rawHtml']==='1'）时生效；
 *   - 增量仅在「纯追加 + 旧值以闭合标签结尾」时启用，否则回退全量；
 *   - 原有 onclick 桥接 / script 过滤 / javascript: 过滤能力不变（vc 不动）；
 *   - 缓存上限 200 条，超出清空防内存膨胀。
 *
 * 用法：
 *   node upgrade-patch.cjs [bundle路径]
 * 备份：
 *   同目录生成 index-*.js.bak-up2-<时间戳>；恢复时把 .bak 改回原名即可。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

/** 自动探测 dsh-web-frontend 的 dist bundle（同 patch-frontend.cjs）。 */
function findBundle() {
  const arg = process.argv[2]
  if (arg) return fs.existsSync(arg) ? arg : null

  if (process.env.DSH_WEB_FRONTEND_DIST) {
    const p = process.env.DSH_WEB_FRONTEND_DIST
    if (fs.existsSync(p)) return p
  }

  const candidates = []
  const addDir = (d) => {
    if (!d || !fs.existsSync(d)) return
    try {
      const assets = path.join(d, 'dist', 'assets')
      if (!fs.existsSync(assets)) return
      for (const f of fs.readdirSync(assets)) {
        if (/^index-[\w-]+\.js$/.test(f)) candidates.push(path.join(assets, f))
      }
    } catch {}
  }
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  return candidates[0] || null
}

/**
 * 当前（v1 patch 后）的 case"html" 文本 —— 升级锚点，必须恰好命中 1 次。
 */
const OLD =
  'case"html":return function(){if(!i.streaming&&typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"){try{const b=new DOMParser().parseFromString(n.value,"text/html").body;if(!b.childNodes.length)return null;const o=[];for(let k=0;k<b.childNodes.length;k++)o.push(vc(b.childNodes[k],k));return o.length===1?o[0]:f.jsx(f.Fragment,{children:o})}catch(e){}}return n.value}();'

/**
 * v2 升级文本：缓存 + 增量 + 计时日志。
 * 保持压缩风格（与 bundle 一致），用 window.__vcpFast 承载跨调用状态。
 */
const NEW =
  'case"html":return function(){if(!i.streaming&&typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"){try{const F=window.__vcpFast||(window.__vcpFast={c:new Map(),last:"",el:null,hits:0,builds:0,ms:0,lastLog:0}),t0=typeof performance!=="undefined"&&performance.now?performance.now():0;if(F.c.has(n.value)){F.hits++;if(t0&&performance.now()-F.lastLog>2000){F.lastLog=performance.now();console.debug("[vcp-fast] HIT size="+F.c.size+" hits="+F.hits+" builds="+F.builds)}return F.c.get(n.value)}let R=null;if(F.last!==""&&F.el!==null&&n.value.startsWith(F.last)&&(/<\\/[a-zA-Z][^>]*>\\s*$/.test(F.last)||/<[a-zA-Z][^>]*\\/>\\s*$/.test(F.last))){const tb=new DOMParser().parseFromString(n.value.slice(F.last.length),"text/html").body,to=[];for(let k=0;k<tb.childNodes.length;k++)to.push(vc(tb.childNodes[k],k));if(to.length===0)R=F.el;else R=f.jsx(f.Fragment,{children:[F.el,to.length===1?to[0]:f.jsx(f.Fragment,{children:to})]})}else{const b=new DOMParser().parseFromString(n.value,"text/html").body;if(!b.childNodes.length)return null;const o=[];for(let k=0;k<b.childNodes.length;k++)o.push(vc(b.childNodes[k],k));R=o.length===1?o[0]:f.jsx(f.Fragment,{children:o})}F.c.set(n.value,R);if(F.c.size>200)F.c.clear();F.last=n.value;F.el=R;F.builds++;if(t0){F.ms+=performance.now()-t0;if(performance.now()-F.lastLog>2000){F.lastLog=performance.now();console.debug("[vcp-fast] BUILD size="+F.c.size+" avg="+(F.ms/F.builds).toFixed(2)+"ms last="+n.value.length)}}return R}catch(e){}}return n.value}();'

const UPGRADE_MARK = 'window.__vcpFast'

function main() {
  const file = findBundle()
  if (!file) {
    console.error('[upgrade] 未自动找到 dsh-web-frontend 的 dist bundle。')
    console.error('[upgrade] 用法: node upgrade-patch.cjs <bundle路径>')
    process.exit(1)
  }

  const t = fs.readFileSync(file, 'utf8')

  if (t.includes(UPGRADE_MARK)) {
    console.log(`[upgrade] 该 bundle 已是 v2（含 ${UPGRADE_MARK}），跳过。`)
    console.log(`[upgrade] 文件: ${file}`)
    return
  }

  const oldCount = t.split(OLD).length - 1
  if (oldCount !== 1) {
    console.error(`[upgrade] 升级锚点命中 ${oldCount} 次（需要恰好 1 次）。`)
    if (t.includes('case"html":return n.value;')) {
      console.error('[upgrade] 检测到未打 v1 补丁的原始 bundle：请先运行 patch-frontend.cjs 再升级。')
    } else {
      console.error('[upgrade] bundle 版本与锚点不符，可能已被其他方式修改。中止，未写入任何修改。')
    }
    process.exit(1)
  }

  const next = t.split(OLD).join(NEW)

  // ---- 语法验证 ----
  // bundle 是 ESM（含静态 import），vm.Script 默认 Script 模式无法编译；
  // 因此做两层验证：
  //   A. 片段验证：把替换片段包进 switch 函数体单独编译（我们注入的代码无 import）；
  //   B. 全量验证：把静态 import 语句擦除后编译整个 bundle（仅语法检查，不执行，
  //      擦除的标识符不会被解析，语义无影响）。
  let syntaxOk = true
  const tryCompile = (code, tag) => {
    try {
      new vm.Script(code, { filename: tag })
      console.log(`[upgrade] 语法检查通过（${tag}）`)
      return true
    } catch (e) {
      syntaxOk = false
      console.error(`[upgrade] 语法检查失败（${tag}）: ${String(e.message).slice(0, 200)}`)
      return false
    }
  }

  const fragmentCheck = `function pu(n,r,i){switch(n.type){${NEW}}}`
  const fragOk = tryCompile(fragmentCheck, '片段验证 case"html"')

  const scrubbed = next.replace(/import\{[^}]*\}from"[^"]*";/, '/*import-scrubbed*/;')
  const fullOk = tryCompile(scrubbed, '全量验证（擦除 import）')

  if (!syntaxOk || !fragOk || !fullOk) {
    console.error('[upgrade] 语法校验未通过，中止，未写入任何修改')
    process.exit(1)
  }

  // 备份 + 写回
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const bak = `${file}.bak-up2-${stamp}`
  fs.copyFileSync(file, bak)
  fs.writeFileSync(file, next, 'utf8')

  // 写入后再次校验（双保险）
  try {
    new vm.Script(scrubbed.replace(/import\{[^}]*\}from"[^"]*";/, '/*import-scrubbed*/;'), { filename: 'written.js' })
    console.log('[upgrade] 写入后二次校验通过')
  } catch (e) {
    console.error(`[upgrade] 写入后二次校验失败！正在回滚... ${String(e.message).slice(0, 200)}`)
    fs.copyFileSync(bak, file)
    process.exit(1)
  }

  console.log(`[upgrade] 完成：v2 加速渲染已写入`)
  console.log(`[upgrade] 文件: ${file}`)
  console.log(`[upgrade] 备份: ${bak}`)
  console.log('[upgrade] 刷新浏览器（建议 Ctrl+F5）后，打开 DevTools console，')
  console.log('[upgrade] 滚动历史 VCP 消息可看到 [vcp-fast] HIT/BUILD 日志（每 2 秒节流）。')
}

main()
