import { loadEnvLocal } from "./lib/script-env";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { lookupGoldenByName, loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";

loadEnvLocal();

async function main() {
  const names = process.argv.slice(2);
  const catalog = await loadGoldenCatalogIndex();

  for (const n of names) {
    const c = lookupGoldenByName(catalog, n)!;
    const raw = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText });
    console.log("\n===", n);
    for (const a of raw.actions) {
      if (a.reviewStatus !== "accepted" && a.reviewStatus !== "needs_review") continue;
      console.log({
        type: a.actionType,
        abilityIndex: a.abilityIndex,
        loyaltyCost: a.loyaltyCost,
        modalOptionId: a.modalOptionId,
        evidence: a.evidenceText.slice(0, 70),
        status: a.reviewStatus,
      });
    }
  }
}

main();
