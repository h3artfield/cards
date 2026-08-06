import { readFileSync } from "fs";
import { resolve } from "path";

/** Load web/.env.local into process.env (scripts only — does not overwrite existing). */
export function loadEnvLocal(): void {
  const p = resolve(__dirname, "../../.env.local");
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] == null) {
      process.env[key] = trimmed.slice(eq + 1).trim();
    }
  }
}

export const LOCAL_FIRESTORE_TIMEOUT_MS = 15_000;

export const LOCAL_FIRESTORE_FAIL_FAST_HINT =
  "Local Firestore is unavailable or slow. Run: npm run firestore:health. " +
  "For staging card reprocess use the admin button or POST /api/admin/cards/[id]/v2-reprocess on staging — not local npx tsx scripts.";
