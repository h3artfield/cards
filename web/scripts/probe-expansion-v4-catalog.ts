/**
 * Probe catalog for expansion-v4 training families.
 */
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

const patterns: Record<string, RegExp> = {
  dual_loyalty: /\n\+1:[^\n]+\n\+1:/s,
  loyalty_zero: /\n0:/,
  lib_gy_put_bf: /search your library and\/or graveyard[\s\S]{0,120}put it onto the battlefield/i,
  spree: /\bSpree\b/,
  descend_modal: /\bDescend \d+ — Choose one/i,
  kicker_draw: /Kicker[\s\S]{0,80}draw a card/i,
  return_that_card: /return that card to its owner's hand/i,
  return_conditional_scry: /Return target[\s\S]{0,80}to its owner's hand\. If[\s\S]{0,40}scry/i,
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
        if (hits.length >= 10) break;
      }
    }
    console.log(`\n${label} (${hits.length}):`, hits.join(" | "));
  }
}

main();
