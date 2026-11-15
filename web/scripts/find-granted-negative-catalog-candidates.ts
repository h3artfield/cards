/**
 * Find catalog cards not in benchmark exclusions for granted negative controls.
 */
import { readFileSync, existsSync } from "node:fs";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

async function main() {
  const extra = new Set(loadExcludedOracleIds());
  for (const p of [
    "data/oracle-action-eval-development-v26-v14.json",
    "data/oracle-action-eval-rc3-positive-training-catalog-v133.json",
    "data/oracle-action-eval-granted-classifier-expansion-v135.json",
  ]) {
    if (!existsSync(p)) continue;
    for (const c of (JSON.parse(readFileSync(p, "utf8")) as { cases: Array<{ oracleId: string }> }).cases) {
      extra.add(c.oracleId);
    }
  }

  const catalog = await loadGoldenCatalogIndex();
  const grantRe = /equipped creature has|creatures you control (?:have|gain)|enchanted creature has|gains "/i;
  const picks: Array<{ name: string; text: string }> = [];

  for (const card of catalog.byOracleId.values()) {
    if (extra.has(card.oracleId)) continue;
    const t = card.oracleText ?? "";
    if (t.length < 20 || t.length > 350) continue;
    if (grantRe.test(t)) continue;
    if (/token is an artifact with/i.test(t)) continue;
    picks.push({ name: card.canonicalName ?? card.name ?? "?", text: t.slice(0, 140).replace(/\n/g, " ") });
    if (picks.length >= 20) break;
  }

  console.log(JSON.stringify({ excludedCount: extra.size, picks }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
