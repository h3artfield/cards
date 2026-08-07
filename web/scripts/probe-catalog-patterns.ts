import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";

async function main() {
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.slice("--limit=".length), 10) : undefined;

  const catalog = await loadGoldenCatalogIndex();

  function find(layout: string | null, includes: string[]) {
    const hits: string[] = [];
    for (const c of catalog.byOracleId.values()) {
      if (layout && c.layout !== layout) continue;
      const t = combinedGoldenOracleText(c).toLowerCase();
      if (includes.every((s) => t.includes(s.toLowerCase()))) hits.push(c.canonicalName);
    }
    return hits.slice(0, 8);
  }

  const queries: Array<[string | null, string[]]> = [
    [null, ["flying", "vigilance", "add {w}", "whenever you gain life, draw"]],
    [null, ["scry 2"]],
    [null, ["all lands become", "creatures"]],
    [null, ["maximum number of counters", "artifacts"]],
    ["transform", ["daybound", "draw a card"]],
    ["transform", ["nightbound", "wolf token"]],
    [null, ["prototype", "draw a card"]],
    [null, ["mutate", "draw a card"]],
    [null, ["class 1", "level 2"]],
    ["room", ["when you unlock this door", "draw"]],
    ["room", ["when you unlock this door", "destroy target artifact"]],
    ["split", ["draw a card", "draw two cards"]],
    ["modal_dfc", ["when this creature dies, draw a card"]],
    ["modal_dfc", ["disturb", "draw a card"]],
    ["modal_dfc", ["disturb", "destroy target artifact"]],
    ["modal_dfc", ["disturb", "exile target creature"]],
    ["battle", ["battle — siege", "deals 2 damage"]],
    ["battle", ["battle — siege", "draw a card"]],
    ["battle", ["battle — siege", "lose 1 life"]],
    ["transform", ["if you would draw a card, instead draw two"]],
    ["transform", ["transforms into daybound, draw a card"]],
    ["modal_dfc", ["{1}: draw a card"]],
  ];

  for (const [layout, inc] of queries) {
    console.log(`${layout ?? "any"}\t${inc.join(" + ")}\t=>\t${find(layout, inc).join(" | ") || "NONE"}`);
    if (limit !== undefined && --limit <= 0) break;
  }
}

main();
