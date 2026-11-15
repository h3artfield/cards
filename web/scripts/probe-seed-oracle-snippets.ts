import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, lookupGoldenByName } from "./lib/load-golden-catalog-index";

loadEnvLocal();

const NAMES = process.argv.slice(2);

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  for (const name of NAMES) {
    const c = lookupGoldenByName(catalog, name);
    if (!c) {
      console.log("MISSING", name);
      continue;
    }
    console.log("---", name, "---");
    console.log(c.oracleText.replace(/\r/g, "").slice(0, 400));
    console.log();
  }
}

main();
