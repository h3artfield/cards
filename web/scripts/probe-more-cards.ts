import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const queries = [
    ["unlock this door", "destroy target creature"],
    ["unlock this door", "draw a card"],
    ["unlock this door", "create a 1/1"],
    ["beck // call"],
    ["driven // despair"],
    ["maximum number of counters"],
    ["partner"],
    ["disturb", "destroy"],
    ["disturb", "exile target creature"],
    ["modal_dfc", "draw a card"],
    ["if you would draw a card, instead draw two"],
    ["activated abilities of artifacts", "less to activate"],
  ];
  for (const parts of queries) {
    const hits: string[] = [];
    for (const c of catalog.byOracleId.values()) {
      const t = combinedGoldenOracleText(c).toLowerCase();
      const name = c.canonicalName.toLowerCase();
      if (parts.length === 1 && parts[0].includes("//")) {
        if (name.includes(parts[0])) hits.push(`${c.canonicalName} (${c.layout})`);
        continue;
      }
      if (parts.every((p) => t.includes(p.toLowerCase()))) hits.push(`${c.canonicalName} (${c.layout})`);
    }
    console.log(`${parts.join(" + ")}\t=>\t${hits.slice(0, 6).join(" | ") || "NONE"}`);
  }
}
main();
