import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, lookupGoldenByName } from "./lib/load-golden-catalog-index";

loadEnvLocal();
async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const names = process.argv.slice(2);
  for (const n of names) {
    const g = lookupGoldenByName(catalog, n);
    console.log(JSON.stringify({ name: n, found: !!g, canonical: g?.canonicalName, text: g?.oracleText?.slice(0, 200) }));
  }
}
main();
