import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import { loadGoldenCatalogIndex, combinedGoldenOracleText, lookupGoldenByName } from "./lib/load-golden-catalog-index";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  for (const name of [
    "Roaring Furnace // Steaming Sauna",
    "Unholy Annex // Ritual Chamber",
    "Bottomless Pool // Locker Room",
    "Grand Entryway // Elegant Rotunda",
  ]) {
    const g = lookupGoldenByName(catalog, name);
    if (!g) { console.log(name, "MISS"); continue; }
    console.log("\n" + name);
    console.log(combinedGoldenOracleText(g));
  }
}
main();
