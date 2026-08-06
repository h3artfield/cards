import { readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getConfiguredAppUrl } from "./app-url";

const TUNNEL_URL_FILE = join(process.cwd(), ".tunnel-url");

export function readLiveTunnelUrl(): string | null {
  if (!existsSync(TUNNEL_URL_FILE)) return null;
  try {
    const url = readFileSync(TUNNEL_URL_FILE, "utf8").trim();
    return url || null;
  } catch {
    return null;
  }
}

/** Remove stale tunnel URL so customer links fall back to NEXT_PUBLIC_APP_URL. */
export function clearLiveTunnelUrl(): void {
  if (!existsSync(TUNNEL_URL_FILE)) return;
  try {
    unlinkSync(TUNNEL_URL_FILE);
  } catch {
    /* ignore */
  }
}

/** Best base URL for customer links — prefers the live tunnel file over env. */
export function resolveServerAppBaseUrl(): string {
  return readLiveTunnelUrl() ?? getConfiguredAppUrl();
}
