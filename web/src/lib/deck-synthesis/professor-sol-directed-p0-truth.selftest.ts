/**
 * P0 deterministic truth regressions — must pass before Sol-directed OpenAI calls.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { assertProfessorSolDirectedP0Truth } from "./professor-sol-directed-p0-truth-v1-1-1";

function loadEnvLocal() {
  for (const rel of [".env.local", "web/.env.local"]) {
    const path = resolve(process.cwd(), rel);
    if (!existsSync(path)) continue;
    for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq <= 0) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

async function main() {
  loadEnvLocal();
  const catalog = await loadDeckResolutionCatalog();
  assertProfessorSolDirectedP0Truth(catalog);
  console.log("ALL PASS — professor-sol-directed-p0-truth");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
