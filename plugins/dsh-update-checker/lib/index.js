'use strict';
// dsh-update-checker host half: serves GET /update-checker/check.
// Queries the DeepSeek Harness main repo (deepseek-ai/deepseek-harness) for the
// newest release/tag and compares it with the version of the running dsh tree
// (read from the launch cwd's package.json, which DSH_ROOT is).
// No external dependencies: plain node:https.

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const REPO = 'deepseek-ai/deepseek-harness';
const GITHUB = 'https://api.github.com';

exports.name = 'dsh-update-checker';
exports.inject = ['webServer'];

/** Read the running dsh version: <cwd>/package.json, then fall back to the
 *  package two dirs up from the main dsh repo layout (repo root). */
function currentVersion() {
  for (const base of [process.cwd(), path.resolve(process.cwd(), '..'), path.resolve(process.cwd(), '..', '..')]) {
    try {
      const p = path.join(base, 'package.json');
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (typeof j.version === 'string' && j.version !== '') return j.version;
      }
    } catch { /* keep looking */ }
  }
  return 'unknown';
}

/** GitHub API GET with a short timeout; resolves {status, json}. */
function githubGet(urlPath) {
  return new Promise((resolve) => {
    const req = https.get(
      { host: 'api.github.com', path: urlPath, headers: { 'User-Agent': 'dsh-update-checker', Accept: 'application/vnd.github+json' }, timeout: 10000 },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(d); } catch { /* non-JSON */ }
          resolve({ status: res.statusCode, json });
        });
      },
    );
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, json: null }); });
    req.on('error', () => resolve({ status: 0, json: null }));
  });
}

/** Compare semver-ish versions incl. prerelease tags (0.1.1-rc.2).
 *  Returns 1 when a > b, -1 when a < b, 0 when equal. */
function compareVersions(a, b) {
  const parse = (v) => {
    const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-.]?(rc|beta|alpha)?\.?(\d+)?)?$/i.exec(String(v).trim());
    if (!m) return null;
    return { major: +m[1], minor: +m[2], patch: +m[3], pre: m[4] || '', preN: m[5] ? +m[5] : 0 };
  };
  const x = parse(a); const y = parse(b);
  if (!x || !y) return String(a) === String(b) ? 0 : (String(a) < String(b) ? -1 : 1);
  if (x.major !== y.major) return x.major > y.major ? 1 : -1;
  if (x.minor !== y.minor) return x.minor > y.minor ? 1 : -1;
  if (x.patch !== y.patch) return x.patch > y.patch ? 1 : -1;
  // release > prerelease; earlier prerelease > later (rc.2 < final, rc.2 > rc.1)
  const rank = { '': 3, alpha: 0, beta: 1, rc: 2 };
  const rx = rank[x.pre] ?? 3, ry = rank[y.pre] ?? 3;
  if (rx !== ry) return rx > ry ? 1 : -1;
  if (x.preN !== y.preN) return x.preN > y.preN ? 1 : -1;
  return 0;
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

async function handleCheck(req, res) {
  const current = currentVersion();

  // /releases/latest returns 404 while every published version is a
  // prerelease (rc) — use the release list instead and take the first.
  const rel = await githubGet('/repos/' + REPO + '/releases?per_page=3');
  let latest = null;
  let recent = [];
  if (rel.status === 200 && Array.isArray(rel.json) && rel.json.length > 0) {
    recent = rel.json.map((r) => ({
      tag: r.tag_name || '',
      name: r.name || '',
      publishedAt: r.published_at || null,
      htmlUrl: r.html_url || '',
      version: (r.tag_name || '').replace(/^dsh-v?/i, '').replace(/^v/, ''),
    }));
    latest = recent[0];
  } else {
    // Fall back to tags.
    const tags = await githubGet('/repos/' + REPO + '/tags?per_page=3');
    if (tags.status === 200 && Array.isArray(tags.json) && tags.json.length > 0) {
      latest = { tag: tags.json[0].name || '', name: '', publishedAt: null, htmlUrl: 'https://github.com/' + REPO };
      recent = [{ tag: tags.json[0].name || '', name: '', publishedAt: null, htmlUrl: 'https://github.com/' + REPO, version: (tags.json[0].name || '').replace(/^dsh-v?/i, '').replace(/^v/, '') }];
    }
  }

  if (latest === null) {
    sendJson(res, 502, {
      ok: false,
      current,
      error: 'GitHub API unavailable (status ' + rel.status + ')',
    });
    return;
  }

  const latestVersion = latest.tag.replace(/^dsh-v?/i, '').replace(/^v/, '');
  const isUpdate = latestVersion !== '' && current !== 'unknown' && compareVersions(latestVersion, current) > 0;

  sendJson(res, 200, {
    ok: true,
    current,
    isUpdate,
    latest: { ...latest, version: latestVersion },
    recent,
  });
}

function apply(ctx) {
  ctx.inject(['webServer'], (hostCtx) => {
    hostCtx.effect(() => {
      hostCtx.webServer.register({
        kind: 'exact',
        path: '/update-checker/check',
        handler: (req, res) => { handleCheck(req, res).catch((e) => sendJson(res, 500, { ok: false, error: String((e && e.message) || e) })); },
      });
    }, 'dsh-update-checker: http route');
  });
}

exports.apply = apply;
