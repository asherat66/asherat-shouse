# Release Checklist (发布清单)

发布新版本时按序执行。

## 0. 版本号

统一改三处版本号：
- `desktop/package.json` (version)
- `desktop/installer/src/installer.ts` 的 `DIST_ARCHIVE` 文件名
- README 中出现的版本引用

## 1. 重新打包（作者机器）

```bash
cd desktop

# 1) 确保绿色版是最新(若改过桌面壳代码,先重建 asar 后再打包 dist/win-unpacked):
#    npm run update:asar   (改过 src/ 时)

# 2) 生成发行包(实体去重 + junction 清单 + profile 导出, 约 8-15 分钟)
node scripts/make-dist.cjs
# 产出: dist/release/dsh-desktop.v<版本>.win-x64.zip

# 3) 编译安装器(改过 installer/src 时)
cd installer && bun build src/installer.ts --compile --outfile ../dist/release/dsh-installer.exe
```

## 2. 自测（发布前必做）

```bash
# 本地起 HTTP 服务模拟下载
cd dist/release && python -m http.server 8123 --bind 127.0.0.1

# 另开终端,装到临时目录(真实 profile 已有包时不会覆盖;首次安装会初始化)
dsh-installer.exe --url http://127.0.0.1:8123/dsh-desktop.v<版本>.win-x64.zip --dir C:/Users/z/Desktop/dstest
```

检查输出:
- [ ] 下载进度条正常
- [ ] `junctions rebuilt (5613 linked, 0 skipped)`（数量随构建浮动,重点是 0 skipped）
- [ ] 启动后 设置→模型 可填 API Key
- [ ] 会话正常对话（不再发生 pwsh 大战）

## 3. GitHub 发布

1. 推送代码: `git push origin main`（先改 `installer.ts` 的 `DIST_OWNER` 为真实账号）
2. GitHub → Releases → **Draft a new release**
   - Tag: `v<版本>`（如 `v0.1.1`）；发行包内 `DIST_TAG` 若用 `latest` 则无需改
   - 上传两个资产:
     - `dsh-installer.exe`
     - `dsh-desktop.v<版本>.win-x64.zip`
3. 将下方 Release Note 模板粘贴进描述

> 注: 656MB 资产 GitHub 直接托管即可;国内网络慢可另传镜像(如 jsdelivr/gh-proxy),安装器 `--url` 参数可指镜像。

## 4. 验证发布

- 新机器(或清除 `~\DeepSeekHarness` 与 `~\.dsh\profiles\web`)后:
  `winget` / 浏览器下载 `dsh-installer.exe` → 双击 → 全流程跑通
- 若使用 `latest` 下载链接,发新版后旧版自动切换到新版

---

# Release Note Template

```markdown
## DeepSeek Harness Desktop <版本>

### 安装

下载 `dsh-installer.exe`,双击运行:自动检测环境 → 下载(带进度条) → 安装 → 启动。
首次使用在 **设置 → 模型** 填写你的 DeepSeek API Key。

> 也可仅下载 `dsh-desktop.v<版本>.win-x64.zip` 手动解压使用(需自行处理目录链接,
> 见项目 README)。

### 内置功能

- 插件市场 / 文件上传(语音转写) / 费用统计 / 图片输入 / MCP 管理
- 设置 → **版本更新**: 一键检查主仓库新版本
- 设置 → **General Rules**: 全局最高优先级规则(编辑后新会话生效)
- 设置旁入口 **prompt copy**: 内嵌 jiro.build 风格 Prompt 库(网页 / PPT 转换)

### 构建与源码

- 源码: https://github.com/<OWNER>/deepseek-harness-desktop
- 上游: https://github.com/deepseek-ai/deepseek-harness (MIT)

### 已知说明

- 安装包需约 4 GB 磁盘空间(解压后约 2 GB + 临时文件)
- API Key 仅存本机 `~\.dsh\.credentials.yaml`,不上传
```
