#!/usr/bin/env node
/**
 * dsh-raw-html —— 前端渲染补丁脚本（VCP 视觉通感协议支持）v6
 *
 * 修改 @deepseek-ai/dsh-web-frontend 的 dist bundle（index-*.js）：
 *
 *   A. pu() 的 case"html" 分支（v6.35 三态化版）：
 *      localStorage['dsh.rawHtml'] !== '0' 时（未设置=默认开 / "1"=开 / "0"=显式关闭），
 *      调 window.__vcpStable.render() 把 HTML 流式内容转成 React 元素；
 *      - 【表情包修复】Markdown 图片语法 ![alt](url) 先转 <img>（URL 白名单
 *        http/https、data:image/*、相对路径，其余协议不生成 img）
 *      - 【流式渲染 + 稳定区固化 v6】已渲染块固化 + 只重渲染尾巴：
 *        轻量 HTML 扫描器把流式内容切成「已闭合块 + 尾巴」；已闭合块解析一次
 *        并缓存（元素引用跨帧不变 → React 跳过 diff → DOM 不重建 → 动画真循环、
 *        超长卡片不掉帧）；vcp-root 未闭合期间内部闭合子块照样固化，容器开标签
 *        单独解析并包裹组装；每帧只解析新增段；前缀失配（回退/多消息切换）与
 *        容器闭合帧走全量兜底。
 *      - 【动画防闪】tail 流式中剥一次性动画（保留 infinite），固化块保留全部
 *        动画（一次性动画在块稳定时播放一次，不闪烁）；最终帧（非流式）tail
 *        动画全保留。缓存键区分流式/非流式，避免动画状态串用。
 *
 *   B. vc() 属性循环增强 v2（DOM → React 元素转换器）：
 *      - onclick="input('...')" 属性 → React onClick 处理器（桥接 window.__dshInput）
 *      - 过滤 script / iframe / object / embed 标签
 *      - style 危险属性过滤（position:fixed / z-index>=1000 / content:）
 *      - URL 协议白名单（href: http/https/mailto/相对路径/锚点；src: 同 + data:image）
 *
 *   C. vc() 定义前注入 v6 稳定区模块（patch/v6-inject.js）：
 *      扫描器 + 状态机 + 组装逻辑，挂载到 window.__vcpStable。
 *
 *   健康检查：补丁写入后自动运行 `node --check` 校验 bundle 语法；
 *   校验失败自动回滚到本次备份并中止。
 *
 * 开关状态由 dsh-raw-html 插件的「</>」按钮写入 localStorage。
 *
 * 用法：
 *   node patch-frontend.cjs [bundle路径]
 * 备份：
 *   同目录生成 index-*.js.bak-<时间戳>；恢复时把 .bak 改回原名即可。
 */
'use strict'

const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

/**
 * 自动探测 dsh-web-frontend 的 dist bundle：
 * 依次检查参数指定 → 环境变量 → 常见安装位置（npm 全局 / 用户 .dsh profile）。
 * 找不到时返回 null（由调用方提示手动指定）。
 */
function findBundle() {
  // 0) 命令行参数优先
  const arg = process.argv[2]
  if (arg) return fs.existsSync(arg) ? arg : null

  // 1) 环境变量
  if (process.env.DSH_WEB_FRONTEND_DIST) {
    const p = process.env.DSH_WEB_FRONTEND_DIST
    if (fs.existsSync(p)) return p
  }

  // 2) 常见安装位置
  const candidates = []
  const addDir = (d) => {
    if (!d || !fs.existsSync(d)) return
    try {
      const assets = path.join(d, 'dist', 'assets')
      if (!fs.existsSync(assets)) return
      for (const f of fs.readdirSync(assets)) {
        if (/^index-[\w-]+\.js$/.test(f)) candidates.push(path.join(assets, f))
      }
    } catch {
      // 目录不可读则跳过。
    }
  }
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'web', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  addDir(path.join(process.env.USERPROFILE || '', '.dsh', 'profiles', 'node_modules', '@deepseek-ai', 'dsh-web-frontend'))
  return candidates[0] || null
}

