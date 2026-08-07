/**
 * Probe catalog for expansion-v3 training families.
 */
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds();
  const patterns: Record<string, RegExp> = {
    lib_or_gy: /search your library and\/or graveyard/i,
    pw_minus_x: /[+\u2212-]X:/i,
    pw_three_loyalty: /[+\u2212-]\d+:.*[\n\r][+\u2212-]/s,
    token_copy_delayed: /Create a token that's a copy[\s\S]{0,200}(?:At the beginning|next end step)/i,
    reveal_put_mv_life: /Reveal[\s\S]{0,80}put[\s\S]{0,40}hand[\s\S]{0,80}loses life equal to its mana value/i,
    delayed_exile_it: /(?:At the beginning|next end step)[\s\S]{0,60}exile (?:it|that)/i,
    token_copy: /Create a token that's a copy of target/i,
    opponent_loses_life_spell: /Target opponent loses \d+ life/i,
  };

  for (const [label, re] of Object.entries(patterns)) {
    const hits: string[] = [];
    for (const card of catalog.byOracleId.values()) {
      if (excluded.has(card.oracleId)) continue;
      if (re.test(card.oracleText)) {
        hits.push(card.canonicalName);
        if (hits.length >= 12) break;
      }
    }
    console.log(`\n${label} (${hits.length}):`, hits.join(" | "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
