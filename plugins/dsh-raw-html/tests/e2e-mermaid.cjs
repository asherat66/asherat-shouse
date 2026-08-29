/**
 * Mermaid 引擎真实浏览器 e2e 验证（先生实测前的最后一道确认）。
 *
 * 用 puppeteer（PUPPETEER_EXECUTABLE_PATH → Edge）加载真实的 mermaid.min.js，
 * 模拟 v6-inject 的渲染链路（pre>code.language-mermaid → div.mermaid → mermaid.run），
 * 验证：流程图/时序图/甘特图 + 中文参与符 + 智能字符修复。
 *
 * 运行：node tests/e2e-mermaid.cjs
 */
const puppeteer = require('G:/AI/AI 助手/VCPChat-main/node_modules/puppeteer')
const fs = require('fs')

const MERMAID_SRC = 'G:/AI/H3MINI/dsh-raw-html/assets/vendor/mermaid.min.js'

async function main() {
  const mermaidSrc = fs.readFileSync(MERMAID_SRC, 'utf8')
  console.log(`mermaid.min.js: ${(mermaidSrc.length / 1024).toFixed(0)} KB`)

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  })
  try {
    const page = await browser.newPage()
    await page.setContent('<html><body></body></html>')

    // 注入 mermaid.min.js
    await page.evaluate((src) => {
      const s = document.createElement('script')
      s.textContent = src
      document.head.appendChild(s)
    }, mermaidSrc)

    // 等待 mermaid 就绪（11.x 异步加载依赖）
    await page.waitForFunction(
      () => window.mermaid && typeof window.mermaid.run === 'function',
      { timeout: 20000 }
    )
    console.log('window.mermaid 就绪 ✓')

    // 模拟 v6-inject 渲染链路
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
      // 与演示卡一致的三图型（含中文、智能字符）
      mk('flowchart TD\n  A[收到先生指令] --> B{任务类型?}\n  B -->|渲染调试| C[定位渲染链路]\n  B -->|功能扩展| D[设计实现方案]\n  C --> F[测试验证]\n  F --> G{先生满意?}\n  G -->|是| H[收工 咕噜噜~]\n  G -->|否| C')
      mk('sequenceDiagram\n  participant 先生\n  participant 蓝汐\n  先生->>蓝汐: 输出卡片\n  蓝汐-->>先生: 反馈效果')
      mk('gantt\n  title 渲染器进化排期\n  dateFormat YYYY-MM-DD\n  section P0 地基\n  安全加固 :done, a1, 2026-08-19, 1d\n  section P3 内容\n  Mermaid 图表 :active, a2, 2026-08-20, 1d')
      // 智能字符测试
      mk('flowchart LR\n  X[潮—汐–观测－站] --> Y[深度求索]')

      window.mermaid.initialize({ startOnLoad: false })
      const codeEls = Array.from(document.querySelectorAll('pre.language-mermaid > code.language-mermaid'))
      const errors = []
      for (const codeEl of codeEls) {
        const pre = codeEl.parentNode
        const div = document.createElement('div')
        div.className = 'mermaid'
        div.textContent = codeEl.textContent.replace(/[—–－]/g, '--')
        pre.replaceWith(div)
        try {
          await window.mermaid.run({ nodes: [div] })
        } catch (e) {
          errors.push(String(e && e.message || e))
        }
      }
      const svgs = document.querySelectorAll('div.mermaid svg')
      return {
        blocks: codeEls.length,
        svgs: svgs.length,
        errors,
        sizes: Array.from(svgs).map(s => s.getBoundingClientRect().width.toFixed(0) + 'x' + s.getBoundingClientRect().height.toFixed(0)),
      }
    })

    console.log(`图表块: ${result.blocks}`)
    console.log(`成功 SVG: ${result.svgs}`)
    console.log(`SVG 尺寸: ${result.sizes.join(', ')}`)
    if (result.errors.length > 0) {
      console.log('渲染错误:')
      for (const e of result.errors) console.log('  ✗', e)
    } else {
      console.log('渲染错误: 无 ✓')
    }

    // 截图：把渲染效果存到 8090 服务器目录（先生可直接 http 查看）
    const OUT_DIR = 'G:/深鲸湾/biaoqingbao/comfy_output'
    const names = ['flowchart', 'sequence', 'gantt', 'smartchars']
    const handles = await page.$$('div.mermaid')
    for (let i = 0; i < handles.length; i++) {
      const buf = await handles[i].screenshot({ type: 'png' })
      const out = `${OUT_DIR}/e2e_mermaid_${names[i] || i}.png`
      fs.writeFileSync(out, buf)
      console.log(`截图: ${out}`)
    }

    const ok = result.svgs === result.blocks && result.errors.length === 0
    console.log(ok ? '\nE2E 全部通过 ✓' : '\nE2E 有失败 ✗')
    process.exitCode = ok ? 0 : 1
  } finally {
    await browser.close()
  }
}

main().catch((e) => {
  console.error('E2E 异常:', e)
  process.exitCode = 1
})