const file = findBundle()

if (!file) {
  console.error('[patch] 未自动找到 dsh-web-frontend 的 dist bundle。')
  console.error('[patch] 用法: node patch-frontend.cjs <bundle路径>')
  console.error('[patch] 例如: node patch-frontend.cjs "C:\\...\\dsh-web-frontend\\dist\\assets\\index-xxx.js"')
  process.exit(1)
}

let t = fs.readFileSync(file, 'utf8')

// ---- 锚点 A：case"html" 分支（当前 bundle v4 状态）------------------------
const CASE_HTML_BEFORE = String.raw`case"html":return function(){if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"){try{const v=(n.value||"").replace(/!\[([^\]]*)\]\(([^)]+)\)/g,function(m,a,u){u=u.trim();if(!/^(https?:|data:image\/|\/)/i.test(u))return m;return"<img alt=\""+((a||"").replace(/"/g,"&quot;"))+"\" src=\""+u.replace(/"/g,"&quot;")+"\">"}),w=i.streaming?v.replace(/animation:([^;"']*);?/g,function(m,x){return/infinite/.test(x)?m:""}):v,F=window.__vcpFast||(window.__vcpFast={c:new Map(),last:"",el:null,hits:0,builds:0,ms:0,lastLog:0}),t0=typeof performance!=="undefined"&&performance.now?performance.now():0;if(F.c.has(w)){F.hits++;if(t0&&performance.now()-F.lastLog>2000){F.lastLog=performance.now();console.debug("[vcp-fast] HIT size="+F.c.size+" hits="+F.hits+" builds="+F.builds)}return F.c.get(w)}let R=null;if(F.last!==""&&F.el!==null&&w.startsWith(F.last)&&(/<\/[a-zA-Z][^>]*>\s*$/.test(F.last)||/<[a-zA-Z][^>]*\/>\s*$/.test(F.last))){const tb=new DOMParser().parseFromString(w.slice(F.last.length),"text/html").body,to=[];for(let k=0;k<tb.childNodes.length;k++)to.push(vc(tb.childNodes[k],k));if(to.length===0)R=F.el;else R=f.jsx(f.Fragment,{children:[F.el,to.length===1?to[0]:f.jsx(f.Fragment,{children:to})]})}else{const b=new DOMParser().parseFromString(w,"text/html").body;if(!b.childNodes.length)return null;const o=[];for(let k=0;k<b.childNodes.length;k++)o.push(vc(b.childNodes[k],k));R=o.length===1?o[0]:f.jsx(f.Fragment,{children:o})}F.c.set(w,R);if(F.c.size>200)F.c.clear();F.last=w;F.el=R;F.builds++;if(t0){F.ms+=performance.now()-t0;if(performance.now()-F.lastLog>2000){F.lastLog=performance.now();console.debug("[vcp-fast] BUILD size="+F.c.size+" avg="+(F.ms/F.builds).toFixed(2)+"ms last="+w.length)}}return R}catch(e){}}return n.value}();`

