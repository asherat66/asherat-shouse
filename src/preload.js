'use strict';

// 桌面壳的 preload:默认保持最小暴露面,不向渲染进程注入 Node 能力。
// dsh 的 Web UI 通过普通 HTTP 运行,无需 Electron 桥接;预留 contextBridge 扩展点。
// eslint-disable-next-line no-undef
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
});
