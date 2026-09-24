import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds();
  const names = process.argv.slice(2);
  for (const n of names) {
    const c = [...catalog.byOracleId.values()].find((x) => x.canonicalName.toLowerCase() === n.toLowerCase());
    if (!c) {
      console.log("MISSING:", n);
      continue;
    }
    console.log(c.canonicalName, excluded.has(c.oracleId) ? "EXCLUDED" : "OK", c.oracleId);
    console.log(c.oracleText.slice(0, 200));
    console.log("");
  }
}

main();