// v5：图片 URL 白名单（http/https/data:image/相对路径），其余协议不生成 img
const CASE_HTML_AFTER = String.raw`case"html":return function(){if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"){try{const v=(n.value||"").replace(/!\[([^\]]*)\]\(([^)]+)\)/g,function(m,a,u){u=u.trim();if(!/^(https?:|data:image\/|\/)/i.test(u))return m;return"<img alt=\""+((a||"").replace(/"/g,"&quot;"))+"\" src=\""+u.replace(/"/g,"&quot;")+"\">"}),w=i.streaming?v.replace(/animation:([^;"']*);?/g,function(m,x){return/infinite/.test(x)?m:""}):v,F=window.__vcpFast||(window.__vcpFast={c:new Map(),last:"",el:null,hits:0,builds:0,ms:0,lastLog:0}),t0=typeof performance!=="undefined"&&performance.now?performance.now():0;if(F.c.has(w)){F.hits++;if(t0&&performance.now()-F.lastLog>2000){F.lastLog=performance.now();console.debug("[vcp-fast] HIT size="+F.c.size+" hits="+F.hits+" builds="+F.builds)}return F.c.get(w)}let R=null;if(F.last!==""&&F.el!==null&&w.startsWith(F.last)&&(/<\/[a-zA-Z][^>]*>\s*$/.test(F.last)||/<[a-zA-Z][^>]*\/>\s*$/.test(F.last))){const tb=new DOMParser().parseFromString(w.slice(F.last.length),"text/html").body,to=[];for(let k=0;k<tb.childNodes.length;k++)to.push(vc(tb.childNodes[k],k));if(to.length===0)R=F.el;else R=f.jsx(f.Fragment,{children:[F.el,to.length===1?to[0]:f.jsx(f.Fragment,{children:to})]})}else{const b=new DOMParser().parseFromString(w,"text/html").body;if(!b.childNodes.length)return null;const o=[];for(let k=0;k<b.childNodes.length;k++)o.push(vc(b.childNodes[k],k));R=o.length===1?o[0]:f.jsx(f.Fragment,{children:o})}F.c.set(w,R);if(F.c.size>200)F.c.clear();F.last=w;F.el=R;F.builds++;if(t0){F.ms+=performance.now()-t0;if(performance.now()-F.lastLog>2000){F.lastLog=performance.now();console.debug("[vcp-fast] BUILD size="+F.c.size+" avg="+(F.ms/F.builds).toFixed(2)+"ms last="+w.length)}}return R}catch(e){}}return n.value`

// v6：稳定区固化 —— case"html" 改为调 window.__vcpStable.render（模块由锚点 C 注入）
// 注意：BEFORE 是含尾部 `}();` 的完整分支文本，AFTER 必须同样以 `}();` 结尾（IIFE 调用收尾）
const CASE_HTML_V6_AFTER = String.raw`case"html":return function(){if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"){try{var vr=window.__vcpStable&&window.__vcpStable.render(n.value,i.streaming);if(vr!==null&&vr!==undefined)return vr}catch(e){}}return n.value}();`

// v6.35（先生定调 2026-08-29）：html 分支开关三态化 ——
// 原 v6 要求 dsh.rawHtml==="1" 才渲染；但该键只在用户点过「</>」按钮后才存在，
// 新环境/清缓存后为 undefined → 一切裸 HTML（含 VCP 卡）显示源码（本次事故根因）。
// 改为 !== "0"：undefined（从未设置）= 默认渲染（配合 v6-inject 启动自检落盘 "1"），
// 用户经「</>」按钮显式关闭（"0"）才显示源码；并加 console.warn 诊断回退原因。
const CASE_HTML_V7_AFTER = String.raw`case"html":return function(){if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")!=="0"){try{var vr=window.__vcpStable&&window.__vcpStable.render(n.value,i.streaming);if(vr!==null&&vr!==undefined)return vr}catch(e){if(typeof console!=="undefined")console.warn("[vcp] html 渲染异常，已回退源码",e)}}else if(typeof console!=="undefined")console.warn("[vcp] html 渲染已关闭（dsh.rawHtml===\"0\"，</> 按钮可重新开启）");return n.value}();`

// ---- 锚点 B：vc() 属性循环（当前 bundle 增强 v2 状态）-----------------------
const VC_LOOP_BEFORE = String.raw`for(const c of i.attributes){if(c.name==="onclick"){const m=/^input\s*\(\s*['"]([\s\S]*?)['"]\s*\)\s*;?\s*$/.exec(c.value);if(m)s.onClick=function(){const fn=window.__dshInput;fn&&fn(m[1])};continue}if(c.name==="style"){let sv=c.value;sv=sv.replace(/position\s*:\s*fixed\s*;?/gi,"").replace(/z-index\s*:\s*\d{4,}\s*;?/gi,"").replace(/content\s*:\s*[^;"']*;?/gi,"");s.style=hp(sv);continue}if(c.name==="class"){s.className=c.value;continue}if(c.name==="href"&&!/^(https?:|mailto:|\/|#)/i.test(c.value))continue;if(c.name==="src"&&!/^(https?:|data:image\/|\/|#)/i.test(c.value))continue;s[c.name]=c.value}`

