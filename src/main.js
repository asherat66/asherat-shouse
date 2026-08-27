'use strict';

const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const { ensureProfile } = require('./ensure-profile.cjs');

// 打包后:resources/node(独立 node.exe)、resources/dsh(代码库)
// 开发期:electron . 时无 resources,回退到 repos 根目录 + 系统 node。
const resourcesPath = process.resourcesPath;
const DSH_ROOT =
  fs.existsSync(path.join(resourcesPath, 'dsh'))
    ? path.join(resourcesPath, 'dsh')
    : path.join(__dirname, '..', '..'); // 开发时回退到 F:\deepseek_harness

const NODE_EXE =
  fs.existsSync(path.join(resourcesPath, 'node', process.platform === 'win32' ? 'node.exe' : 'node'))
    ? path.join(resourcesPath, 'node', process.platform === 'win32' ? 'node.exe' : 'node')
    : process.execPath; // Electron 主进程的 node 仅作开发回退,生产会嵌入独立 node.exe

const PORT = process.env.DSH_TEST_MODE === '1'
  ? 3081 // 测试专用(隔离实例)
  : Number(process.env.DSH_PORT || 3080); // 支持多实例/测试隔离
const HOST = '127.0.0.1';
const READY_TIMEOUT_MS = 120000;

let mainWindow = null;
let dshProcess = null;
let serverReady = false;

// 绿色包自愈: junction(zip/移动后)目标可能失效,按 manifest.links.json 重建。
// WinRAR 等工具解压 zip 时 junction 无法还原,直接双击会启动失败;
// 这里在每次启动 dsh 前检测样例链接,失效则全量重建(解压/移动后都可自愈)。
function ensureLinks() {
  const appRoot = path.resolve(process.resourcesPath, '..'); // 绿色包根(exe 同级)
  const manifestPath = path.join(appRoot, 'manifest.links.json');
  if (!fs.existsSync(manifestPath)) return;
  const sample = path.join(DSH_ROOT, 'apps', 'cli', 'node_modules', '@deepseek-ai', 'dsh-app-boot');
  try {
    if (fs.lstatSync(sample).isSymbolicLink() && fs.existsSync(sample)) return; // 链接正常
  } catch { /* 缺失/断链 -> 重建 */ }
  let links = [];
  try { links = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { return; }
  let fixed = 0;
  for (const l of links) {
    try {
      const p = path.join(appRoot, l.path.split('/').join(path.sep));
      let t = String(l.target || '');
      if (t === '') continue;
      // 作者打包机的 win-unpacked 绝对路径 -> 改写为本绿色包根
      const norm = t.replace(/\\/g, '/').toLowerCase();
      const at = norm.indexOf('win-unpacked/');
      if (at >= 0) t = path.join(appRoot, t.slice(at + 'win-unpacked/'.length).split('/').join(path.sep));
      else {
        const rj = norm.indexOf('resources/');
        if (rj >= 0) t = path.join(appRoot, t.slice(rj).split('/').join(path.sep));
      }
      fs.rmSync(p, { force: true, recursive: false });
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.symlinkSync(t, p, 'junction');
      fixed++;
    } catch (e) { /* 单条失败跳过: 其余继续 */ }
  }
  if (fixed > 0) console.log('[dsh-desktop] auto-relink:', fixed, 'junctions rebuilt');
}

function log(...args) {
  console.log('[dsh-desktop]', ...args);
}

// 与 startDshServer 注入 dsh 子进程的 DSH_HOME 保持一致(测试模式=DSH_TEST_HOME,
// 否则 env DSH_HOME 或默认 ~/.dsh —— 即 dsh-home-paths resolveDshHome 的语义)。
function profileHome() {
  if (process.env.DSH_TEST_MODE === '1') return process.env.DSH_TEST_HOME || '';
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
}

function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(
        { host: HOST, port: PORT, path: '/', timeout: 2000 },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on('error', () => {
        if (Date.now() > deadline) {
          reject(new Error(`dsh web 服务未在 ${timeoutMs}ms 内就绪 (http://${HOST}:${PORT})`));
        } else {
          setTimeout(attempt, 1000);
        }
      });
      req.on('timeout', () => req.destroy());
    };
    attempt();
  });
}

