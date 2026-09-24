import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import { loadGoldenCatalogIndex, lookupGoldenByName } from "./lib/load-golden-catalog-index";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const layouts = new Map<string, number>();
  for (const c of catalog.byOracleId.values()) {
    const l = c.layout ?? "normal";
    layouts.set(l, (layouts.get(l) ?? 0) + 1);
  }
  console.log("layouts", [...layouts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25));

  for (const name of [
    "Hostile Hostel",
    "Invasion of Goblin Rabbits // Rabbit Battery",
    "Galedrifter // Waildrifter",
    "Dawn // Dusk",
    "Henrika Domnathi // Henrika, Infernal Seer",
    "Discovery // Dispersal",
    "Spell Contortion",
    "Surly Badgersaur",
    "Crypt Creeper",
    "Natural Affinity",
    "Merfolk Coralsmith",
    "Combat Thresher",
    "Pollywog Symbiote",
    "Tovolar, Dire Overlord // Tovolar, the Midnight Scourge",
    "Lunar Frenzy // Lunar Frenzy",
    "The Celestus",
    "Sorcerer Class",
    "Grim Bauble",
  ]) {
    const g = lookupGoldenByName(catalog, name);
    console.log(name, g ? `${g.layout} ${g.oracleId.slice(0, 8)}` : "MISS");
  }
}
main();
