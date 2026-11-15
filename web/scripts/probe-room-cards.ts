import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  for (const c of catalog.byOracleId.values()) {
    const t = combinedGoldenOracleText(c);
    if (!t.includes("unlock this door")) continue;
    console.log(`${c.canonicalName} (${c.layout})\t${t.replace(/\n/g, " | ").slice(0, 220)}`);
  }
}
main();
