/**
 * Starts cloudflared briefly, captures the trycloudflare.com URL, and writes
 * NEXT_PUBLIC_APP_URL to .env.local. Requires dev server on localhost:3000.
 */
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const tunnelUrlPath = join(root, ".tunnel-url");
const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

function updateEnv(url) {
  const normalized = url.replace(/\/$/, "");
  writeFileSync(tunnelUrlPath, `${normalized}\n`, "utf8");
  console.log(`Updated .tunnel-url → ${normalized}`);
  console.log("Restart npm run dev if needed. QR uses NEXT_PUBLIC_APP_URL when set to staging.");
  return normalized;
}

function waitForTunnelUrl(timeoutMs = 90_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["--yes", "cloudflared", "tunnel", "--url", "http://localhost:3000"],
      { cwd: root, shell: true, stdio: ["ignore", "pipe", "pipe"] },
    );

    let captured = null;
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Timed out waiting for Cloudflare tunnel URL"));
    }, timeoutMs);

    function onData(chunk) {
      const text = chunk.toString();
      process.stderr.write(text);
      if (captured) return;
      const match = text.match(URL_RE);
      if (match) {
        captured = match[0];
        clearTimeout(timer);
        child.kill();
        resolve(captured);
      }
    }

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
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
  console.log("Waiting for Cloudflare tunnel URL (dev server must be on :3000)...");
  const url = await waitForTunnelUrl();
  updateEnv(url);
  console.log(url);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
