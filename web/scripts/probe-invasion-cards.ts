import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  for (const c of catalog.byOracleId.values()) {
    if (!c.canonicalName.toLowerCase().startsWith("invasion of")) continue;
    const t = combinedGoldenOracleText(c).replace(/\n/g, " | ");
    console.log(`${c.canonicalName}\t${t.slice(0, 200)}`);
  }
}
main();
