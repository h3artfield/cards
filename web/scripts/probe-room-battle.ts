import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  for (const needle of ["Room —", "Battle —", "Disturb ", "unlock this door", "Daybound"]) {
    const hits: string[] = [];
    for (const c of catalog.byOracleId.values()) {
      const t = combinedGoldenOracleText(c);
      if (t.includes(needle)) hits.push(`${c.canonicalName} (${c.layout})`);
    }
    console.log(`\n${needle}: ${hits.length} hits`);
    console.log(hits.slice(0, 10).join("\n"));
  }
}
main();
