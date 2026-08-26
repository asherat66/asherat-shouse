// dsh-installer — single-file installer (Windows x64)
// usage: dsh-installer.exe [--url <dist-url>] [--dir <install-dir>] [--silent]
// flow: check -> download(progress) -> unzip -> relink -> init profile -> launch
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, createWriteStream, statSync, symlinkSync, readlinkSync, readdirSync } from "node:fs";
import { join, resolve, dirname, sep, isAbsolute } from "node:path";
import { homedir, platform, arch } from "node:os";

const INSTALL_HOME = process.env.DSH_INSTALL_HOME || homedir();
import { spawn, execSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";

// ═══ 发布配置（发布前只需改这里）═══
// GitHub 仓库:  https://github.com/<OWNER>/deepseek-harness-desktop
// 发行资产名:   dsh-desktop.v<版本>.win-x64.zip   (由 scripts/make-dist.cjs 生成)
const DIST_OWNER = "asherat66";              // GitHub 账号
const DIST_REPO = "asherat-shouse";          // 发布仓库(与 GitHub 仓库名一致)
const DIST_TAG = "v0.1.3";                   // 发布 tag(发新版时与 DIST_ARCHIVE 同步更新)
const DIST_ARCHIVE = "dsh-desktop.v0.1.3.win-x64.zip";
// 优先级: --url 参数 > 环境变量 DSH_DIST_URL > 上方配置拼出的 GitHub 地址
const DEFAULT_URL =
  "https://github.com/" + DIST_OWNER + "/" + DIST_REPO + "/releases/download/" +
  DIST_TAG + "/" + DIST_ARCHIVE;

function log(msg: string): void { console.log(msg); }
function fatal(msg: string): never { console.error("\n[ERROR] " + msg); process.exit(1); }

function args(): Record<string, string> {
  const a: Record<string, string> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const k = process.argv[i];
    if (k.startsWith("--")) {
      const key = k.slice(2);
      const v = process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : "true";
      a[key] = v;
      if (v !== "true") i++;
    }
  }
  return a;
}

