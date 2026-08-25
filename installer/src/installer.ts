// dsh-installer — single-file installer (Windows x64)
// usage: dsh-installer.exe [--url <dist-url>] [--dir <install-dir>] [--silent]
// flow: check -> download(progress) -> unzip -> relink -> init profile -> launch
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, createWriteStream, symlinkSync, readlinkSync, readdirSync } from "node:fs";
import { join, resolve, dirname, sep, isAbsolute } from "node:path";
import { homedir, platform, arch } from "node:os";
import { spawn, execSync } from "node:child_process";
import { inflateRawSync } from "node:zlib";

// ═══ 发布配置（发布前只需改这里）═══
// GitHub 仓库:  https://github.com/<OWNER>/deepseek-harness-desktop
// 发行资产名:   dsh-desktop.v<版本>.win-x64.zip   (由 scripts/make-dist.cjs 生成)
const DIST_OWNER = "<OWNER>";              // ← 发布前改为真实 GitHub 账号
const DIST_REPO = "deepseek-harness-desktop";
const DIST_TAG = "latest";                 // 或固定版本 tag: v0.1.1
const DIST_ARCHIVE = "dsh-desktop.v0.1.1.win-x64.zip";
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

// 2. download with progress bar
async function download(url: string, dest: string): Promise<void> {
  console.log("\nDownloading dist package:\n  " + url);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) fatal("Download failed: HTTP " + res.status + " " + res.statusText);
  const total = Number(res.headers.get("content-length") || "0");
  const out = createWriteStream(dest);
  const reader = (res.body as ReadableStream<Uint8Array>).getReader();
  let done = 0;
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
}

// 3. minimal zip extraction (deflate/store) — no external deps
function unzip(zipPath: string, dest: string): void {
  const buf = readFileSync(zipPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65536); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) fatal("Invalid zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
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
function initAndLaunch(appDir: string): void {
  const home = homedir();
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
  }
  const exe = join(appDir, "DeepSeek Harness.exe");
  if (!existsSync(exe)) fatal("App not found: " + exe);
  console.log("\nLaunching DeepSeek Harness...");
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
  const url = a.url || DEFAULT_URL;
  const targetDir = resolve(a.dir || join(homedir(), "DeepSeekHarness"));
  mkdirSync(targetDir, { recursive: true });
  const tmpZip = join(targetDir, ".dist.zip");
  await download(url, tmpZip);
  unzip(tmpZip, targetDir);
  rmSync(tmpZip, { force: true });
  relink(targetDir);
  initAndLaunch(targetDir);
}

main().catch((e) => fatal(String((e && (e as Error).message) || e)));