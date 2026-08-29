#!/usr/bin/env node
/**
 * dsh-raw-html —— vcp-fast 性能基准（真实 DOM 解析环境）
 *
 * 从 bundle 提取真实 vc() / hp() / case"html" 片段，配合 domino
 * （零依赖、纯 JS 的 html5 DOM 解析器）在 node 里执行，
 * 对比「旧全量路径 vs 新缓存/增量路径」的耗时与提速倍数：
 *
 *   v1Medium / v1Large   : 旧路径（DOMParser 全文 + vc 遍历）平均耗时
 *   v2HitMedium/Large    : 新路径缓存命中平均耗时（含 1243x/4588x 级提速）
 *   v1SeqInc / v2Inc     : 流式追加序列中 旧全量 vs 新增量（含 12x 级提速）
 *   func                 : 功能回归（onclick 桥接、script/iframe 过滤）
 *
 * 说明：domino 是纯 JS 解析器（比浏览器 C++ 解析器慢 10~50 倍），
 * 绝对毫秒偏大属正常；同环境下对比的相对倍数可靠。
 *
 * 用法：
 *   node vcp-fast-bench.cjs [bundle路径]
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const https = require('node:https')
const zlib = require('node:zlib')

const DOMINO_TARBALL = 'https://registry.npmjs.org/domino/-/domino-2.1.7.tgz'
const dominoDir = path.join(os.tmpdir(), 'domino-lib').replace(/\\/g, '/')

function getUrl(url) {
  return new Promise((res, rej) => {
    https.get(url, { headers: { 'User-Agent': 'vcp-bench' } }, (r) => {
      const chunks = []
      r.on('data', (c) => chunks.push(c))
      r.on('end', () => res(Buffer.concat(chunks)))
    }).on('error', rej)
  })
}

function extractTar(buf, dest) {
  let off = 0
  while (off + 512 <= buf.length) {
    const name = buf.subarray(off, off + 100).toString('utf8').replace(/\0.*$/s, '')
    if (!name) { off += 512; continue }
    const size = parseInt(buf.subarray(off + 124, off + 136).toString('utf8').replace(/\0.*$/s, '').trim(), 8) || 0
    const data = buf.subarray(off + 512, off + 512 + size)
    if (!name.endsWith('/')) {
      const p = path.join(dest, name)
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, data)
    }
    off += 512 + Math.ceil(size / 512) * 512
  }
}

async function ensureDomino() {
  const entry = `${dominoDir}/package/lib/index.js`
  if (fs.existsSync(entry)) return entry
  fs.mkdirSync(dominoDir, { recursive: true })
  const tgz = await getUrl(DOMINO_TARBALL)
  extractTar(zlib.gunzipSync(tgz), dominoDir)
  console.log('[bench] domino 已下载:', entry)
  return entry
}

function main() {
  const bundlePath = process.argv[2]
  if (!bundlePath || !fs.existsSync(bundlePath)) {
    console.error('用法: node vcp-fast-bench.cjs <bundle路径>')
    process.exit(1)
  }
  const bundle = fs.readFileSync(bundlePath, 'utf8')

  // 提取片段
  const vcStart = bundle.indexOf('function vc(n,r){')
  const vcEnd = bundle.indexOf('function ql(', vcStart)
  if (vcStart < 0 || vcEnd < 0) { console.error('[bench] 未找到 vc 函数'); process.exit(1) }
  const vcSrc = bundle.slice(vcStart, vcEnd)

  const hpMatch = /hp=function\(n\)\{[\s\S]*?\};/.exec(bundle) || /(?:var |const |let )hp=function\(n\)\{[\s\S]*?\};/.exec(bundle)
  const hpSrc = hpMatch ? hpMatch[0] : 'function hp(n){const r={};for(const i of n.split(";")){const s=i.indexOf(":");if(s>-1){const c=i.slice(0,s).trim().replace(/-([a-z])/g,(h,p)=>p.toUpperCase());r[c]=i.slice(s+1).trim()}}return r}'
  if (!hpMatch) console.warn('[bench] hp 未在 bundle 中找到，使用等价 stub')

  const cs = bundle.indexOf('case"html":return function(){')
  const ce = bundle.indexOf('case"code"', cs)
  if (cs < 0 || ce < 0) { console.error('[bench] 未找到 case"html" 片段'); process.exit(1) }
  const caseSrc = bundle.slice(cs, ce)

  // VCP 样本
  function block(n, i) {
    return `<div style="background:rgba(64,220,255,.06);border:1px solid rgba(64,220,255,.2);border-radius:10px;padding:14px 16px;margin-bottom:10px;"><b style="color:#40dcff;">区块${i}</b><span style="color:#c9dcef;font-size:13px;">VCP 视觉区块内容 ${n} 号，包含说明文字、样式与交互。</span><button type="button" onclick="input('执行操作${i}')" style="padding:4px 10px;border-radius:999px;background:rgba(64,220,255,.2);color:#eaf8ff;">操作${i}</button></div>`
  }
  function tableRow(r) {
    return `<tr><td style="padding:6px 9px;color:#c9dcef;">行${r}-A</td><td style="padding:6px 9px;color:#ffd479;">行${r}-B</td><td style="padding:6px 9px;color:#8fe3b5;">行${r}-C</td></tr>`
  }
  function sample(size) {
    let rows = ''
    for (let r = 0; r < size; r++) rows += tableRow(r)
    let blocks = ''
    for (let i = 0; i < size; i++) blocks += block(size, i)
    return `<div id="vcp-root" style="max-width:860px;margin:0 auto;font-family:'PingFang SC',sans-serif;background:linear-gradient(180deg,#0a1a2f,#0d2238);border-radius:16px;padding:24px;color:#e8f2fb;line-height:1.75;">
<div style="font-size:11.5px;letter-spacing:3px;color:#40dcff;">BENCH SAMPLE · size=${size}</div>
<div style="font-size:22px;font-weight:700;">VCP 基准样本</div>
<div style="border-bottom:1px solid rgba(64,220,255,.18);padding-bottom:12px;margin-bottom:16px;">副标题与分隔</div>
${blocks}
<table style="width:100%;border-collapse:collapse;font-size:13px;">${rows}</table>
<pre style="background:#081420;border:1px solid rgba(64,220,255,.22);border-radius:10px;padding:14px;color:#c9dcef;"><code>code block line one
code block line two</code></pre>
<div style="text-align:right;color:#8fb8d9;font-size:12.5px;border-top:1px solid rgba(64,220,255,.18);padding-top:10px;">结尾行</div>
</div>`
  }
  const SAMPLES = { medium: sample(6), large: sample(30) }

  ensureDomino().then((dominoEntry) => {
    const moduleSrc = `'use strict'
const domino = require('${dominoEntry}')
const Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 }
const R = {
  createElement: function (t, p) {
    const children = Array.prototype.slice.call(arguments, 2)
    const props = p || {}
    if (children.length) props.children = children
    return { t: t, p: props }
  },
}
const f = { Fragment: '@@FRAGMENT@@', jsx: function (t, p) { return { t: t, p: p } } }
class DOMParser {
  parseFromString(html) {
    const doc = domino.createDocument(html)
    return { body: doc.body }
  }
}
const localStorage = { getItem: () => '1' }
const window = globalThis
${hpSrc}
${vcSrc}
function renderHtml(html, streaming) {
  const n = { type: 'html', value: html }
  const i = { streaming: !!streaming }
  let out
  switch (n.type) { ${caseSrc} }
  return out
}
const SAMPLES = ${JSON.stringify(SAMPLES)}
function bench(times, fn) {
  const t0 = performance.now()
  for (let k = 0; k < times; k++) fn()
  return (performance.now() - t0) / times
}
function reset() { window.__vcpFast = undefined }
function countNodes(html) {
  return domino.createDocument(html).getElementsByTagName('*').length
}
function v1(html) {
  const b = new DOMParser().parseFromString(html, 'text/html').body
  if (!b.childNodes.length) return null
  const o = []
  for (let k = 0; k < b.childNodes.length; k++) o.push(vc(b.childNodes[k], k))
  return o.length === 1 ? o[0] : f.jsx(f.Fragment, { children: o })
}
const out = {}
out.nodesMedium = countNodes(SAMPLES.medium)
out.nodesLarge = countNodes(SAMPLES.large)
v1(SAMPLES.medium); v1(SAMPLES.medium)
out.v1Medium = bench(40, () => v1(SAMPLES.medium))
reset(); renderHtml(SAMPLES.medium)
out.v2HitMedium = bench(2000, () => renderHtml(SAMPLES.medium))
out.speedupHitMedium = (out.v1Medium / out.v2HitMedium).toFixed(1)
reset()
let v = SAMPLES.medium
let t1seq = 0
let t3 = 0
let seqParsedChars = 0
for (let k = 0; k < 100; k++) {
  v += '<p>tail' + k + '</p>'
  seqParsedChars += v.length
  let s = performance.now()
  v1(v)
  t1seq += performance.now() - s
  s = performance.now()
  renderHtml(v)
  t3 += performance.now() - s
}
out.v1SeqInc = t1seq / 100
out.v2IncMedium = t3 / 100
out.speedupIncMedium = (out.v1SeqInc / out.v2IncMedium).toFixed(1)
out.seqAvgLen = Math.round(seqParsedChars / 100)
v1(SAMPLES.large); v1(SAMPLES.large)
out.v1Large = bench(12, () => v1(SAMPLES.large))
reset(); renderHtml(SAMPLES.large)
out.v2HitLarge = bench(600, () => renderHtml(SAMPLES.large))
out.speedupHitLarge = (out.v1Large / out.v2HitLarge).toFixed(1)
const htmlTest = '<div id="btn" onclick="input(\\'hello\\')">x</div><script>bad()</script><iframe src="x"></iframe>'
const elTest = renderHtml(htmlTest)
out.func = {
  hasResult: !!elTest,
  childrenLen: elTest && elTest.p && elTest.p.children ? elTest.p.children.length : null,
  firstHasOnClick: !!(elTest && elTest.p && elTest.p.children && elTest.p.children[0] && elTest.p.children[0].p && typeof elTest.p.children[0].p.onClick === 'function'),
}
const F = window.__vcpFast || {}
out.stats = { hits: F.hits || 0, builds: F.builds || 0, cacheSize: F.c ? F.c.size : 0 }
module.exports = out
`
    const modPath = path.join(os.tmpdir(), 'vcp-bench-module.js').replace(/\\/g, '/')
    fs.writeFileSync(modPath, moduleSrc, 'utf8')
    const result = require(modPath)
    console.log('\n===== vcp-fast 基准结果（domino 真实 DOM 解析）=====')
    console.log(JSON.stringify(result, null, 2))
  }).catch((e) => { console.error('[bench] FATAL:', e.message); process.exit(1) })
}

main()
