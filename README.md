# DeepSeek Harness Desktop

## 📦 简体中文安装说明（Windows）

> DeepSeek Harness 桌面版：Electron 封装的 dsh Web UI，**无需安装 Node.js**（已内置独立运行时）。

### 系统要求

| 项目 | 要求 |
|---|---|
| 系统 | Windows 10 / 11（64 位） |
| 磁盘 | 至少 4 GB 可用空间（安装后约 2 GB） |
| 网络 | 首次下载发行包约 650 MB；需要能访问 GitHub（国内慢可挂代理/镜像） |

### 方式一：一键安装器（推荐）

1. 下载 **`dsh-installer.exe`**（来自 GitHub Releases 页面的资产）
2. **双击运行**，安装器自动完成：
   - 环境检测（Windows x64 / 磁盘空间）
   - 下载发行包（**带进度条**：百分比 + 已下载量）
   - 解压 + 重建目录链接（约 3 分钟）
   - 初始化配置文件（自带全部插件与规则）
   - 自动启动 DeepSeek Harness
3. 首次使用：打开 **设置 → 模型**，填写你的 **DeepSeek API Key**（仅保存在本机 `~\.dsh\.credentials.yaml`）
4. 完成，开始使用

> 自定义安装目录：`dsh-installer.exe --dir D:\DeepSeekHarness`
> 自定义下载源（如镜像）：`dsh-installer.exe --url https://镜像地址/...zip`

### 方式二：绿色免安装包

1. 下载 **`dsh-desktop.v<版本>.win-x64.zip`**
2. 解压到任意目录（**解压时用系统"全部解压"或 tar，不要用会丢符号链接的工具**）
3. 若解压后**移动过目录**，运行一次目录修复：`node scripts/relink.cjs <目录路径>`（需要 Node.js，仅此一步需要；不移动则免）
4. 双击 `DeepSeek Harness.exe` 启动 → 设置 → 模型 → 填 API Key

### 方式三：从源码构建（开发者）

**前置**：Windows x64、Node.js 22+、pnpm 11+、git、Python 3（可选，仅生成图标）

```bash
# 1. 克隆本仓库与 dsh 主仓库（相邻目录）
git clone <本仓库地址> desktop
git clone https://github.com/deepseek-ai/deepseek-harness dsh

# 2. 构建 dsh（v0.1.7 起官方已原生注入 ~/.dsh/AGENTS.md，无需补丁）
cd dsh && pnpm install --frozen-lockfile && pnpm run build && cd ..

# 2.5 dsh-raw-html 前端渲染补丁（VCP 卡片 HTML 渲染能力；幂等，可重复运行）
#     必须打在 dsh 源码树的 dist（assemble 会把它复制进绿色包）
node desktop/plugins/dsh-raw-html/patch/install-all.cjs "$(ls dsh/apps/web/dist/assets/index-*.js | head -1)"
#     自动探测失败时手动指定 bundle 路径：
#     node desktop/plugins/dsh-raw-html/patch/install-all.cjs "dsh/apps/web/dist/assets/index-D-eoFxDP.js"

# 3. 桌面端依赖 + 组装资源（拷贝 dsh 代码库 + 独立 Node 运行时）
cd desktop
npm install
DSH_SRC=../dsh node scripts/assemble-resources.cjs

# 4. 一键安装内置插件 + 初始化规则（设置页/版本更新/prompt copy/autofix/raw-html）
node scripts/install-plugins.cjs

# 5. 运行（开发）或打包
npm start                    # 开发模式
npm run pack:dir             # 生成绿色版 dist/win-unpacked
node scripts/make-dist.cjs   # （可选）生成可分发的发行 zip（约 8-15 分钟）
```

### 首次使用

1. 打开应用 → **设置 → 模型** → 填写 DeepSeek API Key（DeepSeek 开放平台申请）
2. 推荐体验：
   - **设置 → 版本更新**：一键检查 dsh 主仓库新版本
   - **设置 → General Rules**：全局最高优先级规则（改"老大"称呼、回复风格等；保存后下一条消息即生效）
   - **输入框旁 prompt copy**：嵌入 jiro.build 风格 Prompt 库（做网页 / 做 PPT 自动转换）

### 常见问题

| 问题 | 解决 |
|---|---|
| 提示"启动失败" | 检查端口 3080 是否被占用；看 `app_stdout.log` |
| 杀毒软件拦截 | 允许运行（应用未签名） |
| 下载慢 | 用 `--url` 指向国内镜像，或代理后重试 |
| 更新第三方插件后功能失效 | **无需处理**：每次启动 `dsh-autofix` 自动重打全部补丁 |
| 发图片模型不识别 | 确认输入框出现图片缩略卡；仍不行看 General Rules 是否误改成禁用视觉 |

### 许可证

MIT（本项目）+ MIT（上游 [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness)）。

---

Electron desktop wrapper for the DeepSeek Harness (dsh) Web UI.

## Features

