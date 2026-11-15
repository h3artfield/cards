import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";
import { buildCatalogResolverIndexes, resolveCatalogSeed } from "./lib/catalog-resolver";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

async function main() {
  const names = [
    "Genji Glove",
    "Fire Whip",
    "Blade of the Bloodchief",
    "Sigil of Sleep",
    "Hotfoot Gnome",
    "Ophidian Eye",
    "Instill Energy",
    "Alpha Authority",
    "Townsfolk Mentor",
    "Crab Umbrella",
    "Grafted Wargear",
    "Umbral Mantle",
    "Power Armor",
    "Silk Net",
    "Bonesplitter",
  ];
  const catalog = await loadGoldenCatalogIndex();
  const idx = buildCatalogResolverIndexes(catalog);
  for (const name of names) {
    const r = resolveCatalogSeed(catalog, idx, { name });
    console.log("===", name, r?.card?.canonicalName ?? "MISS");
    if (r?.card) console.log(combinedGoldenOracleText(r.card));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
