import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import {
  loadGoldenCatalogIndex,
  lookupGoldenByName,
  combinedGoldenOracleText,
  goldenFaceRecords,
} from "./lib/load-golden-catalog-index";

async function main() {
  const c = await loadGoldenCatalogIndex();
  for (const name of [
    "Brightcap Badger // Fungus Frolic",
    "Fungal Fortitude",
    "Brightcap Badger",
    "Fungus Frolic",
  ]) {
    const g = lookupGoldenByName(c, name);
    if (!g) {
      console.log("MISS", name);
      continue;
    }
    console.log("---", g.canonicalName, g.layout, g.oracleId);
    console.log(combinedGoldenOracleText(g));
    for (const f of goldenFaceRecords(g)) {
      console.log(`  face[${f.faceIndex}] ${f.faceName}: ${f.oracleText?.slice(0, 100)}`);
    }
  }
}

main().catch(console.error);
