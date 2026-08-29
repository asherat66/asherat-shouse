/**
 * dsh-raw-html 安全与功能正则行为测试（纯逻辑，零依赖）。
 *
 * 这些测试验证 patch/patch-frontend.cjs 注入的关键逻辑的行为：
 *   1. 图片转换白名单（case"html" 分支 v 变量）
 *   2. 流式动画剥离（w 变量：只剥一次性、保留 infinite）
 *   3. style 危险属性过滤（vc 增强 v2：position:fixed / z-index>=1000 / content:）
 *   4. URL 协议白名单（vc 增强 v2：href 与 src 分开）
 *
 * 若修改 patch-frontend.cjs 中对应正则，请同步更新本文件。
 * 运行：node tests/security.test.mjs
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'

let passed = 0
function ok(name, fn) {
  fn()
  passed += 1
  console.log(`  ✓ ${name}`)
}

console.log('== 1. 图片转换白名单（![alt](url) → <img>）==')
const IMG_RE = /!\[([^\]]*)\]\(([^)]+)\)/g
function convertImg(text) {
  return text.replace(IMG_RE, (m, a, u) => {
    u = u.trim()
    if (!/^(https?:|data:image\/|\/)/i.test(u)) return m
    return `<img alt="${(a || '').replace(/"/g, '&quot;')}" src="${u.replace(/"/g, '&quot;')}">`
  })
}
ok('http 图片放行', () => assert.equal(convertImg('![x](https://a.com/b.png)'), '<img alt="x" src="https://a.com/b.png">'))
ok('data:image 放行', () => assert.equal(convertImg('![x](data:image/png;base64,abc)'), '<img alt="x" src="data:image/png;base64,abc">'))
ok('相对路径放行', () => assert.equal(convertImg('![x](/emoji/开心.png)'), '<img alt="x" src="/emoji/开心.png">'))
ok('javascript: 拦截（原样保留）', () => assert.equal(convertImg('![x](javascript:alert(1))'), '![x](javascript:alert(1))'))
ok('data:text/html 拦截', () => assert.equal(convertImg('![x](data:text/html,<script>x</script>)'), '![x](data:text/html,<script>x</script>)'))
ok('file: 拦截', () => assert.equal(convertImg('![x](file:///etc/passwd)'), '![x](file:///etc/passwd)'))
ok('alt 引号转义', () => assert.equal(convertImg('![a"b](https://x/y.png)'), '<img alt="a&quot;b" src="https://x/y.png">'))

console.log('== 2. 流式动画剥离（只剥一次性、保留 infinite）==')
const ANIM_RE = /animation:([^;"']*);?/g
function stripAnim(text, streaming) {
  if (!streaming) return text
  return text.replace(ANIM_RE, (m, x) => (/infinite/.test(x) ? m : ''))
}
ok('一次性动画流式中剥离', () => assert.equal(stripAnim('style="display:flex;animation:lx-rise .5s ease both;color:#fff"', true), 'style="display:flex;color:#fff"'))
ok('infinite 动画流式中保留', () => assert.equal(stripAnim('style="animation:lx-wave 1s ease-in-out infinite;color:#fff"', true), 'style="animation:lx-wave 1s ease-in-out infinite;color:#fff"'))
ok('animation-delay 不误伤', () => assert.equal(stripAnim('style="animation-delay:.3s;animation:lx-pop .5s both"', true), 'style="animation-delay:.3s;"'))
ok('非流式（结束后）动画全保留', () => assert.equal(stripAnim('style="animation:lx-rise .5s ease both"', false), 'style="animation:lx-rise .5s ease both"'))
ok('无动画 style 原样', () => assert.equal(stripAnim('style="display:grid;gap:12px"', true), 'style="display:grid;gap:12px"'))

console.log('== 3. style 危险属性过滤（position:fixed / z-index>=1000 / content:）==')
function filterStyle(sv) {
  return sv
    .replace(/position\s*:\s*fixed\s*;?/gi, '')
    .replace(/z-index\s*:\s*\d{4,}\s*;?/gi, '')
    .replace(/(?<![\w-])content\s*:[^;]*;?/gi, '')
}
ok('position:fixed 剥离', () => assert.equal(filterStyle('position:fixed;color:red'), 'color:red'))
ok('position:absolute 保留', () => assert.equal(filterStyle('position:absolute;top:0'), 'position:absolute;top:0'))
ok('z-index:99999 剥离', () => assert.equal(filterStyle('z-index:99999;'), ''))
ok('z-index:99 保留', () => assert.equal(filterStyle('z-index:99;'), 'z-index:99;'))
ok('content: 伪元素注入剥离', () => assert.equal(filterStyle('content:"钓鱼文字";color:red'), 'color:red'))
ok('content 单引号值剥离', () => assert.equal(filterStyle('content:\'x\';color:red'), 'color:red'))
ok('组合过滤', () => assert.equal(filterStyle('position:fixed;z-index:99999;content:"x";width:100%'), 'width:100%'))
ok('justify-content 不误伤', () => assert.equal(filterStyle('justify-content:center;color:red'), 'justify-content:center;color:red'))
ok('justify-content + animation 不误伤', () => assert.equal(filterStyle('justify-content:center;animation:lx-spin 1s linear infinite'), 'justify-content:center;animation:lx-spin 1s linear infinite'))

console.log('== 4. URL 协议白名单（href / src 分开）==')
function allowHref(v) { return /^(https?:|mailto:|\/|#)/i.test(v) }
function allowSrc(v) { return /^(https?:|data:image\/|\/|#)/i.test(v) }
ok('href: https 放行', () => assert.equal(allowHref('https://example.com'), true))
ok('href: mailto 放行', () => assert.equal(allowHref('mailto:a@b.com'), true))
ok('href: 相对路径放行', () => assert.equal(allowHref('/docs/readme'), true))
ok('href: 锚点放行', () => assert.equal(allowHref('#section'), true))
ok('href: javascript 拦截', () => assert.equal(allowHref('javascript:alert(1)'), false))
ok('href: data 拦截', () => assert.equal(allowHref('data:text/html,x'), false))
ok('href: file 拦截', () => assert.equal(allowHref('file:///c:/x'), false))
ok('src: http 放行', () => assert.equal(allowSrc('https://a.com/i.png'), true))
ok('src: data:image 放行', () => assert.equal(allowSrc('data:image/svg+xml;base64,xx'), true))
ok('src: data:text/html 拦截', () => assert.equal(allowSrc('data:text/html,<b>x</b>'), false))
ok('src: blob 拦截', () => assert.equal(allowSrc('blob:https://x'), false))
ok('src: file 拦截', () => assert.equal(allowSrc('file:///etc/passwd'), false))
function allowNav(v) { return /^(https?:|mailto:|\/|#)/i.test(v) }
ok('nav: formaction https 放行', () => assert.equal(allowNav('https://api.example.com/submit'), true))
ok('nav: xlink 相对路径放行', () => assert.equal(allowNav('/submit'), true))
ok('nav: action javascript 拦截', () => assert.equal(allowNav('javascript:alert(1)'), false))
ok('nav: formaction data 拦截', () => assert.equal(allowNav('data:text/html,x'), false))

console.log('== 5. on* 事件属性过滤（只放行 onclick 桥接，其余 on* 拒收）==')
// parseOpen（容器开标签 / 根标签）：所有 on* 一律丢弃
function filterContainerAttrs(attrs) {
  const props = {}
  for (const a of attrs) {
    if (/^on/i.test(a.name)) continue
    props[a.name] = a.value
  }
  return props
}
ok('onerror 拒收', () => assert.equal(filterContainerAttrs([{ name: 'onerror', value: 'alert(1)' }]).onerror, undefined))
ok('onload 拒收', () => assert.equal(filterContainerAttrs([{ name: 'onload', value: 'x' }]).onload, undefined))
ok('onmouseover 拒收', () => assert.equal(filterContainerAttrs([{ name: 'onmouseover', value: 'x' }]).onmouseover, undefined))
ok('onclick（容器根标签）拒收', () => assert.equal(filterContainerAttrs([{ name: 'onclick', value: 'x' }]).onclick, undefined))
ok('onfocus/oninput/onchange 一并拒收', () => {
  const p = filterContainerAttrs([{ name: 'onfocus', value: 'x' }, { name: 'oninput', value: 'x' }, { name: 'onchange', value: 'x' }])
  assert.equal(p.onfocus, undefined)
  assert.equal(p.oninput, undefined)
  assert.equal(p.onchange, undefined)
})
ok('非 on* 属性正常透传', () => {
  const p = filterContainerAttrs([{ name: 'data-id', value: '1' }, { name: 'title', value: 't' }, { name: 'aria-label', value: 'a' }])
  assert.equal(p['data-id'], '1')
  assert.equal(p.title, 't')
  assert.equal(p['aria-label'], 'a')
})
// VC_V6（子元素）：onclick 桥接为函数，其余 on* 拒收
function filterChildAttrs(attrs) {
  const s = {}
  for (const c of attrs) {
    if (c.name === 'onclick') {
      const m = /^input\s*\(\s*['"]([\s\S]*?)['"]\s*\)\s*;?\s*$/.exec(c.value)
      if (m) s.onClick = () => m[1]
      continue
    }
    if (/^on/i.test(c.name)) continue
    s[c.name] = c.value
  }
  return s
}
ok('onclick="input(...)" 桥接为 onClick 函数', () => {
  const s = filterChildAttrs([{ name: 'onclick', value: "input('你好')" }])
  assert.equal(typeof s.onClick, 'function')
})
ok('onclick 非 input 形式丢弃（不产生 onClick）', () => {
  const s = filterChildAttrs([{ name: 'onclick', value: 'alert(1)' }])
  assert.equal(s.onClick, undefined)
})
ok('子元素 onerror 拒收（onclick 桥接不受影响）', () => {
  const s = filterChildAttrs([{ name: 'onclick', value: "input('ok')" }, { name: 'onerror', value: 'alert(1)' }])
  assert.equal(typeof s.onClick, 'function')
  assert.equal(s.onerror, undefined)
})
ok('子元素 onload/onmouseover 拒收', () => {
  const s = filterChildAttrs([{ name: 'onload', value: 'x' }, { name: 'onmouseover', value: 'x' }])
  assert.equal(s.onload, undefined)
  assert.equal(s.onmouseover, undefined)
})

console.log('== 6. 安全规则两处一致性（parseOpen vs VC_V6，防漂移）==')
// 读取两个实现，断言关键过滤正则/逻辑一致——改一处必须同步另一处
const v6inject = fs.readFileSync(new URL('../patch/v6-inject.js', import.meta.url), 'utf8')
const installer = fs.readFileSync(new URL('../patch/install-v6.cjs', import.meta.url), 'utf8')
const RULES = [
  ['position:fixed 剥离', 'position\\s*:\\s*fixed'],
  ['z-index 剥离', 'z-index\\s*:\\s*\\d{4,}'],
  ['content 词边界过滤', 'content\\s*:[^;]'],
  ['href 白名单', 'https?:|mailto:'],
  ['src 白名单 data:image', 'data:image'],
  ['on* 事件过滤', '/^on/i.test(c.name)'],
  ['formaction 白名单', 'formaction'],
]
for (const [label, needle] of RULES) {
  ok(label + '（两处一致）', () => {
    assert.ok(v6inject.includes(needle), 'v6-inject.js 缺失: ' + label)
    assert.ok(installer.includes(needle), 'install-v6.cjs 缺失: ' + label)
  })
}

console.log(`\n全部通过：${passed} 项断言 ✓`)