function human(n: number): string {
  if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toFixed(2) + " GB";
  if (n >= 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + " MB";
  return Math.round(n / 1024) + " KB";
}

// 1. environment check
function check(): void {
  console.log("DeepSeek Harness Installer");
  console.log("--------------------------");
  if (platform() !== "win32" || arch() !== "x64") fatal("Windows x64 only");
  let freeBytes = 0;
  try {
    const out = execSync('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace /value', { encoding: "utf8" });
    freeBytes = Number(/FreeSpace=(\d+)/.exec(out)?.[1] || "0");
  } catch {}
  const need = 4 * 1024 * 1024 * 1024;
  if (freeBytes < need) fatal("Not enough disk space: at least 4 GB free required (C: has " + human(freeBytes) + ")");
  console.log("OK  environment OK (Windows x64, C: free " + human(freeBytes) + ")");
}

// 2. download with progress bar — 带断点续传 + 自动重试(网络抖动不中断安装)
const DL_RETRIES = 3;
async function download(url: string, dest: string): Promise<void> {
  for (let attempt = 1; attempt <= DL_RETRIES; attempt++) {
    try {
      console.log("\nDownloading dist package:\n  " + url + (attempt > 1 ? `  (attempt ${attempt}/${DL_RETRIES})` : ""));
      const existing = existsSync(dest) ? statSync(dest).size : 0;
      const headers: Record<string, string> = {};
      if (existing > 0) headers["Range"] = "bytes=" + existing + "-";
      const res = await fetch(url, { redirect: "follow", headers });
      if (!res.ok || !res.body) throw new Error("HTTP " + res.status + " " + res.statusText);
      const total = Number(res.headers.get("content-length") || "0") + (res.status === 206 ? existing : 0);
      const out = createWriteStream(dest, { flags: existing > 0 ? "a" : "w" });
      const reader = (res.body as ReadableStream<Uint8Array>).getReader();
      let done = existing;
      const bar = (force = false): void => {
        const pct = total > 0 ? ((done / total) * 100).toFixed(1) : "?";
        const filled = Math.min(30, Math.floor((done / Math.max(1, total)) * 30));
        const line = "  [" + "=".repeat(filled).padEnd(30, " ") + "] " + pct + "%  " + human(done) + "/" + (total ? human(total) : "?");
        process.stdout.write("\r" + line.padEnd(70));
        if (force) process.stdout.write("\n");
      };
      while (true) {
        const { done: d, value } = await reader.read();
        if (d) break;
        if (value && value.length) { done += value.length; out.write(Buffer.from(value)); bar(); }
      }
      out.end();
      await new Promise<void>((r) => out.on("finish", () => r()));
      console.log("OK  downloaded " + human(done));
      return;
    } catch (e) {
      console.log("\n  download error: " + ((e as Error).message || e));
      if (attempt === DL_RETRIES) {
        fatal(
          "Download failed after " + DL_RETRIES + " attempts: " + ((e as Error).message || e) +
          "\n  排查建议:" +
          "\n  1) 网络不佳时用国内镜像: dsh-installer.exe --url <镜像URL>/dsh-desktop.v<版本>.win-x64.zip" +
          "\n  2) 挂代理后重试(安装器不读系统代理,可在终端设置 HTTPS_PROXY 环境变量)" +
          "\n  3) 断点续传已内置: 再次运行会从已下载部分继续"
        );
      }
      console.log("  retrying in " + (3 * attempt) + "s...");
      await new Promise<void>((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

// 3. minimal zip extraction (deflate/store) — no external deps
function unzip(zipPath: string, dest: string): void {
  const buf = readFileSync(zipPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) fatal("Invalid zip file");
  let count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  // ZIP64 支持: 条目数/偏移达 0xFFFF/0xFFFFFFFF 时, 真实值在 ZIP64 EOCD 中。
  // EOCD 后紧跟 ZIP64 EOCD locator(20 字节, 0x07064b50), 其 +8 为 ZIP64 EOCD 偏移。
  if (count === 0xffff || off === 0xffffffff) {
    const lo = eocd - 20;
    if (lo >= 0 && buf.readUInt32LE(lo) === 0x07064b50) {
      const z64 = Number(buf.readBigUInt64LE(lo + 8));
      if (z64 > 0 && z64 < buf.length && buf.readUInt32LE(z64) === 0x06064b50) {
        count = Number(buf.readBigUInt64LE(z64 + 32));      // 总条目数
        off = Number(buf.readBigUInt64LE(z64 + 48));        // 中央目录起始偏移
      }
    }
  }
  const entries: { name: string; offset: number; method: number; csize: number }[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) fatal("Central directory corrupted @" + off);
    const method = buf.readUInt16LE(off + 10);
    const csize = buf.readUInt32LE(off + 20);
    const nlen = buf.readUInt16LE(off + 28);
    const elen = buf.readUInt16LE(off + 30);
    const clen = buf.readUInt16LE(off + 32);
    const lho = buf.readUInt32LE(off + 42);
    const name = buf.subarray(off + 46, off + 46 + nlen).toString("utf8");
    const lnameLen = buf.readUInt16LE(lho + 26);
    const lextraLen = buf.readUInt16LE(lho + 28);
    const dataStart = lho + 30 + lnameLen + lextraLen;
    entries.push({ name, offset: dataStart, method, csize });
    off += 46 + nlen + elen + clen;
  }
  console.log("\nExtracting... (" + entries.length + " entries)");
  let n = 0;
  for (const e of entries) {
    const target = resolve(dest, e.name.split("/").join(sep));
    if (e.name.endsWith("/")) { mkdirSync(target, { recursive: true }); continue; }
    mkdirSync(dirname(target), { recursive: true });
    const raw = buf.subarray(e.offset, e.offset + e.csize);
    const data = e.method === 8 ? inflateRawSync(raw) : raw;
    writeFileSync(target, data);
    n++;
    if (n % 2000 === 0) process.stdout.write("\r  extracted " + n + " entries".padEnd(30));
  }
  console.log("\r  extracted " + n + " entries");
}

// 4. rebuild junctions from manifest
function relink(dest: string): void {
  const manifestPath = join(dest, "manifest.links.json");
  if (!existsSync(manifestPath)) { console.log("(no link manifest, skip relink)"); return; }
  let manifest: { path: string; target: string }[] = [];
  try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { manifest = []; }
  let ok = 0, skip = 0;
  for (const l of manifest) {
    const p = join(dest, l.path.split("/").join(sep));
    if (existsSync(p)) { skip++; continue; }
    let target = l.target;
    if (isAbsolute(target)) {
      const tNorm = target.replace(/\\/g, "/").toLowerCase();
      if (tNorm.includes("win-unpacked/") || tNorm.includes("win-unpacked\\")) {
        const idx = Math.max(tNorm.lastIndexOf("win-unpacked/"), tNorm.lastIndexOf("win-unpacked\\"));
        const relPart = target.slice(idx + "win-unpacked".length + 1);
        target = join(dest, relPart.split("/").join(sep));
      }
    }
    try {
      mkdirSync(dirname(p), { recursive: true });
      symlinkSync(target, p, "junction");
      ok++;
    } catch (e) { skip++; }
  }
  console.log("OK  junctions rebuilt (" + ok + " linked, " + skip + " skipped)");
}

// 5. init profile (first run) + launch
function initProfile(appDir: string): void {
  const home = INSTALL_HOME;
  const profDir = join(home, ".dsh", "profiles", "web");
  const shippedProfile = join(appDir, ".install", "profile");
  if (existsSync(shippedProfile) && !existsSync(join(profDir, "package.json"))) {
    console.log("Initializing configuration (plugins/rules)...");
    mkdirSync(profDir, { recursive: true });
    copyDir(shippedProfile, profDir);
    const agents = join(appDir, ".install", "AGENTS.md");
    if (existsSync(agents) && !existsSync(join(home, ".dsh", "AGENTS.md"))) {
      mkdirSync(join(home, ".dsh"), { recursive: true });
      writeFileSync(join(home, ".dsh", "AGENTS.md"), readFileSync(agents));
    }
    console.log("OK  configuration initialized");
  } else {
    console.log("(profile already exists or no shipped profile, skipped init)");
  }
}

function launchApp(appDir: string): void {
  const exe = join(appDir, "DeepSeek Harness.exe");
  if (!existsSync(exe)) fatal("App not found: " + exe);
  console.log("");
  console.log("Launching DeepSeek Harness...");
  const child = spawn(exe, [], { cwd: appDir, detached: true, stdio: "ignore" });
  child.unref();
  console.log("OK  launched (window takes a few seconds to load)");
  console.log("First use: open Settings -> Models, enter your DeepSeek API Key.");
}

function copyDir(src: string, dest: string): void {
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) { mkdirSync(d, { recursive: true }); copyDir(s, d); }
    else if (entry.isFile()) writeFileSync(d, readFileSync(s));
    else if (entry.isSymbolicLink()) { try { symlinkSync(readlinkSync(s), d, "junction"); } catch {} }
  }
}

async function main(): Promise<void> {
  const a = args();
  check();
  const noLaunch = a['no-launch'] === 'true';
  const url = a.url || DEFAULT_URL;
  const targetDir = resolve(a.dir || join(homedir(), "DeepSeekHarness"));
  mkdirSync(targetDir, { recursive: true });
  const tmpZip = join(targetDir, ".dist.zip");
  await download(url, tmpZip);
  unzip(tmpZip, targetDir);
  rmSync(tmpZip, { force: true });
  // 防御性清理: 发行包可能带入作者机器上的运行日志(Electron 每次启动会在 exe 目录
  // 重新生成这两个文件, 打包残留件无任何功能作用, 只泄露构建机信息)
  rmSync(join(targetDir, "app_stdout.log"), { force: true });
  rmSync(join(targetDir, "app_stderr.log"), { force: true });
  relink(targetDir);
  initProfile(targetDir);
  if (noLaunch) {
    console.log("OK  installed (--no-launch: skipped app launch)");
    console.log("App dir: " + targetDir);
    console.log("Profile home: " + INSTALL_HOME);
    return;
  }
  launchApp(targetDir);
}

main().catch((e) => fatal(String((e && (e as Error).message) || e)));