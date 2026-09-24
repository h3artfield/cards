import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  for (const needle of ["Siege", "Invasion of", "convert this creature", "Aftermath"]) {
    const hits: string[] = [];
    for (const c of catalog.byOracleId.values()) {
      const t = combinedGoldenOracleText(c);
      if (t.toLowerCase().includes(needle.toLowerCase())) hits.push(`${c.canonicalName} (${c.layout})`);
    }
    console.log(`\n${needle}: ${hits.length}`);
    console.log(hits.slice(0, 12).join("\n"));
  }
}
main();
