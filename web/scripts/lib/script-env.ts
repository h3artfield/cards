import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

export type EnvLocalSource = "process" | "web/.env.local" | "repo/.env.local";

const WEB_ENV_LOCAL = resolve(__dirname, "../../.env.local");
const REPO_ENV_LOCAL = resolve(__dirname, "../../../.env.local");

/** Keys whose values must never appear in logs, reports, or artifacts. */
const SECRET_ENV_KEYS = new Set(["TOPDECK_API_KEY"]);

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    out[key] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

/**
 * Deterministic env resolution for local scripts:
 * 1. process.env (already set — never overwritten)
 * 2. web/.env.local
 * 3. repo/.env.local
 */
export function loadProjectEnvLocal(): void {
  const repoVars = parseEnvFile(REPO_ENV_LOCAL);
  const webVars = parseEnvFile(WEB_ENV_LOCAL);

  for (const [key, value] of Object.entries(repoVars)) {
    if (process.env[key] == null) process.env[key] = value;
  }
  for (const [key, value] of Object.entries(webVars)) {
    if (process.env[key] == null) process.env[key] = value;
  }
}

/** @deprecated Use loadProjectEnvLocal */
export function loadEnvLocal(): void {
  loadProjectEnvLocal();
}

export function resolveTopdeckApiKey(): {
  detected: boolean;
  source: EnvLocalSource | null;
} {
  const key = "TOPDECK_API_KEY";
  const value = process.env[key]?.trim();
  if (!value) return { detected: false, source: null };

  const webVars = parseEnvFile(WEB_ENV_LOCAL);
  const repoVars = parseEnvFile(REPO_ENV_LOCAL);

  if (webVars[key]?.trim() === value) return { detected: true, source: "web/.env.local" };
  if (repoVars[key]?.trim() === value) return { detected: true, source: "repo/.env.local" };
  return { detected: true, source: "process" };
}

/** Safe for logs/reports — never returns the secret value. */
export function redactEnvForReport(): Record<string, string | boolean> {
  const topdeck = resolveTopdeckApiKey();
  return {
    topDeckApiKeyDetected: topdeck.detected,
    topDeckApiKeySource: topdeck.source ?? "none",
  };
}

export function assertSecretNotLogged(key: string, message: string): void {
  const value = process.env[key];
  if (!value) return;
  if (message.includes(value)) {
    throw new Error(`Refusing to emit secret env value for ${key}`);
  }
}

export const LOCAL_FIRESTORE_TIMEOUT_MS = 15_000;

export const LOCAL_FIRESTORE_FAIL_FAST_HINT =
  "Local Firestore is unavailable or slow. Run: npm run firestore:health. " +
  "For staging card reprocess use the admin button or POST /api/admin/cards/[id]/v2-reprocess on staging — not local npx tsx scripts.";

export { SECRET_ENV_KEYS };