- Launches the built-in dsh web server (http://127.0.0.1:3080) and loads it in an Electron window
- Bundles an independent Node runtime - no system Node required
- Works on Windows x64

Bundled plugins give the desktop build these extras on top of stock dsh:

- **Vision everywhere** — paste an image, drop a file/folder of images, send a
  local path or an image URL: the vision model sees the actual image (native
  multimodal drafts, preload IPC bridge, from-url proxy)
- **Settings → Version updates** — one-click check against the dsh main repo
- **Settings → General Rules** — global highest-precedence rules injected into
  every session's system prompt at the LLM adapter level; edits apply to the
  next message immediately
- **Settings → prompt copy** — embedded jiro.build style-prompt library with
  Web / PPT modes (web prompts auto-adapted to PPT design prompts); login via a
  separate window (iframe OAuth is blocked by browsers)
- **dsh-autofix** — on every boot, idempotently re-applies the local patches
  (file-drop/file-upload vision fixes, adapter rules injection, image-input
  URL/path/clipboard handling) after third-party plugin updates

## Build from source

### Prerequisites

- Windows 10/11 x64
- Node.js 22+ (https://nodejs.org)
- pnpm 11+ (https://pnpm.io)
- Python 3 + Pillow (only to regenerate the icon)

### Steps

```bash
# 1. Clone this repo and the dsh main repo side by side
git clone <this-repo> desktop
git clone https://github.com/deepseek-ai/dsh

# 2. Build the dsh CLI (web profile) inside the main repo
cd dsh
pnpm install
pnpm run build
cd ..

# 3. Install desktop deps
cd desktop
npm install

# 4. Assemble resources (copies dsh + Node runtime into resources/)
npm run assemble

# 5. Run in dev mode, or package
npm start
npm run pack        # NSIS installer
npm run pack:dir    # unpacked directory
```

If the dsh repo is not a sibling of this repo, set `DSH_SRC` before assembling:

```bash
DSH_SRC=C:/path/to/dsh npm run assemble
```

## Install on another machine (plugins + rules)

After the build above, run the one-click installer **from the desktop repo** to
add the bundled plugins (update-checker, general-rules, prompt-copy) into the
dsh web profile and initialize the General Rules file:

```bash
cd desktop
node scripts/install-plugins.cjs
```

What it does:
1. `pnpm add` every plugin under `plugins/` into `~/.dsh/profiles/web` (portable `file:` references)
2. Appends the plugins to the profile's `dsh.profile.bundles`
3. Seeds `~/.dsh/AGENTS.md` from the bundled General Rules template (never overwrites existing)
4. Prints optional third-party plugin commands

Third-party plugins (market, file upload, cost meter, image input, ...) are
installed through the plugin market or the dsh CLI:

```bash
dsh plugin --profile web add dshmarket
dsh plugin --profile web add dsh-file-upload
dsh plugin --profile web add dsh-cost-meter
dsh plugin --profile web add dsh-plugin-image-input
dsh plugin --profile web add @opendsh/dsh-plugin-setting-mcp
```

Restart the app (or refresh the page) after installing. Rules are editable in
**Settings → General Rules**; "Version updates" is in **Settings → Version updates**.

### Moving a built app folder

The packaged `dist/win-unpacked` tree uses Windows junctions (pnpm workspace
layout) whose targets are absolute to the build location. To move or copy the
folder, repair the links once at the new location:

```bash
node scripts/relink.cjs <path-to-win-unpacked>
```

## 更新日志

### v0.1.4 (2026-08-26)
- **修复**: 用 WinRAR/其他解压工具解压 zip 后直接双击报 `dsh 服务异常退出 (code=1)` —— 桌面壳现在启动时**自动重建 junction 链接**(auto-relink),解压/移动目录后均可直接使用
- **改进**: 安装器下载进度条改为**时间驱动刷新 + 实时速率 + ETA**(低速下不会看起来卡死),自动超时切换**国内镜像源**(gh-proxy/ghfast), 检测到系统代理时镜像优先
- 覆盖: 安装器流程 / 手动解压流程均已复现验证

### v0.1.2 (2026-08-26)
- **修复**: 安装器对 ZIP64 发行包(条目数 >65535)解压不完整的问题；现在可完整解压全部 9.2 万条目
- **修复**: `dsh-autofix` 在 `DSH_HOME` 布局下定位插件目录不正确的问题
- **新增**: 桌面壳支持 `DSH_PORT` 环境变量(多实例/端口隔离)，并透传 `--port` 给内置 dsh web

### v0.1.1 (2026-08-26)
- 首个开源发布: 绿色版 zip + bun 编译安装器(下载→解压→junction 重建→初始化→启动)

## CI release (GitHub Actions)

Push a tag to build and publish automatically:

```bash
git tag v0.1.2 && git push origin v0.1.2
```

`.github/workflows/release.yml` (windows-latest) then runs: clone + build the
dsh main repo → npm install → assemble resources → electron-builder dir package
→ `make-dist.cjs` → compile the Bun installer → create a GitHub Release with
both assets (installer + dist zip). Manual runs via the Actions tab are also
supported (`workflow_dispatch`).

First CI run takes ~30-40 min (mostly the dsh repo build); later runs benefit
from the runner package cache.

## Release (publishing the installer)

See [RELEASE.md](RELEASE.md) for the full checklist. Short version:

1. `node scripts/make-dist.cjs` → produces `dist/release/dsh-desktop.v<ver>.win-x64.zip`
2. `cd installer && bun build src/installer.ts --compile` → `dsh-installer.exe`
3. Upload both to a GitHub Release; users just run the exe.

## General Rules mechanism

The global rules file (`~/.dsh/AGENTS.md`) is injected into every session's
system prompt at the LLM adapter level (see [docs/GENERAL-RULES.md](docs/GENERAL-RULES.md)).
This requires an idempotent patch on the dsh main repo
(`node scripts/patch-dsh-llm.cjs <dsh-repo>` before building) — CI applies it
automatically. Don't drop it on rebuilds.

## Icon

The app icon can be regenerated from any image:

```bash
python scripts/make_icon.py <path-to-image>
```

This writes multi-resolution `build/icon.ico` and `build/icon.png`.
**Note**: only use images you have the rights to distribute.

## License

MIT - see [LICENSE](LICENSE). The bundled dsh project is MIT, Copyright (c) 2026 DeepSeek.
