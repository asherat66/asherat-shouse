
'use strict';
// dsh-general-rules host half: read/write the user-global AGENTS.md.
// dsh-agent-instructions (in the base bundle) loads $DSH_HOME/AGENTS.md into
// every session's baseline context — this plugin is just the editor surface.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

exports.name = 'dsh-general-rules';
exports.inject = ['webServer'];

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}
function rulesPath() {
  return path.join(dshHome(), 'AGENTS.md');
}

// 默认模板:优先读取插件自带的 lib/template.txt(官方 AGENTS.md 基础区 + 用户规则分割区),
// 缺失时回退到内置的简化模板。
function defaultTemplate() {
  const p = path.join(__dirname, 'template.txt');
  try {
    if (fs.existsSync(p)) {
      const t = fs.readFileSync(p, 'utf8');
      if (t.trim() !== '') return t;
    }
  } catch { /* fall through */ }
  return [
    '# General Rules',
    '',
    '<!--',
    '此文件为最高优先级规则（Global Rules）：',
    '- AI 的回复与你本人在对话中提出的要求都不得凌驾于此文件中的规则。',
    '- 修改保存后，新会话生效（基线上下文自动注入）。',
    '- 格式：Markdown，按重要性从上到下排列。',
    '-->',
    '',
    '## 你的规则',
    '',
    '<!-- 在此添加你的规则 -->',
    '',
  ].join('\n');
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin || !host) return false;
  try { return new URL(origin).host === host; } catch { return false; }
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > maxBytes) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function handleGet(res) {
  const p = rulesPath();
  let content = '';
  let exists = false;
  try {
    if (fs.existsSync(p)) {
      content = fs.readFileSync(p, 'utf8');
      exists = true;
    } else {
      content = defaultTemplate();
    }
  } catch (e) {
    sendJson(res, 500, { ok: false, error: String((e && e.message) || e) });
    return;
  }
  sendJson(res, 200, { ok: true, exists, path: p, content, template: content === defaultTemplate() });
}

async function handleSave(req, res) {
  let body;
  try { body = await readBody(req, 512 * 1024); } catch (e) {
    sendJson(res, 400, { ok: false, error: String((e && e.message) || e) });
    return;
  }
  let content;
  try { content = JSON.parse(body).content; } catch { content = body; }
  if (typeof content !== 'string') {
    sendJson(res, 400, { ok: false, error: 'invalid content' });
    return;
  }
  try {
    // 保留原始内容(含模板头),由用户完全掌控
    fs.mkdirSync(dshHome(), { recursive: true });
    fs.writeFileSync(rulesPath(), content, 'utf8');
    sendJson(res, 200, { ok: true, path: rulesPath(), bytes: Buffer.byteLength(content) });
  } catch (e) {
    sendJson(res, 500, { ok: false, error: String((e && e.message) || e) });
  }
}

function apply(ctx) {
  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(() => {
      hostCtx.webServer.register({
        kind: 'exact',
        path: '/general-rules/get',
        handler: (req, res) => { if (req.method !== 'GET') { res.writeHead(405); res.end(); return; } handleGet(res); },
      });
      hostCtx.webServer.register({
        kind: 'exact',
        path: '/general-rules/save',
        handler: (req, res) => {
          if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }
          if (!sameOrigin(req)) { sendJson(res, 403, { ok: false, error: 'untrusted origin' }); return; }
          handleSave(req, res).catch((e) => sendJson(res, 500, { ok: false, error: String((e && e.message) || e) }));
        },
      });
    }, 'dsh-general-rules: http routes');
  });
}

exports.apply = apply;