// v2.1：修复 content 过滤——旧正则 [^;"']* 匹配不了引号包裹的值（content:"文字"），
// 导致伪元素文字注入漏网；改为 [^;]* 到分号为止全剥
const VC_LOOP_AFTER = String.raw`for(const c of i.attributes){if(c.name==="onclick"){const m=/^input\s*\(\s*['"]([\s\S]*?)['"]\s*\)\s*;?\s*$/.exec(c.value);if(m)s.onClick=function(){const fn=window.__dshInput;fn&&fn(m[1])};continue}if(c.name==="style"){let sv=c.value;sv=sv.replace(/position\s*:\s*fixed\s*;?/gi,"").replace(/z-index\s*:\s*\d{4,}\s*;?/gi,"").replace(/content\s*:[^;]*;?/gi,"");s.style=hp(sv);continue}if(c.name==="class"){s.className=c.value;continue}if(c.name==="href"&&!/^(https?:|mailto:|\/|#)/i.test(c.value))continue;if(c.name==="src"&&!/^(https?:|data:image\/|\/|#)/i.test(c.value))continue;s[c.name]=c.value}`

// ---- 锚点 B：vc 属性循环 content 正则加词边界（v6.5 修复）------------------
// 旧正则 /content\s*:[^;]*;?/ 会误伤 justify-content（content 是 justify-content 的子串），
// 把「justify-content: center」剥成「justify-」，并与后随的 animation 粘连成
// 「justify-animation」，导致 animation 属性丢失、动画失效。加后行断言 (?<![\w-])
// 让 content 前面不能是单词字符或连字符，仅匹配独立的 content: 属性。
const CONTENT_RE_BEFORE = String.raw`replace(/content\s*:[^;]*;?/gi,"")`
const CONTENT_RE_AFTER = String.raw`replace(/(?<![\w-])content\s*:[^;]*;?/gi,"")`

// ---- 锚点 D：style 分支加 ref 回调锁定文字属性（v6.11 优先级锁定）-----------
// 需求：VCP 卡片内联 style 的文字颜色/字体/字号必须最高优先级，不被其他
// 字体/主题插件的全局 !important 规则覆盖。React 内联 style 不支持 !important
// （style 值带 "!important" 后缀会被 setProperty 吞掉），唯一可靠方式是在 ref
// 回调里对文字相关属性 el.style.setProperty(prop, val, "important")。
// 锁定属性：color/font-family/font-size/font-weight/font-style/line-height/
// letter-spacing/text-align/text-shadow（不含布局与 animation，避免影响流式动画）。
const STYLE_REF_BEFORE = String.raw`s.style=hp(sv);continue}`
const STYLE_REF_AFTER = String.raw`s.style=hp(sv);s.ref=function(el){if(el)for(const d of sv.split(";")){const j=d.indexOf(":");if(j===-1)continue;const p=d.slice(0,j).trim(),v=d.slice(j+1).trim();if(v&&/^(color|font-family|font-size|font-weight|font-style|line-height|letter-spacing|text-align|text-shadow)$/.test(p))el.style.setProperty(p,v,"important")}};continue}`

