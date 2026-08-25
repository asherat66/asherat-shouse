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

## Icon

The app icon can be regenerated from any image:

```bash
python scripts/make_icon.py <path-to-image>
```

This writes multi-resolution `build/icon.ico` and `build/icon.png`.
**Note**: only use images you have the rights to distribute.

## License

MIT - see [LICENSE](LICENSE). The bundled dsh project is MIT, Copyright (c) 2026 DeepSeek.
