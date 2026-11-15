import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import { loadGoldenCatalogIndex, combinedGoldenOracleText, lookupGoldenByName } from "./lib/load-golden-catalog-index";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  for (const name of ["Wolfkin Outcast // Wedding Crasher", "Covert Cutpurse // Covetous Geist"]) {
    const g = lookupGoldenByName(catalog, name);
    console.log("\n===", name, "===");
    console.log(combinedGoldenOracleText(g!));
  }
}
main();
