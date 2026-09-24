import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

const patterns: Record<string, RegExp> = {
  look_put_hand: /Look at the top[\s\S]{0,120}Put one of them into your hand/i,
  lib_gy_search: /search your library and\/or graveyard/i,
  counter_unless: /Counter target spell unless/i,
  delayed_exile_end: /At the beginning of the next end step, exile/i,
  copy_creature_token: /Create a token that's a copy of target/i,
};

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds();
  for (const [label, re] of Object.entries(patterns)) {
    const hits: string[] = [];
    for (const card of catalog.byOracleId.values()) {
      if (excluded.has(card.oracleId)) continue;
      if (re.test(card.oracleText)) {
        hits.push(card.canonicalName);
        if (hits.length >= 12) break;
      }
    }
    console.log(`${label}: ${hits.join(" | ")}`);
  }
}

main();
