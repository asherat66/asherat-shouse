#!/usr/bin/env node
/**
 * dsh-raw-html —— 依赖声明检查器
 *
 * 教训（2026-08-19 崩溃事件）：lib/index.js import 了 @deepseek-ai/schemastery
 * 却没在 package.json 声明，依赖解析靠运行环境存量 node_modules 碰运气，
 * 目录重构后链断裂 → DSH 启动崩溃（小琉璃急救）。
 *
 * 本脚本核对 lib 下所有 import/require 的第三方包是否都已声明在
 * package.json（dependencies + peerDependencies），防止同类事故复发。
 *
 * 用法：node tools/check-deps.cjs
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const declared = { ...(pkg.dependencies || {}), ...(pkg.peerDependencies || {}) }

const BUILTIN = new Set([
  'node:fs', 'node:os', 'node:path', 'node:url', 'node:fs/promises', 'node:stream',
  'node:util', 'node:events', 'node:buffer', 'node:child_process', 'node:module',
  'node:worker_threads', 'node:perf_hooks', 'node:crypto', 'node:http', 'node:https',
  'node:net', 'node:zlib', 'node:querystring', 'node:timers', 'node:assert',
  'fs', 'os', 'path', 'url', 'stream', 'util', 'events', 'buffer', 'child_process', 'module',
])

/** 提取一个 JS 文本里的所有 import 源与 require() 参数。 */
function collectImports(text) {
  const found = new Set()
  for (const m of text.matchAll(/\bimport\s+(?:[^'"]+?\s+from\s+)?['"]([^'"]+)['"]/g)) {
    found.add(m[1])
  }
  for (const m of text.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    found.add(m[1])
  }
  return [...found]
}

/** 依赖名提取：@scope/pkg 或 pkg。 */
function depName(spec) {
  if (spec.startsWith('node:')) return spec
  return spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0]
}

let ok = true
const files = ['lib/index.js', 'lib/client.js', 'patch/patch-frontend.cjs', 'tools/check-deps.cjs']
for (const rel of files) {
  const full = path.join(ROOT, rel)
  if (!fs.existsSync(full)) continue
  const text = fs.readFileSync(full, 'utf8')
  for (const spec of collectImports(text)) {
    const name = depName(spec)
    if (BUILTIN.has(name)) continue
    if (declared[name]) continue
    console.error(`[FAIL] ${rel}: "${spec}" 未在 package.json 声明（dependencies/peerDependencies）`)
    ok = false
  }
}

if (ok) {
  console.log('[OK] 所有 import/require 依赖均已声明 ✓')
} else {
  console.error('[FAIL] 存在未声明依赖，请补进 package.json 后重试。')
  process.exit(1)
}
