import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { resolveCommanderBlueprintFromCatalogV417 } from "../src/lib/deck-synthesis/professor-commander-catalog-v4-17-v1";
import { runLiveSolBlueprintV417 } from "../src/lib/deck-synthesis/professor-sol-blueprint-live-v4-17-v1";

function loadEnvLocal() {
  for (const rel of [".env.local", "web/.env.local"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
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
loadEnvLocal();
process.env.PROFESSOR_V4_17_LIVE_SOL = "1";

async function main() {
  const name = process.argv[2] ?? "Ultimecia, Time Sorceress // Ultimecia, Omnipotent";
  const catalog = await loadDeckResolutionCatalog();
  const commander = resolveCommanderBlueprintFromCatalogV417({ catalog, commanderName: name });
  const sol = await runLiveSolBlueprintV417({ commander, requestedBracket: 4, userPreferences: ["B4"] });
  writeFileSync(resolve(process.cwd(), "data/milestones/deck-synthesis/v4-17-slice3-live-sol/single-test-raw.json"), JSON.stringify(sol, null, 2));
  console.log(JSON.stringify({ ok: Boolean(sol.proposal), schema: sol.schemaFailure?.violations, keys: Object.keys(sol.rawParsed ?? {}) }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
