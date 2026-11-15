import { loadEnvLocal } from "./lib/script-env";
loadEnvLocal();
import { loadGoldenCatalogIndex, combinedGoldenOracleText } from "./lib/load-golden-catalog-index";
import { OPTIONALITY_CONDITION_EVAL_CASES } from "./oracle-action-eval-optionality-condition-cases";

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  for (const c of OPTIONALITY_CONDITION_EVAL_CASES.filter((x) => x.id.startsWith("dev-cond-"))) {
    const needle = c.expectedConditions?.[0]?.textContains ?? c.oracleText.slice(0, 40);
    const hits: string[] = [];
    for (const card of catalog.byOracleId.values()) {
      if (combinedGoldenOracleText(card).toLowerCase().includes(needle.toLowerCase())) {
        hits.push(card.canonicalName);
      }
    }
    console.log(`${c.id}\t${needle}\t=>\t${hits.slice(0, 3).join(" | ") || "NONE"}`);
  }
}
main();
