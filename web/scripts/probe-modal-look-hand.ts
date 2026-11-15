import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds();
  const hits: string[] = [];
  for (const card of catalog.byOracleId.values()) {
    if (excluded.has(card.oracleId)) continue;
    if (/Choose one/i.test(card.oracleText) && /Put one of them into your hand/i.test(card.oracleText)) {
      hits.push(card.canonicalName);
      if (hits.length >= 15) break;
    }
  }
  console.log(hits.join("\n"));
}

main();
