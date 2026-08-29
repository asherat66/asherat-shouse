/**
 * 注入 token 测量（先生 2026-08-27 · 插件自检）
 * 从 lib/index.js 提取三个注入构建函数的模板字面量并求值，
 * 统计 render/aesthetic/锁定各开关组合下每次对话注入的字符数。
 * 运行：node tests/diag-inject-size.mjs
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'

const src = readFileSync(new URL('../lib/index.js', import.meta.url), 'utf8')

/** 提取函数体（从 function name( 到配对的顶层 }） */
function extractFn(name) {
  const re = new RegExp('function\\s+' + name + '\\s*\\([^)]*\\)\\s*\\{')
  const m = re.exec(src)
  if (!m) throw new Error('not found: ' + name)
  let depth = 0, i = m.index + m[0].length - 1 // 停在 { 上
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) break }
  }
  return src.slice(m.index, i + 1)
}

/** 在沙盒里执行函数体（替换 return 模板，直接返回字符串） */
function evalReturnString(fnBody, mockVars) {
  const body = fnBody.replace(/^function\s+\w+\s*\([^)]*\)\s*\{\s*return\s*`/, 'const __s = `')
    .replace(/`\s*\}$/, '`; return __s')
  const fn = new Function(...Object.keys(mockVars), 'path', body)
  return fn(...Object.values(mockVars), path)
}

const MOCK = {
  designPath: 'G:/AI/H3MINI/dsh-raw-html/DESIGN.md',
  fontsRoot: 'I:\\字体',
  editorialPath: 'G:/AI/H3MINI/dsh-raw-html/EDITORIAL.md',
  framingPath: 'G:/AI/H3MINI/dsh-raw-html/FRAMING.md',
  breathPath: 'G:/AI/H3MINI/dsh-raw-html/BREATH.md',
  stylesIndex: 'G:/AI/H3MINI/dsh-raw-html/styles/_INDEX.md',
  stylesDir: 'G:/AI/H3MINI/dsh-raw-html/styles/',
  STYLES_DIR: 'G:/AI/H3MINI/dsh-raw-html/styles',
}

// buildAestheticText 内部引用 STYLES_DIR（模块常量）——替换成 mock
let aesSrc = extractFn('buildAestheticText')
// 函数体内 path.join(STYLES_DIR, '_FONTS.md') —— 提供 STYLES_DIR 变量即可（模板插值时会求值）
const aesText = evalReturnString(aesSrc, MOCK)

const structuralSrc = extractFn('buildStructuralText')
const structText = evalReturnString(structuralSrc, MOCK)

const LOCKED = '\n\n【风格锁定】用户已锁定风格：maiden-diary——锁定即持续：本会话所有视觉输出一律以该风格为主，无论主题是文学、数据、工程审查还是其他，都 read styles/maiden-diary.md 并按它的色板/骨架/字体/技法组织每一张视觉卡；不得因「主题不匹配」「任务偏理性」等观感自行回退或更换风格，也不得降级成通用排版。仅当用户明确要求改用其他风格时才解锁更换。'
const DISABLED = '（VCP 视觉通感渲染开关当前关闭：消息中的 HTML 将显示为源码。回复请使用普通 Markdown，不要输出 <div> 等 HTML 容器。）'

function stats(label, text) {
  const chars = text.length
  // 中文为主：保守按 1 字符 ≈ 1.2 token；纯估算法
  const cn = (text.match(/[\u4e00-\u9fff]/g) || []).length
  const en = chars - cn
  const tokens = Math.round(cn * 1.2 + en * 0.3)
  console.log(label.padEnd(30), ('chars=' + chars).padEnd(12), ('中文=' + cn).padEnd(9), ('~tokens=' + tokens))
  return tokens
}

console.log('=== 各注入段（每次对话实际注入量） ===')
const tStruct = stats('buildStructuralText', structText)
const tAes = stats('buildAestheticText', aesText)
const tLock = stats('【风格锁定】段', LOCKED)
const tDis = stats('DISABLED_TEXT（关闭时）', DISABLED)

console.log('\n=== 开关组合（每次对话总注入） ===')
const combos = [
  ['render=OFF', tDis],
  ['render=ON, aes=OFF', tStruct],
  ['render=ON, aes=ON, 未锁定', tStruct + tAes],
  ['render=ON, aes=ON, 已锁定', tStruct + tAes + tLock],
]
for (const [name, t] of combos) console.log(name.padEnd(30), '~' + t + ' tokens 估算')
