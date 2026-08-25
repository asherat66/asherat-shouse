'use strict';

// 桌面壳 preload:
// 1) 基础信息(保持最小暴露)
// 2) 拖拽桥: 捕获 drop 的本地路径; 目录递归收集图片; 以 base64 供渲染层构造 File
//    → file-drop/file-upload 借此把图片接入 dsh 原生多模态草稿(视觉模型直接看图)。
// eslint-disable-next-line no-undef
const { contextBridge } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const IMG_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'jfif', 'avif', 'ico']);
const MAX_IMG = 60;          // 目录递归最多收集的图片数(防拖大目录)
const MAX_IMG_BYTES = 15 * 1024 * 1024; // 单图 >15MB 跳过

let dropQueue = [];   // { path }
let imageQueue = [];  // { name, base64, mime }

function isImageFile(p) {
  const ext = path.extname(p).slice(1).toLowerCase();
  return IMG_EXT.has(ext);
}

function collectImages(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (out.length >= MAX_IMG) return;
    const p = path.join(dir, e.name);
    try {
      if (e.isDirectory()) { collectImages(p, out); }
      else if (e.isFile() && isImageFile(p)) {
        const st = fs.statSync(p);
        if (st.size <= MAX_IMG_BYTES) out.push(p);
      }
    } catch { /* skip */ }
  }
}

function resolveDropped(srcPaths) {
  const paths = [];
  const images = [];
  for (const p of srcPaths) {
    if (!p || typeof p !== 'string') continue;
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        const found = [];
        collectImages(p, found);
        images.push(...found);
        paths.push(p); // 目录本身也保留(引用用)
      } else if (st.isFile()) {
        paths.push(p);
        if (isImageFile(p)) images.push(p);
      }
    } catch { /* 路径失效跳过 */ }
  }
  const payloads = [];
  for (const img of images.slice(0, MAX_IMG)) {
    try {
      const buf = fs.readFileSync(img);
      const mime = 'image/' + path.extname(img).slice(1).toLowerCase().replace('jpg', 'jpeg');
      payloads.push({ name: path.basename(img), base64: buf.toString('base64'), mime });
    } catch { /* skip unreadable */ }
  }
  return { paths, images: payloads };
}

// drop 事件捕获(仅 Electron 内): File 对象带 path
try {
  window.addEventListener('drop', (e) => {
    try {
      const files = (e.dataTransfer && e.dataTransfer.files) || [];
      const srcPaths = [];
      for (const f of files) {
        const p = f && (f.path || f.webkitRelativePath);
        if (p) srcPaths.push(p);
      }
      // Electron 新版本 path 在 File.path 已移除; 用 webUtils? 退化为空(渲染层 DataTransfer 有 File 时走原生)
      if (srcPaths.length > 0) {
        const r = resolveDropped(srcPaths);
        dropQueue = r.paths;
        imageQueue = r.images;
      }
    } catch { /* ignore */ }
  }, true);
} catch { /* non-electron? 忽略 */ }

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
});