// ---- 锚点 E：代码围栏兜底（v6.30 → v6.32 升级）---------------------------
// Ox Alpha 实测：协议只说「直接输出 HTML」未禁止围栏，模型把卡片包在
// ```html ... ``` 里 → markdown 解析为 code 节点 → 显示源码。
// 兜底：代码块内容以 <div id="vcp-root" 开头 → 直接调 vcp render（围栏剥离、
// 裸 HTML 渲染），符合「HTML 即渲染」语义；判定保守，普通代码示例不受影响。
// v6.32 修复：围栏兜底必须带渲染开关检查（localStorage['dsh.rawHtml']==='1'），
// 否则关闭渲染插件后围栏 HTML 仍被强制渲染成卡片（先生实测发现）。
const CODE_CASE_RAW = String.raw`case"code":return wp(n,r,i);`
const CODE_CASE_V1 = String.raw`case"code":{try{const _v=(n.value||"").trim();if(/^<div\s+id=["']vcp-root["']/i.test(_v)){const _r=window.__vcpStable&&window.__vcpStable.render(n.value,i.streaming);if(_r!==null&&_r!==undefined)return _r}}catch(_e){}return wp(n,r,i)}`
const CODE_CASE_V2 = String.raw`case"code":{try{const _v=(n.value||"").trim();if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")==="1"&&/^<div\s+id=["']vcp-root["']/i.test(_v)){const _r=window.__vcpStable&&window.__vcpStable.render(n.value,i.streaming);if(_r!==null&&_r!==undefined)return _r}}catch(_e){}return wp(n,r,i)}`
// v6.35（先生定调 2026-08-29）：围栏兜底三态化 —— 原 v6.32 带 === "1" 开关检查，
// 开关未设置（undefined）时围栏包 VCP 卡也显示源码（本次事故形态）。改为 !== "0"：
// 白名单（vcp-root 开头）仍保留防误伤普通代码块，显式关闭（"0"）才不接管。
const CODE_CASE_V3 = String.raw`case"code":{try{const _v=(n.value||"").trim();if(typeof localStorage!=="undefined"&&localStorage.getItem("dsh.rawHtml")!=="0"&&/^<div\s+id=["']vcp-root["']/i.test(_v)){const _r=window.__vcpStable&&window.__vcpStable.render(n.value,i.streaming);if(_r!==null&&_r!==undefined)return _r}}catch(_e){if(typeof console!=="undefined")console.warn("[vcp] code 围栏渲染异常，已回退代码块",_e)}return wp(n,r,i)}`

// ---- 锚点 F：bc（markdown 组件）解析前做卡片空行修复（v6.37 · 先生 2026-08-29）----
// CommonMark type 6 规则：<div> 等块级标签【不能打断段落】——消息以
// 「文字前言 + 换行 + <div id="vcp-root">」（中间无空行）输出时，mdast 把
// <div> 开标签当【段落内联 HTML】，后续 <div class="paper"> 等脱离 vcp-root
// 变成兄弟节点 → 根容器背景生效但子选择器全失效（先生实测「最外围框住、
// 内部格式全掉」）。修复：解析前调用注入块的 fixVcpBlank（window.__vcpStable
// 挂载）把该换行补成空行，让卡片成为独立 htmlFlow；无 vcp-root 或已是空行
// 时幂等不动。流式 Mp / 非流式 bp 共用同一 t。
const BC_BEFORE = String.raw`const bc=R.memo(function({text:r,streaming:i=!1,codeLabels:s,fileMentions:u}){const c=R.useRef(null),h=R.useRef(s),p=R.useMemo(()=>i?((c.current===null||h.current!==s)&&(c.current=new Mp(s),h.current=s),c.current.render(r)):(c.current=null,bp(r,s,u)),[r,i,s,u]);return f.jsx("div",{className:S1.markdown,children:p})})`
const BC_AFTER = String.raw`const bc=R.memo(function({text:r,streaming:i=!1,codeLabels:s,fileMentions:u}){const c=R.useRef(null),h=R.useRef(s),t=(window.__vcpStable&&window.__vcpStable.fixBlank?window.__vcpStable.fixBlank(r):r),p=R.useMemo(()=>i?((c.current===null||h.current!==s)&&(c.current=new Mp(s),h.current=s),c.current.render(t)):(c.current=null,bp(t,s,u)),[r,i,s,u]);return f.jsx("div",{className:S1.markdown,children:p})})`

