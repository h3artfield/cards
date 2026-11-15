/**
 * Probe non-overlapping catalog cards for v1.27 training and fresh check.
 */
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

const patterns: Record<string, RegExp> = {
  dual_loyalty: /\n\+1:[^\n]+\n[\s\S]{0,200}\n\+1:/,
  loyalty_minus: /\n−(?:\d+|X):/,
  spree: /\bSpree\b/,
  choose_modal: /\bChoose one —/,
  token_copy: /\bCreate a token that's a copy of target/,
  delayed_exile: /\bAt the beginning of the next end step, exile/,
  search_gy: /search your library and\/or graveyard/,
  return_that: /return that card to its owner's hand/,
  copy_spell: /\bCopy target (?:instant|sorcery) spell\b/,
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
        if (hits.length >= 15) break;
      }
    }
    console.log(`\n${label}:\n  ${hits.join("\n  ")}`);
  }
}

main();
