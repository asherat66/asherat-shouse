/**
 * Mermaid 引擎「/vendor URL 加载」实测（模拟 client.js ensureMermaidAssets）。
 *
 * puppeteer 页面用 <script src="http://127.0.0.1:3080/vendor/mermaid.min.js">
 * 加载引擎（与 client.js loadScriptOnce 相同 URL），然后跑 v6-inject 的
 * 渲染链路（pre>code.language-mermaid → div.mermaid → mermaid.run）→ 截图。
 *
 * 运行：node tests/e2e-vendor-mermaid.cjs
 */
const puppeteer = require('G:/AI/AI 助手/VCPChat-main/node_modules/puppeteer')
const fs = require('fs')

const VENDOR_URL = 'http://127.0.0.1:3080/vendor/mermaid.min.js'
const OUT_DIR = 'G:/深鲸湾/biaoqingbao/comfy_output'

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent('<!doctype html><html><body></body></html>')

    // 与 client.js ensureMermaidAssets 相同的加载方式：script src = /vendor URL
    await page.evaluate((src) => {
      const s = document.createElement('script')
      s.id = 'dsh-raw-html-mermaid'
      s.src = src
      s.async = true
      document.head.appendChild(s)
    }, VENDOR_URL)

    console.log(`加载: ${VENDOR_URL}`)
    await page.waitForFunction(
      () => window.mermaid && typeof window.mermaid.run === 'function',
      { timeout: 20000 }
    )
    console.log('window.mermaid 就绪 ✓（从 /vendor URL 加载成功）')

    const result = await page.evaluate(async () => {
      const mk = (code) => {
        const pre = document.createElement('pre')
        pre.className = 'language-mermaid'
        const c = document.createElement('code')
        c.className = 'language-mermaid'
        c.textContent = code
        pre.appendChild(c)
        document.body.appendChild(pre)
      }
      mk('flowchart TD\n  A[收到先生指令] --> B{任务类型?}\n  B -->|渲染调试| C[定位渲染链路]\n  B -->|功能扩展| D[设计实现方案]\n  C --> F[测试验证]\n  F --> G{先生满意?}\n  G -->|是| H[收工 咕噜噜~]\n  G -->|否| C')
      mk('sequenceDiagram\n  participant 先生\n  participant 蓝汐\n  先生->>蓝汐: 输出卡片\n  蓝汐-->>先生: 反馈效果')
      mk('gantt\n  title 渲染器进化排期\n  dateFormat YYYY-MM-DD\n  section P0 地基\n  安全加固 :done, a1, 2026-08-19, 1d\n  section P3 内容\n  Mermaid 图表 :active, a2, 2026-08-20, 1d')

      window.mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          fontFamily: 'PingFang SC, Microsoft YaHei, Segoe UI, sans-serif',
          fontSize: '13px',
          primaryColor: '#ffffff',
          primaryTextColor: '#1e293b',
          primaryBorderColor: '#94a3b8',
          lineColor: '#475569',
          textColor: '#1e293b',
          secondaryColor: '#f1f5f9',
          tertiaryColor: '#eef2f7',
          actorBkg: '#eef2f7',
          actorBorder: '#94a3b8',
          actorTextColor: '#1e293b',
          signalColor: '#475569',
          labelBoxBkgColor: '#e2e8f0',
          taskBkgColor: '#bfdbfe',
          taskBorderColor: '#3b82f6',
          taskTextColor: '#0f172a',
          activeTaskBkgColor: '#3b82f6',
          activeTaskBorderColor: '#1d4ed8',
          doneTaskBkgColor: '#cbd5e1',
          doneTaskBorderColor: '#94a3b8',
          sectionBkgColor: '#f1f5f9',
          sectionTextColor: '#334155'
        }
      })
      const codeEls = Array.from(document.querySelectorAll('pre.language-mermaid > code.language-mermaid'))
      const errors = []
      for (const codeEl of codeEls) {
        const pre = codeEl.parentNode
        const div = document.createElement('div')
        div.className = 'mermaid'
        div.style.cssText = 'display:block;width:100%;box-sizing:border-box;margin:14px 0;padding:16px 14px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;text-align:center;overflow-x:auto;box-shadow:0 1px 4px rgba(15,23,42,.06);'
        div.textContent = codeEl.textContent.replace(/[—–－]/g, '--')
        pre.replaceWith(div)
        try {
          await window.mermaid.run({ nodes: [div] })
          const svg = div.querySelector('svg')
          if (svg) {
            svg.style.maxWidth = '100%'
            svg.style.height = 'auto'
            svg.style.display = 'block'
            svg.style.margin = '0 auto'
            // enhanceMermaid 等价：白底工具栏
            const rawW = svg.getBoundingClientRect().width || 400
            const state = { scale: 1 }
            div.style.position = 'relative'
            div.style.overflow = 'auto'
            div.style.paddingTop = '38px'
            const tb = document.createElement('div')
            tb.className = 'vcp-mermaid-toolbar'
            tb.style.cssText = 'position:absolute;top:6px;right:8px;z-index:5;display:flex;gap:4px;align-items:center;background:rgba(255,255,255,.94);border:1px solid #e2e8f0;border-radius:8px;padding:3px;box-shadow:0 1px 3px rgba(15,23,42,.08);'
            const bstyle = 'min-width:28px;height:26px;padding:0 8px;border:1px solid #cbd5e1;border-radius:6px;background:#ffffff;color:#475569;cursor:pointer;font-size:13px;line-height:1;font-family:Consolas,monospace;'
            const apply = () => { svg.style.transform = `scale(${state.scale})`; svg.style.transformOrigin = 'center top' }
            const mk = (label, title, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.title = title; b.style.cssText = bstyle; b.addEventListener('click', fn); return b }
            tb.appendChild(mk('−', '缩小', () => { state.scale = Math.max(0.3, +(state.scale - 0.2).toFixed(2)); apply() }))
            tb.appendChild(mk('100%', '原始大小', () => { state.scale = 1; apply() }))
            tb.appendChild(mk('＋', '放大', () => { state.scale = Math.min(4, +(state.scale + 0.2).toFixed(2)); apply() }))
            tb.appendChild(mk('适应', '匹配框体', () => { const cw = div.clientWidth - 24; if (cw > 40 && rawW > 40) { state.scale = Math.max(0.2, +(cw / rawW).toFixed(2)); apply() } }))
            div.appendChild(tb)
          }
        } catch (e) {
          errors.push(String(e && e.message || e))
        }
      }
      const svgs = document.querySelectorAll('div.mermaid svg')
      return { blocks: codeEls.length, svgs: svgs.length, errors, boxed: document.querySelectorAll('div.mermaid[style*="margin"]').length }
    })

    console.log(`图表块: ${result.blocks} / 成功 SVG: ${result.svgs} / 错误: ${result.errors.length} / 容器样式: ${result.boxed}`)
    if (result.errors.length) for (const e of result.errors) console.log('  ✗', e)

    const names = ['vendor_flowchart', 'vendor_sequence', 'vendor_gantt']
    const handles = await page.$$('div.mermaid')
    for (let i = 0; i < handles.length; i++) {
      const buf = await handles[i].screenshot({ type: 'png' })
      const out = `${OUT_DIR}/e2e_mermaid_${names[i] || i}.png`
      fs.writeFileSync(out, buf)
      console.log(`截图: ${out}`)
    }
    // 全页截图：验证三图间距/居中/不挤
    const full = await page.screenshot({ type: 'png' })
    fs.writeFileSync(`${OUT_DIR}/e2e_mermaid_vendor_full.png`, full)
    console.log(`截图: ${OUT_DIR}/e2e_mermaid_vendor_full.png（全页布局）`)

    const ok = result.svgs === result.blocks && result.errors.length === 0
    console.log(ok ? '\n实测通过 ✓（/vendor 加载 + 渲染链路全通）' : '\n实测有失败 ✗')
    process.exitCode = ok ? 0 : 1
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error('实测异常:', e)
  process.exitCode = 1
})
