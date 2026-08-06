/**
 * Starts Next.js + cloudflared together, syncs NEXT_PUBLIC_APP_URL to the live
 * tunnel URL, then restarts Next once so the env var is picked up.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tunnelUrlPath = join(root, ".tunnel-url");
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function updateEnv(url) {
  const normalized = url.replace(/\/$/, "");
  writeFileSync(tunnelUrlPath, `${normalized}\n`, "utf8");
  console.log(`[dev:tunnel] Wrote .tunnel-url=${normalized}`);
  console.log(
    "[dev:tunnel] Customer QR still uses NEXT_PUBLIC_APP_URL from .env.local when set to staging.",
  );
  return normalized;
}

function waitForPort(port, timeoutMs = 120_000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(`http://127.0.0.1:${port}/`, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for localhost:${port}`));
          return;
        }
        setTimeout(tick, 500);
      });
    };
    tick();
  });
}

function spawnLogged(label, command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: root,
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    ...opts,
  });
  child.stdout.on("data", (chunk) => process.stdout.write(`[${label}] ${chunk}`));
  child.stderr.on("data", (chunk) => process.stderr.write(`[${label}] ${chunk}`));
  return child;
}

function waitForTunnelUrl(onLine, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawnLogged("tunnel", "npx", [
      "--yes",
      "cloudflared",
      "tunnel",
      "--url",
      "http://localhost:3000",
    ]);

    let captured = null;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Timed out waiting for Cloudflare tunnel URL"));
    }, timeoutMs);

    function handle(chunk) {
      const text = chunk.toString();
      onLine?.(text);
      if (captured) return;
      const match = text.match(URL_RE);
      if (match) {
        captured = match[0];
        clearTimeout(timer);
        resolve({ url: captured, child });
      }
    }

    child.stdout.on("data", handle);
    child.stderr.on("data", handle);
    child.on("error", reject);
    child.on("close", (code) => {
      if (!captured) {
        clearTimeout(timer);
        reject(new Error(`cloudflared exited (${code}) before printing a URL`));
      }
    });
  });
}

async function main() {
  let next = spawnLogged("next", "npm", ["run", "dev:host"]);
  let shuttingDown = false;

  const shutdown = () => {
    if (shuttingDown) return;
    shuttingDown = true;
    next.kill();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log("[dev:tunnel] Waiting for Next.js on :3000...");
  await waitForPort(3000);

  console.log("[dev:tunnel] Starting Cloudflare tunnel...");
  const { url, child: tunnel } = await waitForTunnelUrl();
  updateEnv(url);

  console.log("[dev:tunnel] Restarting Next.js...");
  next.kill();
  await new Promise((r) => setTimeout(r, 1500));
  next = spawnLogged("next", "npm", ["run", "dev:host"]);
  await waitForPort(3000);

  console.log(`[dev:tunnel] Ready — ${url}`);
  console.log(`[dev:tunnel] Admin settings: ${url}/admin/settings`);

  tunnel.on("close", shutdown);
  next.on("close", (code) => {
    if (!shuttingDown) {
      console.log(`[dev:tunnel] Next.js exited (${code})`);
      shutdown();
    }
  });
}

main().catch((err) => {
  console.error(`[dev:tunnel] ${err.message ?? err}`);
  process.exit(1);
});
