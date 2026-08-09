import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";
import { loadEnvLocal } from "./lib/script-env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

loadEnvLocal();

async function main() {
  const excluded = new Set<string>();
  for (const rel of [
    "data/oracle-action-eval-granted-classifier-expansion-v136.json",
    "data/oracle-action-eval-granted-classifier-expansion-v135.json",
  ]) {
    for (const c of (JSON.parse(readFileSync(resolve(rel), "utf8")) as { cases: Array<{ oracleId: string }> }).cases) {
      excluded.add(c.oracleId);
    }
  }

  const catalog = await loadGoldenCatalogIndex();
  const hits: Array<{ name: string; oracleId: string; snippet: string }> = [];
  for (const card of catalog.byOracleId.values()) {
    if (excluded.has(card.oracleId)) continue;
    const text = combinedGoldenOracleText(card);
    const patterns = [
      /(?:Equipped|Enchanted) creature has "[^"]*:\s[^"]+"/i,
      /Creatures you control have "[^"]*:\s[^"]+"/i,
      /Creatures you control have "Whenever[^"]+"/i,
      /tokens you control have "[^"]*:\s[^"]+"/i,
      /(?:Equipped|Enchanted) creature has "Whenever[^"]+"/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) {
        hits.push({ name: card.canonicalName, oracleId: card.oracleId, snippet: m[0].slice(0, 90) });
        break;
      }
    }
  }
  console.log(JSON.stringify(hits.slice(0, 20), null, 2));
  console.log("total", hits.length);
}

main();
