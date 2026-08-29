/**
 * 运行时字体诊断（先生 2026-08-27 · 字体仍黑体排查）
 * 打开 DSH 页面，检查：
 *  1. ensureGlobalFonts 是否成功注入 @font-face 容器
 *  2. document.fonts 是否注册了 Lanxi-* 家族
 *  3. 页面 VCP 消息卡的根容器/子元素 computed font-family
 * 运行：node tests/diag-fonts.cjs
 */
const puppeteer = require('G:/AI/AI 助手/VCPChat-main/node_modules/puppeteer')
const fs = require('fs')

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]
function findEdge() { return EDGE_CANDIDATES.find((p) => fs.existsSync(p)) }

async function main() {
  const edge = findEdge()
  console.log('Edge:', edge || '(未找到，用默认)')
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: edge || undefined,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  })
  const page = await browser.newPage()
  page.on('console', (m) => {
    const t = m.text()
    if (/dsh-raw-html|font|Lanxi|vcp/i.test(t)) console.log('[page]', t.slice(0, 300))
  })
  await page.goto('http://127.0.0.1:3080/', { waitUntil: 'networkidle2', timeout: 90000 })
  await new Promise((r) => setTimeout(r, 6000))

  const info = await page.evaluate(() => {
    const out = {}
    const host = document.getElementById('dsh-raw-html-aes-fontfaces')
    out.fontHostExists = !!host
    out.fontRuleCount = host ? (host.textContent.match(/@font-face/g) || []).length : 0
    out.hasLanxiFree = !!host && host.textContent.indexOf('Lanxi-自由浪漫') !== -1
    out.hasLanxiDingDing = !!host && host.textContent.indexOf('Lanxi-叮叮') !== -1
    out.hasLanxiKaTong = !!host && host.textContent.indexOf('Lanxi-卡通') !== -1
    try { out.fontsCheckFree = document.fonts.check("13px 'Lanxi-自由浪漫'") } catch (e) { out.fontsCheckFree = 'err:' + e.message }
    out.registeredLanxi = []
    try {
      for (const f of document.fonts) {
        if (f.family && String(f.family).indexOf('Lanxi') !== -1) out.registeredLanxi.push(String(f.family) + ' | ' + f.status)
      }
    } catch (e) { out.registeredLanxi = 'err:' + e.message }
    // 找 VCP 消息卡
    const roots = document.querySelectorAll('[id^="vcp-msg-"]')
    out.vcpCards = roots.length
    if (roots.length) {
      const r = roots[0]
      out.rootId = r.id
      out.rootInlineFF = r.style.fontFamily || '(无内联)'
      out.rootComputedFF = getComputedStyle(r).fontFamily
      const fprev = r.querySelector('[class*="fprev"], [class*="code"]') || r.querySelector('div')
      if (fprev) {
        out.childInlineFF = fprev.style.fontFamily || '(无内联)'
        out.childComputedFF = getComputedStyle(fprev).fontFamily
      }
    }
    // 尝试用 Lanxi 渲染一个测试元素并读计算样式
    const probe = document.createElement('div')
    probe.style.cssText = "position:fixed;left:-9999px;top:0;font-family:'Lanxi-自由浪漫',cursive;font-size:20px;"
    probe.textContent = '测试'
    document.body.appendChild(probe)
    out.probeInlineFF = probe.style.fontFamily
    out.probeComputedFF = getComputedStyle(probe).fontFamily
    probe.remove()
    return out
  })
  console.log('=== 诊断结果 ===')
  console.log(JSON.stringify(info, null, 2))
  await browser.close()
}
main().catch((e) => { console.error('FATAL', e); process.exit(1) })
