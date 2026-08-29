#!/usr/bin/env node
/**
 * dsh-raw-html —— 一键安装 / 升级脚本（v1 渲染补丁 + v2 加速引擎）
 *
 * 自动探测 dsh-web-frontend 的 dist bundle，按需补丁：
 *   - 原始 bundle         → 打 v1（HTML 渲染能力）+ v2（缓存 + 增量加速引擎）
 *   - 已打 v1 的 bundle   → 升 v2
 *   - 已打 v2 的 bundle   → 跳过（提示已是最新）
 *   - 无法识别的 bundle   → 安全报错，不写入任何修改
 *
 * 每一步都做语法校验（vm.Script，内存编译），失败自动回滚备份；
 * 锚点不匹配时中止（不会破坏对方环境）。
 *
 * 用法：
 *   node patch/install.cjs [bundle路径]      # 省略路径时自动探测
 *
 * 备份：
 *   同目录生成 index-*.js.bak-install-<时间戳>；恢复时把 .bak 改回原名即可。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

// ---- 锚点常量（与 patch-frontend.cjs / upgrade-patch.cjs 保持一致）----

// v1 · case"html" 渲染开关
const V1_HTML_OLD = 'case"html":return n.value;'
const V1_HTML_NEW =
  'case"html":return function(){if(!i.streaming&&typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"){try{const b=new DOMParser().parseFromString(n.value,"text/html").body;if(!b.childNodes.length)return null;const o=[];for(let k=0;k<b.childNodes.length;k++)o.push(vc(b.childNodes[k],k));return o.length===1?o[0]:f.jsx(f.Fragment,{children:o})}catch(e){}}return n.value}();'

// v1 · vc() 属性循环（onclick 桥 + 安全过滤）
const V1_VC_OLD =
  'for(const c of i.attributes)c.name==="class"?s.className=c.value:c.name==="style"?s.style=hp(c.value):s[c.name]=c.value;'
const V1_VC_NEW =
  'if(i.localName==="script"||i.localName==="iframe"||i.localName==="object"||i.localName==="embed")return null;for(const c of i.attributes){if(c.name==="onclick"){const m=/^input\\s*\\(\\s*[\'\"]([\\s\\S]*?)[\'\"]\\s*\\)\\s*;?\\s*$/.exec(c.value);if(m)s.onClick=function(){const fn=window.__dshInput;fn&&fn(m[1])};continue}if(c.name==="style"){s.style=hp(c.value);continue}if(c.name==="class"){s.className=c.value;continue}if((c.name==="href"||c.name==="src")&&/^\\s*javascript:/i.test(c.value))continue;s[c.name]=c.value}'

// v2 · 升级锚点 = v1 产物；替换为「缓存 + 增量」引擎
const V2_OLD = V1_HTML_NEW
const V2_NEW =
  'case"html":return function(){if(!i.streaming&&typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"){try{const F=window.__vcpFast||(window.__vcpFast={c:new Map(),last:"",el:null,hits:0,builds:0,ms:0,lastLog:0}),t0=typeof performance!=="undefined"&&performance.now?performance.now():0;if(F.c.has(n.value)){F.hits++;if(t0&&performance.now()-F.lastLog>2000){F.lastLog=performance.now();console.debug("[vcp-fast] HIT size="+F.c.size+" hits="+F.hits+" builds="+F.builds)}return F.c.get(n.value)}let R=null;if(F.last!==""&&F.el!==null&&n.value.startsWith(F.last)&&(/<\\/[a-zA-Z][^>]*>\\s*$/.test(F.last)||/<[a-zA-Z][^>]*\\/>\\s*$/.test(F.last))){const tb=new DOMParser().parseFromString(n.value.slice(F.last.length),"text/html").body,to=[];for(let k=0;k<tb.childNodes.length;k++)to.push(vc(tb.childNodes[k],k));if(to.length===0)R=F.el;else R=f.jsx(f.Fragment,{children:[F.el,to.length===1?to[0]:f.jsx(f.Fragment,{children:to})]})}else{const b=new DOMParser().parseFromString(n.value,"text/html").body;if(!b.childNodes.length)return null;const o=[];for(let k=0;k<b.childNodes.length;k++)o.push(vc(b.childNodes[k],k));R=o.length===1?o[0]:f.jsx(f.Fragment,{children:o})}F.c.set(n.value,R);if(F.c.size>200)F.c.clear();F.last=n.value;F.el=R;F.builds++;if(t0){F.ms+=performance.now()-t0;if(performance.now()-F.lastLog>2000){F.lastLog=performance.now();console.debug("[vcp-fast] BUILD size="+F.c.size+" avg="+(F.ms/F.builds).toFixed(2)+"ms last="+n.value.length)}}return R}catch(e){}}return n.value}();'

const V2_MARK = 'window.__vcpFast'

// ---- bundle 探测（同 patch-frontend.cjs）----
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

// ---- 工具 ----
function countOccurrences(text, needle) {
  return text.split(needle).length - 1
}

function tryCompile(code, tag) {
  try {
    new vm.Script(code, { filename: tag })
    return true
  } catch (e) {
    console.error(`[install] 语法校验失败（${tag}）: ${String(e.message).slice(0, 200)}`)
    return false
  }
}

function verifySyntax(fragmentCode, fullCode) {
  const fragOk = tryCompile(`function pu(n,r,i){switch(n.type){${fragmentCode}}}`, '片段校验')
  const scrubbed = fullCode.replace(/import\{[^}]*\}from"[^"]*";/, '/*import-scrubbed*/;')
  const fullOk = tryCompile(scrubbed, '全量校验（擦除 import）')
  return fragOk && fullOk
}

