import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

const pattern = new RegExp(process.argv[2] ?? "Destroy target", "i");

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds();
  const hits: string[] = [];
  for (const card of catalog.byOracleId.values()) {
    if (excluded.has(card.oracleId)) continue;
    if (pattern.test(card.oracleText)) {
      hits.push(card.canonicalName);
      if (hits.length >= 20) break;
    }
  }
  console.log(hits.join("\n"));
}

main();
