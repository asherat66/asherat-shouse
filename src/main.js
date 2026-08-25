'use strict';

const { app, BrowserWindow, shell, dialog } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

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

const PORT = 3080;
const HOST = '127.0.0.1';
const READY_TIMEOUT_MS = 120000;

let mainWindow = null;
let dshProcess = null;
let serverReady = false;

function log(...args) {
  console.log('[dsh-desktop]', ...args);
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
    ? ['--import', 'tsx/esm', path.join(DSH_ROOT, 'apps', 'cli', 'src', 'bin.ts'), '--profile', 'web', '--no-open']
    : [cliBin, '--profile', 'web', '--no-open'];

  dshProcess = spawn(NODE_EXE, args, {
    cwd: DSH_ROOT,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  dshProcess.stdout.on('data', (d) => process.stdout.write(`[dsh] ${d}`));
  dshProcess.stderr.on('data', (d) => process.stderr.write(`[dsh] ${d}`));

  dshProcess.on('exit', (code) => {
    log(`dsh 服务退出, code=${code}`);
    if (!serverReady && code !== 0) {
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
    serverReady = false;
    if (dshProcess && !dshProcess.killed) {
      log('关闭 dsh 服务子进程...');
      dshProcess.kill();
    }
  };

  mainWindow.on('close', stop);
}

let processHasShutdown = false;
app.whenReady().then(async () => {
  try {
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
