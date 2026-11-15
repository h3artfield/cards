import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { loadExcludedOracleIds } from "./lib/benchmark-oracle-id-exclusions";

loadEnvLocal();

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const excluded = loadExcludedOracleIds();
  const patterns: Record<string, RegExp> = {
    multiface: /\/\/|\n\/\//,
    pronoun: /return (?:it|that card|the exiled)/i,
    copy_target: /copy of target/i,
    third_gain: /gains \d+ life/i,
    modal: /Choose one/i,
    variable_life: /lose(?:s)? life equal to/i,
    storm: /Storm \(/i,
    tutor: /Search your library/i,
    return_hand: /Return target.*to its owner's hand/i,
  };

  for (const [label, re] of Object.entries(patterns)) {
    const hits: string[] = [];
    for (const card of catalog.byOracleId.values()) {
      if (excluded.has(card.oracleId)) continue;
      if (re.test(card.oracleText)) {
        hits.push(card.canonicalName);
        if (hits.length >= 8) break;
      }
    }
    console.log(`\n${label}:`, hits.join(" | "));
  }
}

main();
