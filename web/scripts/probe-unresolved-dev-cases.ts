/**
 * Probe catalog resolution for development_set_v11 unresolvedCaseIds.
 */
import { readFileSync } from "node:fs";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex, lookupGoldenByName, findCardsWithOracleText } from "./lib/load-golden-catalog-index";
import { buildDevelopmentCardNameLookup } from "./lib/dev-case-card-name-lookup";

loadEnvLocal();

async function main() {
  const v11 = JSON.parse(readFileSync("data/oracle-action-eval-development-v11.json", "utf8"));
  const v10 = JSON.parse(readFileSync("data/oracle-action-eval-development-v10.json", "utf8"));
  const lookup = buildDevelopmentCardNameLookup();
  const catalog = await loadGoldenCatalogIndex();

  for (const id of v11.unresolvedCaseIds as string[]) {
    const prior = v10.cases.find((c: { id: string }) => c.id === id);
    const name = lookup.get(id);
    let status = "";
    if (name) {
      const g = lookupGoldenByName(catalog, name);
      status = g ? `NAME_OK: ${g.canonicalName} (${g.oracleId.slice(0, 8)}…)` : `NAME_MISS: ${name}`;
    } else if (prior) {
      const owners = findCardsWithOracleText(catalog, prior.oracleText.slice(0, 80));
      status = owners.length
        ? `TEXT: ${owners.slice(0, 3).map((c) => c.canonicalName).join(" | ")}`
        : "NO_MATCH";
    } else {
      status = "MISSING_FROM_V10";
    }
    console.log(`${id}\t${status}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
