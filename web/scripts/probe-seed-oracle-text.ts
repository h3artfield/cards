import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, lookupGoldenByName } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

const names = process.argv.slice(2);

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds();
  for (const n of names) {
    const c = lookupGoldenByName(catalog, n);
    if (!c) {
      console.log("MISSING:", n);
      continue;
    }
    console.log("===", n, c.oracleId, excluded.has(c.oracleId) ? "[EXCLUDED]" : "");
    console.log(c.oracleText);
    console.log("");
  }
}

main();