function main() {
  const file = findBundle()
  if (!file) {
    console.error('[install] 未自动找到 dsh-web-frontend 的 dist bundle。')
    console.error('[install] 用法: node patch/install.cjs <bundle路径>')
    process.exit(1)
  }

  console.log('[install] bundle:', file)
  const t = fs.readFileSync(file, 'utf8')

  // ---- 状态判定 ----
  if (t.includes(V2_MARK)) {
    console.log('[install] 该 bundle 已是 v2（含 window.__vcpFast），无需操作，跳过。')
    console.log('[install] 若需重装：先恢复备份，再运行本脚本。')
    return
  }

  const needV1 = t.includes(V1_HTML_OLD)
  const needV2 = t.includes(V2_OLD)
  if (!needV1 && !needV2) {
    console.error('[install] 无法识别的 bundle：既不是原始版本，也不是 v1 已补丁版本。')
    console.error('[install] 可能原因：dsh 版本过旧/过新导致压缩代码不同。已安全中止，未写入任何修改。')
    process.exit(1)
  }

  // ---- 备份 ----
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const bak = `${file}.bak-install-${stamp}`
  fs.copyFileSync(file, bak)
  console.log('[install] 备份:', bak)

  // ---- 应用补丁 ----
  let next = t
  const steps = []

  if (needV1) {
    for (const [label, from, to] of [
      ['v1 case"html"', V1_HTML_OLD, V1_HTML_NEW],
      ['v1 vc 属性循环', V1_VC_OLD, V1_VC_NEW],
    ]) {
      const n = countOccurrences(next, from)
      if (n !== 1) {
        console.error(`[install] 锚点 "${label}" 命中 ${n} 次（需要恰好 1 次），回滚备份并中止。`)
        fs.copyFileSync(bak, file)
        process.exit(1)
      }
      next = next.split(from).join(to)
    }
    steps.push('v1（HTML 渲染）')
    console.log('[install] ✓ v1 补丁就绪')
  }

  {
    const n = countOccurrences(next, V2_OLD)
    if (n !== 1) {
      console.error(`[install] v2 锚点命中 ${n} 次（需要恰好 1 次），回滚备份并中止。`)
      fs.copyFileSync(bak, file)
      process.exit(1)
    }
    next = next.split(V2_OLD).join(V2_NEW)
    steps.push('v2（缓存 + 增量加速引擎）')
    console.log('[install] ✓ v2 补丁就绪')
  }

  // ---- 语法校验 ----
  if (!verifySyntax(V2_NEW, next)) {
    console.error('[install] 语法校验未通过，回滚备份并中止。')
    fs.copyFileSync(bak, file)
    process.exit(1)
  }

  // ---- 写回 + 二次校验 ----
  fs.writeFileSync(file, next, 'utf8')
  const written = fs.readFileSync(file, 'utf8')
  if (!written.includes(V2_MARK)) {
    console.error('[install] 写入后校验失败（未找到 v2 标记），回滚备份并中止。')
    fs.copyFileSync(bak, file)
    process.exit(1)
  }
  if (!verifySyntax(V2_NEW, written)) {
    console.error('[install] 写入后语法校验失败，回滚备份并中止。')
    fs.copyFileSync(bak, file)
    process.exit(1)
  }

  console.log(`[install] 完成：已应用 ${steps.join(' + ')}`)
  console.log('[install] 下一步：刷新浏览器（建议 Ctrl+F5）。')
  console.log('[install] 验证：DevTools console 中滚动历史 VCP 消息可见 [vcp-fast] HIT/BUILD 日志。')
}

main()
