/**
 * 复现：4 个 pre.language-mermaid 在同一容器（vcp-root 结构）内的渲染独立性。
 * 若 4 个 SVG 各自独立 → 环境/结构问题；若叠在一起 → 渲染逻辑问题。
 * 运行：node tests/e2e-mermaid-4blocks.cjs
 */
const puppeteer = require('G:/AI/AI 助手/VCPChat-main/node_modules/puppeteer')
const fs = require('fs')

const MERMAID_SRC = 'G:/AI/H3MINI/dsh-raw-html/assets/vendor/mermaid.min.js'

async function main() {
  const mermaidSrc = fs.readFileSync(MERMAID_SRC, 'utf8')
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body></body></html>')
    await page.evaluate((src) => {
      const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s)
    }, mermaidSrc)
    await page.waitForFunction(() => window.mermaid && typeof window.mermaid.run === 'function', { timeout: 20000 })

    const result = await page.evaluate(async () => {
      // 模拟 vcp-root 容器：4 个 pre 各自闭合（与演示卡同结构）
      const root = document.createElement('div')
      root.id = 'vcp-root'
      document.body.appendChild(root)
      const charts = [
        'flowchart TD\n  A[晨起观测潮位] --> B{水位异常?}\n  B -->|否| C[例行巡检]\n  B -->|是| D[拉响鲸铃警报]',
        'sequenceDiagram\n  participant 蓝汐\n  蓝汐->>观测浮标: 请求水位数据\n  观测浮标-->>蓝汐: 返回序列',
        'gantt\n  title 观测排期\n  dateFormat YYYY-MM-DD\n  section 潮位\n  大潮观测 :active, o1, 2026-08-20, 3d',
        'stateDiagram-v2\n  [*] --> 待命\n  待命 --> 深度求索 : 收到指令',
      ]
      for (const c of charts) {
        const pre = document.createElement('pre')
        pre.className = 'language-mermaid'
        const code = document.createElement('code')
        code.className = 'language-mermaid'
        code.textContent = c
        pre.appendChild(code)
        root.appendChild(pre)
      }
      // 渲染链路（与 v6-inject 等价）
      window.mermaid.initialize({ startOnLoad: false, theme: 'dark' })
      const codeEls = Array.from(root.querySelectorAll('pre.language-mermaid > code.language-mermaid'))
      const errors = []
      for (const codeEl of codeEls) {
        const pre = codeEl.parentNode
        const div = document.createElement('div')
        div.className = 'mermaid'
        div.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:14px 0;padding:16px;background:#0a1626;border-radius:12px;text-align:center;'
        div.textContent = codeEl.textContent.replace(/[—–－]/g, '--')
        pre.replaceWith(div)
        try {
          await window.mermaid.run({ nodes: [div] })
        } catch (e) { errors.push(String(e && e.message || e)) }
      }
      // 检查：每个 div.mermaid 是否各自有 SVG、SVG 是否在正确 div 内
      const divs = Array.from(root.querySelectorAll('div.mermaid'))
      const report = divs.map((d, i) => ({
        i: i + 1,
        svgCount: d.querySelectorAll('svg').length,
        svgInDiv: d.querySelector('svg') ? d.querySelector('svg').parentNode === d : false,
        width: d.getBoundingClientRect().width.toFixed(0),
        textLen: (d.textContent || '').length,
      }))
      return { divCount: divs.length, report, errors }
    })

    console.log(`div.mermaid 数量: ${result.divCount}`)
    for (const r of result.report) {
      console.log(`  框体${r.i}: svg=${r.svgCount} svg在div内=${r.svgInDiv} 宽=${r.width}px 源码长=${r.textLen}`)
    }
    if (result.errors.length) { console.log('错误:'); for (const e of result.errors) console.log('  ✗', e) }
    const ok = result.divCount === 4 && result.report.every(r => r.svgCount === 1 && r.svgInDiv)
    console.log(ok ? '\n4 框体各自独立 ✓' : '\n有叠放问题 ✗')
    process.exitCode = ok ? 0 : 1
  } finally {
    await browser.close()
  }
}
main().catch((e) => { console.error('异常:', e); process.exitCode = 1 })