function startDshServer() {
  log(`启动 dsh web 服务 (DSH_ROOT=${DSH_ROOT}, NODE=${NODE_EXE})...`);

  // dsh CLI: 生产用编译产物 lib/bin.js(需先 pnpm run build)。
  // --no-open 阻止 dsh 打开系统默认浏览器(桌面壳自己在窗口内加载)。
  const cliBin = path.join(DSH_ROOT, 'apps', 'cli', 'lib', 'bin.js');
  const useTsx = !fs.existsSync(cliBin);
  const args = useTsx
    ? ['--import', 'tsx/esm', path.join(DSH_ROOT, 'apps', 'cli', 'src', 'bin.ts'), '--profile', 'web', '--no-open', '--port', String(PORT)]
    : [cliBin, '--profile', 'web', '--no-open', '--port', String(PORT)];

  dshProcess = spawn(NODE_EXE, args, {
    cwd: DSH_ROOT,
    env: process.env.DSH_TEST_MODE === '1'
      ? { ...process.env, DSH_HOME: String(process.env.DSH_TEST_HOME || '') }
      : { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  dshProcess.stdout.on('data', (d) => process.stdout.write(`[dsh] ${d}`));
  dshProcess.stderr.on('data', (d) => process.stderr.write(`[dsh] ${d}`));

  dshProcess.on('exit', (code) => {
    log(`dsh 服务退出, code=${code}`);
    // 仅当「非用户主动关闭」且「服务尚未就绪」且「退出码非 0」时才视为启动失败。
    // 用户关闭窗口时 stop() 会设置 processHasShutdown 并 kill 子进程,
    // 子进程以非 0 码退出属正常现象,不应弹错误框。
    if (!processHasShutdown && !serverReady && code !== 0) {
      dialog.showErrorBox(
        'DeepSeek Harness 启动失败',
        `dsh 服务异常退出 (code=${code})。请查看安装日志。`,
      );
    }
    if (!processHasShutdown) app.quit();
  });

  return waitForServer(READY_TIMEOUT_MS);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: 'DeepSeek Harness',
    icon: path.join(__dirname, '../build/icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadURL(`http://${HOST}:${PORT}`);

  // 外部链接用系统浏览器打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const stop = () => {
    processHasShutdown = true; // 用户主动关闭:阻止 exit 回调误判为启动失败
    serverReady = false;
    if (dshProcess && !dshProcess.killed) {
      log('关闭 dsh 服务子进程...');
      dshProcess.kill();
    }
  };

  mainWindow.on('close', stop);
}

let processHasShutdown = false;
// 本地图片读取(给渲染进程的视觉识别桥): sandbox preload 无法使用 fs,走 IPC
const { ipcMain } = require('electron');
// 独立窗口: 跨域 iframe 内的 OAuth 登录(Google)会被浏览器禁止,
// 用与主窗口同 session 的 BrowserWindow 打开, 登录态自动共享。
ipcMain.handle('dsh:open-external-window', (_ev, url) => {
  try {
    const u = String(url || '');
    if (!/^https?:\/\//i.test(u)) return { ok: false };
    const win = new BrowserWindow({ width: 1100, height: 800, autoHideMenuBar: true });
    win.loadURL(u);
    return { ok: true };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
});
const fsp = require('node:fs');
const pathp = require('node:path');
const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'jfif', 'avif', 'ico']);
function isImg(p) { return IMG_EXT.has(pathp.extname(String(p)).slice(1).toLowerCase()); }
ipcMain.handle('dsh:resolve-dropped', (_ev, srcPaths) => {
  try {
    const list = Array.isArray(srcPaths) ? srcPaths : [];
    const paths = [];
    const images = [];
    const found = [];
    const collect = (dir) => {
      let entries;
      try { entries = fsp.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (found.length >= 60) return;
        const p2 = pathp.join(dir, e.name);
        try {
          if (e.isDirectory()) collect(p2);
          else if (e.isFile() && isImg(p2)) {
            const st2 = fsp.statSync(p2);
            if (st2.size <= 15 * 1024 * 1024) found.push(p2);
          }
        } catch { /* skip */ }
      }
    };
    for (const p2 of list) {
      try {
        const st = fsp.statSync(p2);
        if (st.isDirectory()) {
          collect(p2);
          paths.push(p2);
        } else if (st.isFile()) {
          paths.push(p2);
          if (isImg(p2)) found.push(p2);
        }
      } catch { /* skip */ }
    }
    for (const img of found.slice(0, 60)) {
      try {
        const buf = fsp.readFileSync(img);
        images.push({ name: pathp.basename(img), base64: buf.toString('base64'), mime: 'image/' + pathp.extname(img).slice(1).toLowerCase().replace('jpg', 'jpeg') });
      } catch { /* skip */ }
    }
    return { paths, images };
  } catch { return { paths: [], images: [] }; }
});

ipcMain.handle('dsh:read-local-image', (_ev, p) => {
  try {
    const clean = String(p || '').replace(/^["']+|["']+$/g, '').trim();
    if (!isImg(clean)) return null;
    const st = fsp.statSync(clean);
    if (!st.isFile() || st.size > 15 * 1024 * 1024) return null;
    const buf = fsp.readFileSync(clean);
    return { name: pathp.basename(clean), base64: buf.toString('base64'), mime: 'image/' + pathp.extname(clean).slice(1).toLowerCase().replace('jpg', 'jpeg'), bytes: buf.length };
  } catch { return null; }
});

// 调试: DSH_DEBUG=1 时开启 CDP(本机 9333 端口),便于排查渲染进程问题
if (process.env.DSH_DEBUG === '1') {
  try { app.commandLine.appendSwitch('remote-debugging-port', '9333'); } catch {}
}

app.whenReady().then(async () => {
  try {
    ensureLinks();
    // 绿包与安装器对齐: 新用户首次启动初始化插件 profile(幂等, 见 ensure-profile.cjs)
    ensureProfile({
      appRoot: path.resolve(process.resourcesPath, '..'),
      home: profileHome(),
      log,
    });
    await startDshServer();
    serverReady = true;
    createWindow();
  } catch (err) {
    dialog.showErrorBox('DeepSeek Harness 启动失败', String((err && err.message) || err));
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // macOS 以外的平台:窗口全关则退出
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  processHasShutdown = true;
  if (dshProcess && !dshProcess.killed) dshProcess.kill();
});
