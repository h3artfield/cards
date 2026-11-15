import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";
import { buildCatalogResolverIndexes, resolveCatalogSeed } from "./lib/catalog-resolver";
import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

const names = [
  "Paradise Mantle",
  "Psychic Overload",
  "Sunbond",
  "Consuming Fervor",
  "Fishing Pole",
  "Trickster's Talisman",
  "Ophidian Eye",
  "Decaying Soil",
  "Ringing Strike Mastery",
  "Giant's Amulet",
  "Manaweft Sliver",
  "Reborn Hero",
  "Umbral Mantle",
  "From Beyond",
  "Hotfoot Gnome",
  "Instill Energy",
  "Sigil of Sleep",
  "Blade of the Bloodchief",
  "Genji Glove",
  "Crab Umbrella",
  "Wind Zendikon",
  "Mark of Eviction",
  "Viridian Longbow",
  "Selesnya Signet",
  "Llanowar Elves",
];

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const idx = buildCatalogResolverIndexes(catalog);
  for (const name of names) {
    const r = resolveCatalogSeed(catalog, idx, { name });
    console.log("===", name, r?.card?.oracleId ?? "MISS");
    if (r?.card) console.log(combinedGoldenOracleText(r.card));
  }
  console.log("\n--- pattern scan ---");
  const scans = [
    { label: "equip_add_g", re: /Equipped creature has "\{T\}: Add \{G\}/i },
    { label: "any_has_may_draw", re: / has "[^"]*you may draw/i },
    { label: "creatures_add_colored", re: /Creatures you control have "\{T\}: Add \{/i },
    { label: "enchantment_threshold_has", re: /this enchantment has "/i },
    { label: "enchanted_return", re: /Enchanted creature has "[^"]*return target/i },
    { label: "this_creature_has", re: /this creature has "/i },
    { label: "token_it_has", re: /It has "Sacrifice this token: Add/i },
  ];
  for (const card of catalog.byOracleId.values()) {
    const t = combinedGoldenOracleText(card);
    for (const s of scans) {
      if (s.re.test(t)) console.log(s.label, card.canonicalName);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
