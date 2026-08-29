#!/usr/bin/env node
/**
 * dsh-raw-html —— 排查补丁：v2-safe（只保留精确缓存，禁用增量路径）
 *
 * 目的：二分定位「卡片背景未包裹全部内容」问题。
 *   若应用本补丁后恢复正常 → 凶手是增量路径（增量把卡片闭合标签后的
 *   追加内容当成「卡片外新块」，导致内容溢出背景）；
 *   若仍异常 → 凶手在 CSS/渲染链路，另行排查。
 *
 * 用法：
 *   node vcp-safe.cjs [bundle路径]
 * 备份：
 *   同目录生成 index-*.js.bak-safe-<时间戳>。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

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

// 当前 v2 引擎文本（含增量）—— 锚点
const V2_OLD =
  'case"html":return function(){if(!i.streaming&&typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"){try{const F=window.__vcpFast||(window.__vcpFast={c:new Map(),last:"",el:null,hits:0,builds:0,ms:0,lastLog:0}),t0=typeof performance!=="undefined"&&performance.now?performance.now():0;if(F.c.has(n.value)){F.hits++;if(t0&&performance.now()-F.lastLog>2000){F.lastLog=performance.now();console.debug("[vcp-fast] HIT size="+F.c.size+" hits="+F.hits+" builds="+F.builds)}return F.c.get(n.value)}let R=null;if(F.last!==""&&F.el!==null&&n.value.startsWith(F.last)&&(/<\\/[a-zA-Z][^>]*>\\s*$/.test(F.last)||/<[a-zA-Z][^>]*\\/>\\s*$/.test(F.last))){const tb=new DOMParser().parseFromString(n.value.slice(F.last.length),"text/html").body,to=[];for(let k=0;k<tb.childNodes.length;k++)to.push(vc(tb.childNodes[k],k));if(to.length===0)R=F.el;else R=f.jsx(f.Fragment,{children:[F.el,to.length===1?to[0]:f.jsx(f.Fragment,{children:to})]})}else{const b=new DOMParser().parseFromString(n.value,"text/html").body;if(!b.childNodes.length)return null;const o=[];for(let k=0;k<b.childNodes.length;k++)o.push(vc(b.childNodes[k],k));R=o.length===1?o[0]:f.jsx(f.Fragment,{children:o})}F.c.set(n.value,R);if(F.c.size>200)F.c.clear();F.last=n.value;F.el=R;F.builds++;if(t0){F.ms+=performance.now()-t0;if(performance.now()-F.lastLog>2000){F.lastLog=performance.now();console.debug("[vcp-fast] BUILD size="+F.c.size+" avg="+(F.ms/F.builds).toFixed(2)+"ms last="+n.value.length)}}return R}catch(e){}}return n.value}();'

// v2-safe：只保留精确缓存，去掉增量（无 last/el，全量构建后缓存）
const V2_SAFE =
  'case"html":return function(){if(!i.streaming&&typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"){try{const F=window.__vcpFast||(window.__vcpFast={c:new Map(),hits:0,builds:0,ms:0,lastLog:0}),t0=typeof performance!=="undefined"&&performance.now?performance.now():0;if(F.c.has(n.value)){F.hits++;if(t0&&performance.now()-F.lastLog>2000){F.lastLog=performance.now();console.debug("[vcp-fast] HIT size="+F.c.size+" hits="+F.hits+" builds="+F.builds)}return F.c.get(n.value)}const b=new DOMParser().parseFromString(n.value,"text/html").body;if(!b.childNodes.length)return null;const o=[];for(let k=0;k<b.childNodes.length;k++)o.push(vc(b.childNodes[k],k));const R=o.length===1?o[0]:f.jsx(f.Fragment,{children:o});F.c.set(n.value,R);if(F.c.size>200)F.c.clear();F.builds++;if(t0){F.ms+=performance.now()-t0;if(performance.now()-F.lastLog>2000){F.lastLog=performance.now();console.debug("[vcp-fast] BUILD size="+F.c.size+" avg="+(F.ms/F.builds).toFixed(2)+"ms")}}return R}catch(e){}}return n.value}();'

const SAFE_MARK = 'hits:0,builds:0,ms:0,lastLog:0'

function main() {
  const file = findBundle()
  if (!file) {
    console.error('[safe] 未找到 bundle。用法: node vcp-safe.cjs <bundle路径>')
    process.exit(1)
  }
  let t = fs.readFileSync(file, 'utf8')

  if (t.includes(SAFE_MARK) && !t.includes('last:""')) {
    console.log('[safe] 该 bundle 已是 v2-safe（仅缓存），跳过。')
    return
  }
  const n = t.split(V2_OLD).length - 1
  if (n !== 1) {
    console.error(`[safe] v2 锚点命中 ${n} 次（需要 1），未写入。可能 bundle 版本不符或已是 safe 版。`)
    process.exit(1)
  }

  const next = t.split(V2_OLD).join(V2_SAFE)

  // 语法校验
  const fragOk = (() => { try { new vm.Script(`function pu(n,r,i){switch(n.type){${V2_SAFE}}}`, { filename: 'frag' }); return true } catch (e) { console.error('[safe] 片段语法失败:', e.message); return false } })()
  const scrubbed = next.replace(/import\{[^}]*\}from"[^"]*";/, '/*import*/;')
  const fullOk = (() => { try { new vm.Script(scrubbed, { filename: 'full' }); return true } catch (e) { console.error('[safe] 全量语法失败:', e.message); return false } })()
  if (!fragOk || !fullOk) { console.error('[safe] 校验未通过，中止'); process.exit(1) }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const bak = `${file}.bak-safe-${stamp}`
  fs.copyFileSync(file, bak)
  fs.writeFileSync(file, next, 'utf8')
  console.log('[safe] 完成：已切换为「仅缓存」模式（增量已禁用）')
  console.log('[safe] 备份:', bak)
  console.log('[safe] 请刷新浏览器（Ctrl+F5）验证卡片背景是否恢复正常。')
}

main()
