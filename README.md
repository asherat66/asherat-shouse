# DeepSeek Harness Desktop

Electron desktop wrapper for the DeepSeek Harness (dsh) Web UI.

## Features

- Launches the built-in dsh web server (http://127.0.0.1:3080) and loads it in an Electron window
- Bundles an independent Node runtime - no system Node required
- Works on Windows x64

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
