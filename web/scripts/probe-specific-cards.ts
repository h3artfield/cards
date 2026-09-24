import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const queries: string[][] = [
    ["whenever you gain life, draw"],
    ["partner", "treasure"],
    ["hexproof", "sacrifice", "draw two"],
    ["unlock this door", "destroy target artifact"],
    ["unlock this door", "each player draws"],
    ["unlock this door", "destroy target creature"],
    ["draw a card", "draw two cards"],
    ["disturb", "destroy target artifact"],
    ["disturb", "exile target creature"],
    ["invasion of", "deals 2 damage"],
    ["invasion of", "draw a card"],
    ["invasion of", "lose 1 life"],
    ["invasion of", "destroy target artifact"],
    ["invasion of", "create a 1/1"],
    ["{1}: draw a card"],
    ["prototype", "deathtouch"],
    ["wolf token"],
    ["transforms into daybound, draw"],
  ];

  for (const parts of queries) {
    const hits: string[] = [];
    for (const c of catalog.byOracleId.values()) {
      const t = combinedGoldenOracleText(c).toLowerCase();
      if (parts.every((p) => t.includes(p.toLowerCase()))) hits.push(`${c.canonicalName} (${c.layout})`);
    }
    console.log(`${parts.join(" + ")}\t=>\t${hits.slice(0, 6).join(" | ") || "NONE"}`);
  }
}
main();
