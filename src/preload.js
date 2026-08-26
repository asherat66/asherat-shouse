'use strict';

// 桌面壳 preload (sandbox 模式):
// - 不能 require node:fs —— 文件读取全部走 IPC (main 进程)
// - 拖拽路径用 webUtils.getPathForFile (Electron 34 官方 API)
// - 暴露 window.dshDesktop: drainDroppedPaths / drainDroppedImages / readLocalImage
// eslint-disable-next-line no-undef
const { contextBridge, ipcRenderer, webUtils } = require('electron');

let dropQueue = [];   // 原始路径(文本引用用)
let imageQueue = [];  // { name, base64, mime } 由 main 解析

// drop 捕获: File → 路径 → IPC 解析(目录递归/读图)
try {
  window.addEventListener('drop', async (e) => {
    try {
      const files = (e.dataTransfer && e.dataTransfer.files) || [];
      const srcPaths = [];
      for (const f of files) {
        try {
          const p = webUtils.getPathForFile(f);
          if (p) srcPaths.push(p);
        } catch { /* ignore */ }
      }
      if (srcPaths.length > 0) {
        const r = await ipcRenderer.invoke('dsh:resolve-dropped', srcPaths);
        if (r) { dropQueue = r.paths || []; imageQueue = r.images || []; }
      }
    } catch { /* ignore */ }
  }, true);
} catch { /* non-electron? ignore */ }

contextBridge.exposeInMainWorld('dshDesktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  // file-drop 契约: 取走最近一次拖入的原始路径
  drainDroppedPaths() {
    const r = dropQueue; dropQueue = []; return r;
  },
  // 扩展: 取走解析出的图片(base64 数据, 渲染层可构造 File)
  drainDroppedImages() {
    const r = imageQueue; imageQueue = []; return r;
  },
  // 扩展: 按本地路径读取图片为 base64(发送前路径文本识别) — 经 IPC
  readLocalImage(p) {
    // IPC invoke 是异步,但调用方已按 Promise 处理(拦截流程 async)
    return ipcRenderer.invoke('dsh:read-local-image', String(p || ''));
  },
  // 独立窗口打开外部站点(iframe 内 OAuth 登录受限时使用; 同 session 共享登录态)
  openExternalWindow(url) {
    return ipcRenderer.invoke('dsh:open-external-window', String(url || ''));
  },
});
