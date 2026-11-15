/**
 * Full evaluation identity audit against catalogOracleCards.
 * Run: npx tsx scripts/audit-eval-identity.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { buildFullEvalCardNameLookup } from "./lib/eval-case-card-name-lookup";
import {
  auditEvalCaseIdentity,
  summarizeIdentityAudit,
  type IdentityMismatch,
} from "./lib/eval-identity-audit-lib";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";

loadEnvLocal();

interface EvalDatasetFile {
  cases: OracleActionEvalCaseV2[];
  contentHash?: string;
  setClassification?: string;
}

const DATASET_FILES: Array<{ version: string; path: string }> = [
  { version: "development_set_v1", path: "data/oracle-action-eval-development-v1.json" },
  { version: "development_set_v2", path: "data/oracle-action-eval-development-v2.json" },
  { version: "development_set_v3", path: "data/oracle-action-eval-development-v3.json" },
  { version: "development_set_v4", path: "data/oracle-action-eval-development-v4.json" },
  { version: "development_set_v5", path: "data/oracle-action-eval-development-v5.json" },
  { version: "development_set_v6", path: "data/oracle-action-eval-development-v6.json" },
  { version: "development_set_v7", path: "data/oracle-action-eval-development-v7.json" },
  { version: "development_set_v8", path: "data/oracle-action-eval-development-v8.json" },
  { version: "development_set_v9", path: "data/oracle-action-eval-development-v9.json" },
  { version: "validation_set_v2", path: "data/oracle-action-eval-validation-v2.json" },
  { version: "validation_set_v3", path: "data/oracle-action-eval-validation-v3.json" },
  { version: "validation_set_v5", path: "data/oracle-action-eval-validation-v5.json" },
  { version: "development_set_v10", path: "data/oracle-action-eval-development-v10.json" },
  { version: "final_blind_test_v1", path: "data/oracle-action-eval-final-blind-v1.json" },
];

function loadCases(relativePath: string): EvalDatasetFile {
  const fullPath = resolve(process.cwd(), relativePath);
  if (!existsSync(fullPath)) throw new Error(`Missing dataset: ${relativePath}`);
  return JSON.parse(readFileSync(fullPath, "utf8")) as EvalDatasetFile;
}

function traceRootCause(caseId: string, mismatch: IdentityMismatch): string | null {
  if (caseId === "held-0030") {
    return [
      "Storm the Festival root cause:",
      "generate-oracle-action-held-out-set.ts HELD_OUT_SEEDS[29] pairs name \"Storm the Festival\"",
      "with Claim // Fame front-face saga-style graveyard-return text (3 identical chapters).",
      "buildHeldOutCases() copies seed.text verbatim and assigns synthetic oracleId held-oracle-30.",
      "No join to catalogOracleCards — name and text were authored independently in the seed array.",
    ].join(" ");
  }
  if (caseId.startsWith("dev-v9-") && mismatch.storedCardName === "Ashiok, Dream Render") {
    return [
      "Ashiok, Dream Render root cause:",
      "development-set-v9-expansion-seeds.ts static_cast_restriction_not_cast family",
      "pairs name \"Ashiok, Dream Render\" with Grafdigger's Cage oracle text",
      "(\"Players can't cast spells from graveyards or libraries.\").",
      "buildDevV9ExpansionCases() copies seed.text without catalog lookup.",
      "Reviewer note intended a Grafdigger's Cage contrast card but used wrong planeswalker name.",
    ].join(" ");
  }
  return null;
}

async function main() {
  console.log("Loading golden catalog from Firestore catalogOracleCards…");
  const catalog = await loadGoldenCatalogIndex();
  console.log(`  ${catalog.cardCount.toLocaleString()} oracle cards (${catalog.catalogVersion})\n`);

  const cardNameLookup = buildFullEvalCardNameLookup();
  const allResults = [];

  for (const { version, path } of DATASET_FILES) {
    const payload = loadCases(path);
    console.log(`Auditing ${version}: ${payload.cases.length} cases (${path})`);
    for (const testCase of payload.cases) {
      allResults.push(
        auditEvalCaseIdentity({
          testCase,
          dataset: version,
          cardName: cardNameLookup.get(testCase.id),
          catalog,
        }),
      );
    }
  }

  const summary = summarizeIdentityAudit(allResults);

  const stormMismatch = summary.allMismatches.find((m) => m.caseId === "held-0030");
  const ashiokMismatch = summary.allMismatches.find(
    (m) => m.storedCardName === "Ashiok, Dream Render",
  );

  const blindParserExecuted = (() => {
    const accessLogPath = resolve(process.cwd(), "data", "oracle-action-validation-access-log.json");
    if (!existsSync(accessLogPath)) return false;
    const log = JSON.parse(readFileSync(accessLogPath, "utf8")) as Array<{ set?: string }>;
    return log.some((entry) => /final_blind|blind_test/i.test(JSON.stringify(entry)));
  })();

  const report = {
    auditedAt: new Date().toISOString(),
    goldenCatalogSource: "catalogOracleCards",
    goldenCatalogVersion: catalog.catalogVersion,
    goldenCatalogCardCount: catalog.cardCount,
    totalCasesChecked: summary.totalCasesChecked,
    exactMatchCases: summary.exactMatchCases,
    mismatchCaseCount: summary.totalCasesChecked - summary.exactMatchCases,
    mismatchCountByDataset: summary.mismatchCountByDataset,
    mismatchCountByCategory: summary.mismatchCountByCategory,
    stormTheFestival: {
      caseId: "held-0030",
      found: Boolean(stormMismatch),
      mismatch: stormMismatch ?? null,
      rootCause: stormMismatch ? traceRootCause("held-0030", stormMismatch) : null,
    },
    ashiokDreamRender: {
      caseId: ashiokMismatch?.caseId ?? null,
      found: Boolean(ashiokMismatch),
      mismatch: ashiokMismatch ?? null,
      rootCause: ashiokMismatch ? traceRootCause(ashiokMismatch.caseId, ashiokMismatch) : null,
    },
    generatorJoinBug:
      "All eval generators (generate-oracle-action-eval-cases, generate-oracle-action-held-out-set, generate-oracle-action-final-blind-set, development-set-v8/v9-expansion-seeds) assign synthetic oracleIds and copy hand-authored seed.text without catalogOracleCards lookup. Card names are mapped by seed array index only.",
    finalBlindParserExecuted: blindParserExecuted,
    finalBlindParserExecutedConfirmation:
      blindParserExecuted
        ? "WARNING: access log indicates blind set may have been parsed"
        : "Confirmed: final_blind_test_v1 parser was never executed (identity check only).",
    mismatches: summary.allMismatches,
  };

  const reportPath = resolve(process.cwd(), "reports", "eval-identity-audit.json");
  mkdirSync(resolve(reportPath, ".."), { recursive: true });
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\n=== Eval identity audit ===");
  console.log(`Total cases checked: ${summary.totalCasesChecked}`);
  console.log(`Exact-match cases:   ${summary.exactMatchCases}`);
  console.log(`Cases with mismatches: ${summary.totalCasesChecked - summary.exactMatchCases}`);
  console.log("\nMismatch count by dataset:");
  for (const [dataset, count] of Object.entries(summary.mismatchCountByDataset).sort()) {
    console.log(`  ${dataset}: ${count}`);
  }
  console.log("\nMismatch count by category:");
  for (const [category, count] of Object.entries(summary.mismatchCountByCategory).sort()) {
    console.log(`  ${category}: ${count}`);
  }
  console.log(`\nReport: ${reportPath}`);
  console.log(report.finalBlindParserExecutedConfirmation);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
