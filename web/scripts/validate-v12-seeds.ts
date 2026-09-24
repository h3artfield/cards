import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, lookupGoldenByName } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";
import { VALIDATION_V12_FRESH_SEEDS } from "./validation-v12-fresh-seeds";

loadEnvLocal();
async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds();
  for (const s of VALIDATION_V12_FRESH_SEEDS) {
    const g = lookupGoldenByName(catalog, s.name);
    const status = !g ? "NOT_FOUND" : excluded.has(g.oracleId) ? "OVERLAP" : "OK";
    if (status !== "OK") console.log(status, s.name, s.stratum);
  }
}
main();
