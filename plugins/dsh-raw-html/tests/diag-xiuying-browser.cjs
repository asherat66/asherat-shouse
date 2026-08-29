/**
 * 秀英体 v2 修复版浏览器加载验证（蓝汐 2026-08-29）
 * 依赖：tools/ 下 python http.server 8091 已启动 + tools/汉仪秀英体简-v2.ttf
 * 运行：node tests/diag-xiuying-browser.cjs
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
  await page.goto('http://127.0.0.1:8091/xiuying-test.html', { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((r) => setTimeout(r, 4000))
  const title = await page.title()
  console.log('RESULT:', title)
  // 附加验证：v2 字体实际渲染宽度（对比 sans-serif 黑体宽度差异可证字体生效）
  const w = await page.evaluate(() => {
    const div = document.getElementById('t')
    const w1 = div.getBoundingClientRect().width
    div.style.fontFamily = 'sans-serif'
    const w2 = div.getBoundingClientRect().width
    return { withFont: Math.round(w1 * 100) / 100, fallback: Math.round(w2 * 100) / 100 }
  })
  console.log('WIDTH:', JSON.stringify(w))
  await browser.close()
}

main().catch((e) => { console.error('FATAL:', e.message); process.exit(1) })
