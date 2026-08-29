/**
 * 小手拖拽平移 e2e：放大复杂图 → 模拟鼠标拖拽 → 验证 scrollLeft/scrollTop 变化。
 * 运行：node tests/e2e-mermaid-pan.cjs
 */
const puppeteer = require('G:/AI/AI 助手/VCPChat-main/node_modules/puppeteer')
const fs = require('fs')

const MERMAID_SRC = 'G:/AI/H3MINI/dsh-raw-html/assets/vendor/mermaid.min.js'

async function main() {
  const mermaidSrc = fs.readFileSync(MERMAID_SRC, 'utf8')
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] })
  try {
    const page = await browser.newPage()
    await page.setViewport({ width: 800, height: 900 })
    await page.setContent('<!doctype html><html><body style="margin:0"></body></html>')
    await page.evaluate((src) => {
      const s = document.createElement('script'); s.textContent = src; document.head.appendChild(s)
    }, mermaidSrc)
    await page.waitForFunction(() => window.mermaid && typeof window.mermaid.run === 'function', { timeout: 20000 })

    // 渲染一张复杂图 + enhance（含拖拽）
    const info = await page.evaluate(async () => {
      const root = document.createElement('div')
      root.style.width = '760px'
      document.body.appendChild(root)
      const pre = document.createElement('pre')
      pre.className = 'language-mermaid'
      const code = document.createElement('code')
      code.className = 'language-mermaid'
      code.textContent = 'flowchart TB\n  subgraph A1\n    a1 --> a2 --> a3 --> a4 --> a5\n  end\n  subgraph A2\n    b1 --> b2 --> b3 --> b4\n  end\n  a5 --> b1\n  b4 --> a1'
      pre.appendChild(code)
      root.appendChild(pre)

      window.mermaid.initialize({ startOnLoad: false, theme: 'base' })
      // 双层结构：外层 div.mermaid（固定，控制条挂这层）+ 内层 view（滚动）
      const outer = document.createElement('div')
      outer.className = 'mermaid'
      outer.style.cssText = 'position:relative;display:block;width:100%;box-sizing:border-box;background:#fff;border-radius:12px;'
      outer.style.position = 'relative'
      const view = document.createElement('div')
      view.className = 'vcp-mermaid-view'
      view.style.cssText = 'overflow:auto;max-height:520px;padding:16px;text-align:center;'
      view.textContent = code.textContent
      outer.appendChild(view)
      pre.replaceWith(outer)
      await window.mermaid.run({ nodes: [view] })
      const svg = view.querySelector('svg')
      // enhance 等价（控制条挂外层 + 拖拽绑定内层）
      const rawW = svg.getBoundingClientRect().width || 400
      const rawH = svg.getBoundingClientRect().height || 300
      view.style.cursor = 'grab'
      const state = { scale: 1 }
      // 布局缩放（width/height 真实尺寸 → 容器可滚动 → 拖拽有效）
      const apply = () => {
        svg.style.width = Math.max(1, Math.round(rawW * state.scale)) + 'px'
        svg.style.height = Math.max(1, Math.round(rawH * state.scale)) + 'px'
        svg.style.maxWidth = 'none'
      }
      // 放大到 2x 让内容溢出窗口
      state.scale = 2
      apply()
      // 控制条（挂外层 → 不随内容滚动）
      const tb = document.createElement('div')
      tb.className = 'vcp-mermaid-toolbar'
      tb.style.cssText = 'position:absolute;top:6px;right:8px;z-index:5;display:flex;gap:4px;align-items:center;background:rgba(255,255,255,.94);border:1px solid #e2e8f0;border-radius:8px;padding:3px;'
      tb.style.position = 'absolute'
      const mk = (label) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'min-width:30px;height:26px;padding:0 8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#475569;cursor:pointer;font-size:13px;'; return b }
      tb.appendChild(mk('−')); tb.appendChild(mk('100%')); tb.appendChild(mk('＋')); tb.appendChild(mk('适应'))
      outer.appendChild(tb)
      // 拖拽绑定（内层 view）
      const pan = { on: false, x0: 0, y0: 0, sl0: 0, st0: 0 }
      view.addEventListener('mousedown', (e) => {
        if (e.target && e.target.closest && e.target.closest('.vcp-mermaid-toolbar')) return
        pan.on = true; pan.x0 = e.clientX; pan.y0 = e.clientY; pan.sl0 = view.scrollLeft; pan.st0 = view.scrollTop
      })
      document.addEventListener('mousemove', (e) => {
        if (!pan.on) return
        view.scrollLeft = pan.sl0 - (e.clientX - pan.x0)
        view.scrollTop = pan.st0 - (e.clientY - pan.y0)
      })
      document.addEventListener('mouseup', () => { pan.on = false })
      return {
        w: outer.getBoundingClientRect().width,
        h: outer.getBoundingClientRect().height,
        rawW,
        wAfterApply: svg.style.width,
        scrollWAfterApply: view.scrollWidth,
      }
    })
    console.log(`容器: ${info.w}x${info.h} | rawW=${info.rawW} | apply后svg宽=${info.wAfterApply} | scrollWidth=${info.scrollWAfterApply}`)

    // 拖拽前记录控制条位置
    const tbBefore = await page.evaluate(() => {
      const tb = document.querySelector('.vcp-mermaid-toolbar')
      return tb ? tb.getBoundingClientRect().top.toFixed(1) + ',' + tb.getBoundingClientRect().left.toFixed(1) : 'none'
    })
    console.log(`控制条拖拽前: ${tbBefore}`)
    // 拖拽：向上拖（查看下方内容）→ scrollTop 应增大
    const box = await (await page.$('div.mermaid .vcp-mermaid-view')).boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy - 120, { steps: 8 })
    await page.mouse.up()

    const res = await page.evaluate(() => {
      const view = document.querySelector('div.mermaid .vcp-mermaid-view')
      const svg = view.querySelector('svg')
      const tb = document.querySelector('.vcp-mermaid-toolbar')
      return {
        scrollLeft: view.scrollLeft, scrollTop: view.scrollTop,
        scrollWidth: view.scrollWidth, clientWidth: view.clientWidth,
        scrollHeight: view.scrollHeight, clientHeight: view.clientHeight,
        svgStyleWidth: svg.style.width,
        svgAttrWidth: svg.getAttribute('width'),
        svgRect: svg.getBoundingClientRect().width.toFixed(0) + 'x' + svg.getBoundingClientRect().height.toFixed(0),
        svgMaxW: svg.style.maxWidth,
        tbPos: tb ? tb.getBoundingClientRect().top.toFixed(1) + ',' + tb.getBoundingClientRect().left.toFixed(1) : 'none',
      }
    })
    console.log(`控制条拖拽后: ${res.tbPos}`)
    console.log(`拖拽后 scrollLeft=${res.scrollLeft} scrollTop=${res.scrollTop}`)
    console.log(`溢出诊断: scrollWidth=${res.scrollWidth} clientWidth=${res.clientWidth} | scrollHeight=${res.scrollHeight} clientHeight=${res.clientHeight}`)
    console.log(`svg: style.width=${res.svgStyleWidth} attr.width=${res.svgAttrWidth} rect=${res.svgRect} maxWidth=${res.svgMaxW}`)
    const overflow = res.scrollWidth > res.clientWidth || res.scrollHeight > res.clientHeight
    const tbStable = tbBefore !== 'none' && res.tbPos === tbBefore
    const ok = overflow && (res.scrollLeft > 0 || res.scrollTop > 0) && tbStable
    console.log(tbStable ? '控制条位置不变 ✓（拖拽不带走）' : '控制条位置变化 ✗')
    console.log(ok ? '\n拖拽平移 + 控制条固定 全部通过 ✓' : `\n${overflow ? '内容溢出但拖拽未生效' : '内容未溢出'} ✗`)
    process.exitCode = ok ? 0 : 1
  } finally {
    await browser.close()
  }
}
main().catch((e) => { console.error('异常:', e); process.exitCode = 1 })
