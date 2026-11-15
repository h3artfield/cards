import { createHash } from "node:crypto";
import { createWriteStream, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export const SNAPSHOT_DAY = process.env.DR_SNAPSHOT_DATE ?? "2026-09-25";
export const UA = "CardsDeckRatingSnapshot/1.0 (personal research; local dated hashes)";

export function repoWebRoot(): string {
  const cwd = process.cwd();
  if (existsSync(resolve(cwd, "scripts/deck-rating"))) return cwd;
  if (existsSync(resolve(cwd, "web/scripts/deck-rating"))) return resolve(cwd, "web");
  return cwd;
}

export function newestMatching(dir: string, re: RegExp): string | null {
  if (!existsSync(dir)) return null;
  const hits = require("node:fs")
    .readdirSync(dir)
    .filter((name: string) => re.test(name))
    .map((name: string) => resolve(dir, name))
    .sort();
  return hits.at(-1) ?? null;
}

export function snapshotRoot(): string {
  return resolve(repoWebRoot(), "data/milestones/deck-rating/v1/snapshots", SNAPSHOT_DAY);
}

export function incomingRoot(): string {
  return resolve(repoWebRoot(), "data/milestones/deck-rating/v1/snapshots/_incoming");
}

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}

export function sha256File(path: string): string {
  const hash = createHash("sha256");
  hash.update(readFileSync(path));
  return hash.digest("hex");
}

export function sha256Bytes(buf: Buffer | string): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function writeJson(path: string, value: unknown): void {
  ensureDir(dirname(path));
  writeFileSyncAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeFileSyncAtomic(path: string, text: string): void {
  ensureDir(dirname(path));
  require("node:fs").writeFileSync(path, text);
}

export async function writeJsonAsync(path: string, value: unknown): Promise<void> {
  ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

export async function fetchText(url: string, args?: { accept?: string; timeoutMs?: number }): Promise<{
  status: number;
  text: string;
  finalUrl: string;
}> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: args?.accept ?? "*/*",
    },
    signal: AbortSignal.timeout(args?.timeoutMs ?? 60_000),
    redirect: "follow",
  });
  return { status: res.status, text: await res.text(), finalUrl: res.url };
}

export async function fetchJson<T>(
  url: string,
  args?: { retries?: number },
): Promise<{ status: number; json: T | null; text: string }> {
  const retries = args?.retries ?? 4;
  let last: { status: number; json: T | null; text: string } = { status: 0, json: null, text: "" };
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(60_000),
      redirect: "follow",
    });
    const text = await res.text();
    let json: T | null = null;
    try {
      json = JSON.parse(text) as T;
    } catch {
      json = null;
    }
    last = { status: res.status, json, text };
    if (res.status !== 429 && res.status < 500) return last;
    await sleep(1_000 * 2 ** attempt);
  }
  return last;
}

export async function downloadFile(url: string, dest: string): Promise<{ bytes: number; sha256: string }> {
  ensureDir(dirname(dest));
  if (process.platform === "win32") {
    await curlDownload(url, dest);
  } else {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`download failed ${res.status} ${url}`);
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(dest));
  }
  return { bytes: statSync(dest).size, sha256: sha256File(dest) };
}

function curlDownload(url: string, dest: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      "curl.exe",
      ["-L", "-C", "-", "--retry", "5", "--retry-delay", "3", "-A", UA, "-o", dest, url],
      { stdio: "inherit" },
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`curl exited ${code} for ${url}`));
    });
  });
}

export function fileMeta(path: string): { path: string; bytes: number; sha256: string } {
  return { path, bytes: statSync(path).size, sha256: sha256File(path) };
}

export function decodeHtml(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

export function jsonLdBlocks(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      out.push(JSON.parse(m[1] ?? ""));
    } catch {
      /* skip broken blocks */
    }
  }
  return out;
}