// ---- 锚点 C：vc() 定义前注入 v6 稳定区模块 ----
// 模块源码来自同目录 v6-inject.js（无 import/export，依赖闭包 vc/hp/f 与全局 window/DOMParser）。
// BEFORE 用「hp 函数结束 + vc 函数开始」的拼接锚点，保证唯一且幂等（注入后不再命中）。
const VC_DEF_BEFORE = String.raw`}function vc(n,r){`
let VC_INJECT = ''
try {
  VC_INJECT = fs.readFileSync(path.join(__dirname, 'v6-inject.js'), 'utf8')
} catch (e) {
  console.error('[patch] 读取 patch/v6-inject.js 失败：', e.message)
  process.exit(1)
}
const VC_DEF_AFTER = '}' + VC_INJECT + ';function vc(n,r){'

// ---- v6 模块更新：已注入（含标记）→ 就地替换整块；未注入 → 走锚点 C ----
// v6.12 起支持幂等重打：v6-inject.js 首尾带 __DSH_V6_INJECT_START__/__END__ 标记，
// 重跑补丁时直接把旧块换成新块，无需先恢复备份；旧版无标记注入也兼容升级。
let v6Handled = false
{
  const START_MARK = '/*__DSH_V6_INJECT_START__*/'
  const END_MARK = '/*__DSH_V6_INJECT_END__*/'
  const si = t.indexOf(START_MARK)
  const ei = t.indexOf(END_MARK)
  if (si !== -1 && ei !== -1 && ei > si) {
    t = t.slice(0, si) + VC_INJECT + t.slice(ei + END_MARK.length)
    v6Handled = true
    console.log('[patch] v6 模块就地更新（幂等重打）')
  } else if (t.indexOf('window.__vcpStable = { render: render }') !== -1) {
    // 旧版无标记注入（v6.12 之前打的补丁）：定位旧块首尾升级
    const oldStart = ';(function () {\n  // 无障碍：'
    const oldEnd = 'window.__vcpStable = { render: render }\n})()'
    const s2 = t.indexOf(oldStart)
    const e2 = t.indexOf(oldEnd)
    if (s2 !== -1 && e2 !== -1 && e2 > s2) {
      t = t.slice(0, s2) + VC_INJECT + t.slice(e2 + oldEnd.length)
      v6Handled = true
      console.log('[patch] 旧版 v6 模块就地升级（无标记注入）')
    } else {
      console.error('[patch] 检测到旧版 v6 注入但无法定位旧块边界，请先恢复 .bak 备份再重打')
      process.exit(1)
    }
  }
}

// ---- 围栏兜底升级状态机（v6.32 → v6.35）：v6.32 带 === "1" 开关检查（新环境
// undefined 时 VCP 卡显示源码）；v6.35 三态化（!== "0"：未设置默认开、显式关闭才拒）。
let codeCaseHandled = false
if (t.indexOf(CODE_CASE_V3) !== -1) {
  codeCaseHandled = true
  console.log('[patch] 围栏兜底已是最新版（v6.35 三态化），跳过')
} else if (t.indexOf(CODE_CASE_V2) !== -1) {
  t = t.replace(CODE_CASE_V2, CODE_CASE_V3)
  codeCaseHandled = true
  console.log('[patch] 围栏兜底升级：v6.32 开关检查 → v6.35 三态化')
} else if (t.indexOf(CODE_CASE_V1) !== -1) {
  t = t.replace(CODE_CASE_V1, CODE_CASE_V3)
  codeCaseHandled = true
  console.log('[patch] 围栏兜底升级：v6.30 纯白名单 → v6.35 三态化')
}

// ---- html 分支升级状态机（v6/v5 → v6.35）：同上三态化，消除「开关未设置 =
// 一切裸 HTML 显示源码」的陷阱；旧版（v5 无 render 调用 / v6 === "1"）一律升级。
let htmlCaseHandled = false
if (t.indexOf(CASE_HTML_V7_AFTER) !== -1) {
  htmlCaseHandled = true
  console.log('[patch] html 分支已是最新版（v6.35 三态化），跳过')
} else if (t.indexOf(CASE_HTML_V6_AFTER) !== -1) {
  t = t.replace(CASE_HTML_V6_AFTER, CASE_HTML_V7_AFTER)
  htmlCaseHandled = true
  console.log('[patch] html 分支升级：v6 开关检查 → v6.35 三态化')
} else if (t.indexOf(CASE_HTML_AFTER) !== -1) {
  t = t.replace(CASE_HTML_AFTER, CASE_HTML_V7_AFTER)
  htmlCaseHandled = true
  console.log('[patch] html 分支升级：v5 → v6.35 三态化')
}

