#!/usr/bin/env node
/**
 * dsh-raw-html —— vcp-fast 逻辑仿真测试
 *
 * 从（升级后的）bundle 中提取 case"html" 片段，注入最小环境执行，
 * 验证「缓存 + 增量」渲染器的行为：
 *   1. 相同输入 → 缓存命中且元素引用相同（React 跳过 diff 的前提）
 *   2. 纯追加 + 旧值闭合 → 增量路径，稳定元素引用保留
 *   3. 增量链嵌套追加 → 各层稳定引用保持
 *   4. 旧值未闭合 → 安全回退全量
 *   5. 完全不同内容 → 全量重建
 *   6. 流式状态 → 返回原文不缓存
 *   7. 开关关闭 → 返回原文
 *   8. 重复渲染 → 全部缓存命中
 *
 * 用法：
 *   node vcp-fast-sim.cjs [bundle路径]
 * 退出码：全部通过 = 0，任一失败 = 1。
 */
'use strict'

const fs = require('node:fs')

const bundlePath = process.argv[2]
if (!bundlePath) {
  console.error('用法: node vcp-fast-sim.cjs <bundle路径>')
  process.exit(1)
}
const t = fs.readFileSync(bundlePath, 'utf8')
const start = t.indexOf('case"html":return function(){')
const end = t.indexOf('case"code"', start)
if (start < 0 || end < 0) {
  console.error('[sim] FAIL: 未在 bundle 中找到 case"html" 片段（请先应用 upgrade-patch.cjs）')
  process.exit(1)
}
const fragment = t.slice(start, end)
console.log('[sim] 提取片段长度:', fragment.length)

const logs = []

function makeEnv() {
  const windowObj = {}
  let parserCalls = 0
  let clock = 0
  const localStorageStub = { getItem: () => '1' }
  const env = {
    window: windowObj,
    localStorage: localStorageStub,
    performance: { now: () => (clock += 16) },
    console: { debug: (...a) => logs.push(a.join(' ')) },
    DOMParser: class {
      parseFromString(html) {
        parserCalls++
        return { body: { childNodes: [{ nodeType: 1, localName: 'div', attributes: [], childNodes: [], text: html }] } }
      }
    },
    vc: (node, k) => ({ kind: 'el', key: k, text: node.text }),
    f: { Fragment: Symbol('Fragment'), jsx: (type, props) => ({ kind: 'jsx', type, props }) },
  }
  const fn = new Function('n', 'r', 'i', '__env', `
    const window=__env.window, localStorage=__env.localStorage, performance=__env.performance,
          console=__env.console, DOMParser=__env.DOMParser, vc=__env.vc, f=__env.f;
    let out;
    switch(n.type){ ${fragment} }
    return out;
  `)
  return {
    render(html, streaming = false) {
      const before = parserCalls
      const out = fn({ type: 'html', value: html }, 0, { streaming }, env)
      return { out, newParses: parserCalls - before }
    },
    setRawHtml(v) { localStorageStub.getItem = () => v },
  }
}

let pass = 0
let fail = 0
function check(name, cond) {
  if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name) }
}

console.log('\n[场景1] 相同输入 → 缓存命中')
{
  const R = makeEnv()
  const html = '<div id="a">hello</div><p>world</p>'
  const a = R.render(html)
  const b = R.render(html)
  check('首次 BUILD（解析 1 次）', a.newParses === 1)
  check('二次 HIT（解析 0 次）', b.newParses === 0)
  check('元素引用完全相同', a.out === b.out)
}

console.log('\n[场景2] 纯追加且旧值闭合 → 增量路径')
{
  const R = makeEnv()
  const base = '<div id="a">hello</div><p>world</p>'
  const r1 = R.render(base)
  const r2 = R.render(base + '<p>appended</p>')
  const baseHit = R.render(base)
  check('只解析新增段（1 次）', r2.newParses === 1)
  check('结果为 Fragment 组合', r2.out.kind === 'jsx' && Array.isArray(r2.out.props.children))
  check('稳定元素引用保留', r2.out.props.children[0] === baseHit.out)
  check('首层元素引用即缓存', r1.out === baseHit.out)
}

console.log('\n[场景3] 增量链（第三次追加）')
{
  const R = makeEnv()
  const base = '<div id="a">hello</div><p>world</p>'
  const r1 = R.render(base)
  const r2 = R.render(base + '<p>appended</p>')
  const r3 = R.render(base + '<p>appended</p><p>more</p>')
  check('第三次仍走增量（1 次解析）', r3.newParses === 1)
  check('第二层稳定引用保留', r3.out.props.children[0] === r2.out)
  check('第一层稳定引用保留', r3.out.props.children[0].props.children[0] === r1.out)
}

console.log('\n[场景4] 追加但旧值未闭合 → 全量安全回退')
{
  const R = makeEnv()
  const unclosed = '<div id="z">zzz</div><b>ab'
  const full = unclosed + 'c</b>'
  R.render(unclosed)
  const r = R.render(full)
  check('回退全量解析（1 次）', r.newParses === 1)
  check('结果为完整块（非组合）', r.out.kind === 'el')
}

console.log('\n[场景5] 完全不同内容 → 全量')
{
  const R = makeEnv()
  R.render('<div>aaa</div>')
  const r = R.render('<section>brand new</section>')
  check('全量重建（1 次解析）', r.newParses === 1)
}

console.log('\n[场景6] 流式状态')
{
  const R = makeEnv()
  const r = R.render('<div>xyz</div>', true)
  check('返回原文', r.out === '<div>xyz</div>')
  check('未解析', r.newParses === 0)
}

console.log('\n[场景7] 开关关闭（dsh.rawHtml !== 1）')
{
  const R = makeEnv()
  R.setRawHtml('0')
  const r = R.render('<div>off</div>')
  check('返回原文', r.out === '<div>off</div>')
}

console.log('\n[场景8] 100 次相同内容渲染')
{
  const R = makeEnv()
  const html = '<div>' + 'x'.repeat(500) + '</div>'
  R.render(html)
  let parses = 0
  for (let i = 0; i < 100; i++) parses += R.render(html).newParses
  check('100 次全部缓存命中（0 次解析）', parses === 0)
}

console.log(`\n==== 结果: ${pass} 通过, ${fail} 失败 ====`)
process.exit(fail === 0 ? 0 : 1)
