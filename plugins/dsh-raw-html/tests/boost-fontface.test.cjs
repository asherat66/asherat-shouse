// 验证 boostTextImportant 修复：@font-face 保护 + 普通声明仍 boost
const fs = require('node:fs')
const path = require('node:path')

const src = fs.readFileSync(path.join(__dirname, '..', 'patch', 'v6-inject.js'), 'utf8')
const start = src.indexOf('var BOOST_TEXT_DECL_RE')
const end = src.indexOf('function boostStyle')
if (start === -1 || end === -1) { console.error('提取失败'); process.exit(1) }
const snippet = src.slice(start, end)
eval(snippet + '\nglobalThis.__testBoost = boostTextImportant;')

let fail = 0
function check(name, input, expectContains, expectNotContains) {
  const out = globalThis.__testBoost(input)
  const okC = expectContains.every(s => out.includes(s))
  const okN = expectNotContains.every(s => !out.includes(s))
  if (!okC || !okN) {
    fail++
    console.log(`✗ ${name}`)
    console.log(`  ── 输出 ──\n${out}`)
  } else {
    console.log(`✓ ${name}`)
  }
}

// 用例1：@font-face 原样保留（描述符无 !important），普通规则仍 boost
check('用例1：@font-face 保护 + 普通规则 boost',
  "@font-face{font-family:'Lanxi-鱼尾行书';src:url('/fonts/新增-2026-08-28/鱼尾书法行书-简体.ttf');}\n#vcp-root .t{font-family:'Lanxi-鱼尾行书','KaiTi',serif;color:#111;font-size:36px}",
  ["font-family:'Lanxi-鱼尾行书';src:url", "font-family:'Lanxi-鱼尾行书','KaiTi',serif!important", "color:#111!important", "font-size:36px!important"],
  ["font-family:'Lanxi-鱼尾行书'!important;src"])

// 用例2：多个 @font-face + 中间夹普通规则
check('用例2：多 @font-face + 混合规则',
  "@font-face{font-family:A;src:url(a.ttf)}@font-face{font-family:B;src:url(b.ttf)}.x{color:red}",
  ["@font-face{font-family:A;src:url(a.ttf)}", "@font-face{font-family:B;src:url(b.ttf)}", "color:red!important"],
  [])

// 用例3：无 @font-face 的普通 CSS（回归，行为不变）
check('用例3：无 @font-face 回归',
  ".t{font-family:serif;line-height:1.6}.n{background:#eee}",
  ["font-family:serif!important", "line-height:1.6!important"],
  ["background:#eee!important"])

// 用例4：已有 !important 跳过（幂等）
check('用例4：已有 !important 幂等跳过',
  ".t{color:red!important}",
  ["color:red!important"],
  ["color:red!!important"])

// 用例5：空输入
check('用例5：空输入',
  "",
  [],
  [])

console.log(fail === 0 ? '\n全部通过 ✅' : `\n${fail} 项失败 ❌`)
process.exit(fail === 0 ? 0 : 1)
