#!/usr/bin/env node
/**
 * dsh-raw-html —— 5.4 安全修复应用脚本（on* 过滤 + v6 模块更新）。
 *
 * 一次性完成两处更新（对应克莉丝审计 P0-5.4 与 P1 收尾）：
 *   A. vc() 属性循环（VC_V6）：onclick 特判后加 `if(/^on/i.test(c.name))continue;`
 *      —— 只放行 onclick 桥接，其余 on* 事件属性拒收。
 *   B. v6-inject.js 模块整段替换为磁盘最新版（parseOpen on* 过滤 + 计时器归位 +
 *      imgConvert/sanitizeStyle 守卫 + mermaid pointer 拖拽）。
 *
 * 备份 + node --check + 特征校验，任何一步失败自动回滚。
 * 用法：node patch/apply-onfilter.cjs [bundle路径]
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function findBundle() {
  const arg = process.argv[2]
  if (arg) return fs.existsSync(arg) ? arg : null
  const candidates = []
  const addDir = (d) => {
    if (!d || !fs.existsSync(d)) return
    const assets = path.join(d, 'dist', 'assets')
    if (!fs.existsSync(assets)) return
    for (const f of fs.readdirSync(assets)) {
      if (/^index-[\w-]+\.js$/.test(f)) candidates.push(path.join(assets, f))
    }
  }
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  return candidates[0] || null
}

const file = findBundle()
if (!file) {
  console.error('[onfilter] 未找到 bundle')
  process.exit(1)
}
console.log('[onfilter] bundle:', file)

let t = fs.readFileSync(file, 'utf8')
let changed = false

// ---- A. VC_V6 on* 过滤 ----
const VC_ANCHOR = 'fn&&fn(m[1])};continue}if(c.name==="style")'
const VC_NEW = 'fn&&fn(m[1])};continue}if(/^on/i.test(c.name))continue;if(c.name==="style")'
if (t.includes(VC_NEW)) {
  console.log('[onfilter] A. VC_V6 on* 过滤已存在，跳过')
} else {
  const n = t.split(VC_ANCHOR).length - 1
  if (n !== 1) {
    console.error(`[onfilter] A. VC_V6 锚点命中 ${n} 次（需恰好 1 次），中止`)
    process.exit(1)
  }
  t = t.split(VC_ANCHOR).join(VC_NEW)
  changed = true
  console.log('[onfilter] A. VC_V6 on* 过滤已应用')
}

// ---- B. v6-inject.js 模块整段替换 ----
const newInject = fs.readFileSync(path.join(__dirname, 'v6-inject.js'), 'utf8')
const marker = t.indexOf('dsh-raw-html v6')
if (marker === -1) {
  console.error('[onfilter] B. 未找到 v6 模块（尚未注入？先跑 install-v6.cjs）')
  process.exit(1)
}
const modStart = t.lastIndexOf('/**', marker)
const vcDef = t.indexOf(';function vc(n,r){')
if (modStart === -1 || vcDef === -1 || vcDef <= modStart) {
  console.error(`[onfilter] B. 边界定位失败（modStart=${modStart} vcDef=${vcDef}），中止`)
  process.exit(1)
}
const newT = t.slice(0, modStart) + newInject + t.slice(vcDef)
if (newT === t) {
  console.log('[onfilter] B. v6 模块已最新，无变化')
} else {
  t = newT
  changed = true
  console.log('[onfilter] B. v6 模块已替换为磁盘最新')
}

if (!changed) {
  console.log('[onfilter] 无需更新（bundle 已是最新），跳过写回')
  process.exit(0)
}

// ---- 备份 + 写回 + 校验 ----
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const bak = `${file}.bak-onfilter-${stamp}`
fs.copyFileSync(file, bak)
fs.writeFileSync(file, t, 'utf8')
console.log('[onfilter] 备份:', bak)

try {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  console.log('[onfilter] node --check OK')
} catch (e) {
  fs.copyFileSync(bak, file)
  console.error('[onfilter] 健康检查失败，已回滚到备份')
  process.exit(1)
}

const written = fs.readFileSync(file, 'utf8')
const features = [
  ['if(/^on/i.test(c.name))continue;', 'VC_V6 on* 过滤'],
  ['if (/^on/i.test(c.name)) continue', 'parseOpen on* 过滤'],
  ['setPointerCapture', 'mermaid pointer 拖拽'],
  ['if (text.indexOf(\'![\') === -1)', 'imgConvert 守卫'],
]
let ok = true
for (const [m, label] of features) {
  if (!written.includes(m)) {
    ok = false
    console.error('[onfilter] 特征缺失：' + label)
  }
}
if (!ok) {
  fs.copyFileSync(bak, file)
  console.error('[onfilter] 特征校验失败，已回滚到备份')
  process.exit(1)
}
console.log('[onfilter] 完成：5.4 安全修复 + P1 优化已应用到 bundle，强刷浏览器生效（Ctrl+F5）')