/**
 * 替换表：label / from（必须唯一命中）/ to。
 * v6 补丁 = 锚点 C（注入稳定区模块）+ 锚点 A（case"html" 改调 render）。
 * 注：vc 属性循环（content 过滤 v2.1）已在 v5.1 应用，无需重复。
 * 幂等：已应用的锚点（to 已存在）自动跳过；未应用的锚点（from 唯一命中）应用。
 */
const REPLACEMENTS = []
if (!v6Handled) {
  REPLACEMENTS.push({
    label: 'C.注入 v6 稳定区模块（vc 定义前）',
    from: VC_DEF_BEFORE,
    to: VC_DEF_AFTER,
  })
}
if (!codeCaseHandled) {
  REPLACEMENTS.push({
    label: 'E.case"code" 围栏兜底（v6.35 三态化：vcp-root 白名单 + 显式关闭才拒）',
    from: CODE_CASE_RAW,
    to: CODE_CASE_V3,
  })
}
REPLACEMENTS.push(
  {
    label: 'B.vc content 正则加词边界（防误伤 justify-content）',
    from: CONTENT_RE_BEFORE,
    to: CONTENT_RE_AFTER,
  },
  {
    label: 'D.vc style 分支加 ref 锁定文字属性优先级',
    from: STYLE_REF_BEFORE,
    to: STYLE_REF_AFTER,
  },
)
if (!htmlCaseHandled) {
  REPLACEMENTS.push({
    label: 'A.case"html" 分支（v5/v6 → v6.35 三态化：未设置默认开）',
    from: CASE_HTML_BEFORE,
    to: CASE_HTML_V7_AFTER,
  })
}
REPLACEMENTS.push({
  label: 'F.bc 卡片空行修复（v6.37：文字+换行+<div> 撕裂 → 补空行成独立 htmlFlow）',
  from: BC_BEFORE,
  to: BC_AFTER,
})

let changed = 0
for (const r of REPLACEMENTS) {
  const count = t.split(r.from).length - 1
  if (count === 1) {
    t = t.split(r.from).join(r.to)
    changed += 1
  } else if (count === 0 && t.indexOf(r.to) !== -1) {
    console.log(`[patch] 锚点 "${r.label}" 已应用，跳过`)
  } else {
    console.error(`[patch] 锚点 "${r.label}" 命中 ${count} 次（需要恰好 1 次），中止，未写入任何修改`)
    process.exit(1)
  }
}

// 备份原文件（仅当本次确有改动且尚无备份时）
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const bak = `${file}.bak-${stamp}`
fs.copyFileSync(file, bak)
fs.writeFileSync(file, t, 'utf8')

console.log(`[patch] 完成：${changed} 处补丁已写入`)
console.log(`[patch] 文件: ${file}`)
console.log(`[patch] 备份: ${bak}`)

// 健康检查：node --check 校验 bundle 语法；失败自动回滚
try {
  execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' })
  console.log('[patch] 健康检查通过：node --check OK')
} catch (e) {
  if (fs.existsSync(bak)) {
    fs.copyFileSync(bak, file)
    console.error('[patch] 健康检查失败，已回滚到本次备份，未留下损坏产物！')
    console.error('[patch] 失败详情:', String(e.stderr || e.message).split('\n')[0])
  } else {
    console.error('[patch] 健康检查失败且无备份可回滚，请手工修复！')
  }
  process.exit(1)
}

console.log('[patch] 刷新浏览器即可生效（浏览器缓存较旧时请强刷 Ctrl+F5）')
