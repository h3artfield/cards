import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, lookupGoldenByName } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();
async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds();
  const names = process.argv.slice(2);
  for (const n of names) {
    const g = lookupGoldenByName(catalog, n);
    if (!g) { console.log(n, "NOT FOUND"); continue; }
    console.log(n, excluded.has(g.oracleId) ? "OVERLAP" : "OK", g.oracleId.slice(0,8));
  }
}
main();
