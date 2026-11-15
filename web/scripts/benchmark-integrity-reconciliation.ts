/**
 * Reconcile benchmark integrity counts — identity audit scope vs unresolved cases.
 * Run: npx tsx scripts/benchmark-integrity-reconciliation.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { loadGoldenCatalogIndex } from "./lib/load-golden-catalog-index";
import { auditEvalCaseIdentity, summarizeIdentityAudit } from "./lib/eval-identity-audit-lib";
import { buildDevelopmentCardNameLookup } from "./lib/dev-case-card-name-lookup";
import { buildFullEvalCardNameLookup } from "./lib/eval-case-card-name-lookup";
import {
  PERMANENTLY_EXCLUDED_DEV_CASES,
  RESOLVED_DEV_CASE_CATALOG_MAP,
} from "./lib/unresolved-dev-case-resolutions";
import { SYNTHETIC_ORACLE_ID_PATTERN } from "./lib/eval-provenance-guard";
import { summarizeGoldReview } from "./lib/gold-review-engine";
import { INVALID_PRIOR_TEXT_DEFINITIONS } from "./lib/invalid-prior-text-classifier";
import type { CatalogEvalCase } from "./lib/eval-provenance-guard";

loadEnvLocal();

function load(path: string) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

async function main() {
  const catalog = await loadGoldenCatalogIndex();
  const v11 = load("data/oracle-action-eval-development-v11.json");
  const v12 = load("data/oracle-action-eval-development-v12.json");
  const val = load("data/oracle-action-eval-validation-v7.json");
  const blind = load("data/oracle-action-eval-final-blind-v2.json");

  const devLookup = buildDevelopmentCardNameLookup();
  const valLookup = buildFullEvalCardNameLookup();

  const activeDev = (v12.cases ?? v11.cases) as CatalogEvalCase[];
  const activeVal = val.cases as CatalogEvalCase[];
  const activeBlind = blind.cases as CatalogEvalCase[];

  const devIdentity = activeDev.map((c) =>
    auditEvalCaseIdentity({
      testCase: c,
      dataset: "development_set_v12",
      cardName: c.cardName ?? devLookup.get(c.id),
      catalog,
    }),
  );
  const valIdentity = activeVal.map((c) =>
    auditEvalCaseIdentity({
      testCase: c,
      dataset: "validation_set_v7",
      cardName: c.cardName ?? valLookup.get(c.id),
      catalog,
    }),
  );
  const blindIdentity = activeBlind.map((c) =>
    auditEvalCaseIdentity({
      testCase: c,
      dataset: "final_blind_test_v2",
      cardName: c.cardName,
      catalog,
    }),
  );

  const identitySummary = summarizeIdentityAudit([...devIdentity, ...valIdentity, ...blindIdentity]);

  const devWithRealOracleId = activeDev.filter(
    (c) => c.oracleId && !SYNTHETIC_ORACLE_ID_PATTERN.test(c.oracleId),
  ).length;
  const v11Unresolved = (v11.unresolvedCaseIds ?? []) as string[];
  const permanentlyExcluded = PERMANENTLY_EXCLUDED_DEV_CASES.map((e) => e.caseId);
  const resolvedCount = RESOLVED_DEV_CASE_CATALOG_MAP.length;

  const devGoldReview = v12.secondPassGoldReview?.summary ?? { reviewed: 0, total: activeDev.length };
  const valGoldReview = val.secondPassGoldReview?.summary ?? { reviewed: 0, total: activeVal.length };

  const report = {
    generatedAt: new Date().toISOString(),
    reconciliationNote:
      "The prior 491/491 exact-match claim counted only cases IN active JSON files. The 36 v11-unresolved cases were excluded from v11 and must not be counted as exact matches.",
    development: {
      v11TotalCases: v11.caseCount ?? v11.cases.length,
      v11CasesWithRealCatalogOracleId: v11.cases.filter(
        (c: CatalogEvalCase) => !SYNTHETIC_ORACLE_ID_PATTERN.test(c.oracleId),
      ).length,
      v11UnresolvedExcludedFromActive: v11Unresolved.length,
      v11UnresolvedCaseIds: v11Unresolved,
      resolvedToCatalogInV12: resolvedCount,
      permanentlyExcludedFromBenchmark: permanentlyExcluded.length,
      permanentlyExcludedCaseIds: permanentlyExcluded,
      v12ActiveTotalCases: activeDev.length,
      v12CasesWithRealCatalogOracleId: devWithRealOracleId,
      v12IncludedInIdentityAudit: activeDev.length,
      v12IdentityExactMatch: devIdentity.filter((r) => r.exactMatch).length,
      v12GoldReviewed: devGoldReview.reviewed ?? 0,
      v12GoldReviewRate: activeDev.length
        ? (devGoldReview.reviewed ?? 0) / activeDev.length
        : 0,
      unresolvedSyntheticOracleIdsInActive: activeDev.filter((c) =>
        SYNTHETIC_ORACLE_ID_PATTERN.test(c.oracleId),
      ).length,
    },
    validation: {
      activeTotalCases: activeVal.length,
      identityExactMatch: valIdentity.filter((r) => r.exactMatch).length,
      goldReviewed: valGoldReview.reviewed ?? 0,
      goldReviewRate: activeVal.length ? (valGoldReview.reviewed ?? 0) / activeVal.length : 0,
    },
    blind: {
      activeTotalCases: activeBlind.length,
      identityExactMatch: blindIdentity.filter((r) => r.exactMatch).length,
      parserExecutionCount: blind.parserExecutionCount ?? 0,
      sealed: blind.sealed ?? false,
      goldReviewStatus: blind.goldReviewStatus,
      identityStatus: blind.identityStatus,
      excludedFromParserDevDiagnostics: true,
    },
    identityAudit: {
      activeSetTotalCases: activeDev.length + activeVal.length + activeBlind.length,
      totalExactMatch: identitySummary.exactMatchCases,
      totalChecked: identitySummary.totalCasesChecked,
      developmentExactMatch: devIdentity.filter((r) => r.exactMatch).length,
      validationExactMatch: valIdentity.filter((r) => r.exactMatch).length,
      blindExactMatch: blindIdentity.filter((r) => r.exactMatch).length,
      excludedFromAudit: {
        permanentlyExcludedDevCases: permanentlyExcluded.length,
        note: "Excluded cases are not in active JSON and are not counted in identity audit totals.",
      },
    },
    invalidPriorTextSemantics: INVALID_PRIOR_TEXT_DEFINITIONS,
    invalidPriorTextCounts: {
      developmentV11FirstPass: v11.goldRelabelStatistics?.invalid_prior_text ?? null,
      validationV6FirstPass: load("data/oracle-action-eval-validation-v6.json").goldRelabelStatistics
        ?.invalid_prior_text ?? null,
      developmentV12SecondPass: v12.secondPassGoldReview?.invalidPriorText ?? null,
      validationV7SecondPass: val.secondPassGoldReview?.invalidPriorText ?? null,
      interpretation:
        "invalid_prior_text counts are prior-gold audit mentions, not current-gold defect counts. Category A (superseded_complete) must not be cited as precision cause. Category B (gold_incomplete) blocks evaluation.",
    },
    parserEvaluationGates: {
      activeDevelopmentIdentity100Pct: devIdentity.every((r) => r.exactMatch),
      activeValidationIdentity100Pct: valIdentity.every((r) => r.exactMatch),
      activeDevelopmentGoldReview100Pct: (devGoldReview.reviewed ?? 0) === activeDev.length,
      activeValidationGoldReview100Pct: (valGoldReview.reviewed ?? 0) === activeVal.length,
      unresolvedSyntheticIds: activeDev.filter((c) => SYNTHETIC_ORACLE_ID_PATTERN.test(c.oracleId)).length,
      developmentUsableForParserEvaluation: v12.usableForParserEvaluation ?? false,
      validationUsableForParserEvaluation: val.usableForParserEvaluation ?? false,
      parserV113Blocked: true,
      blindParserExecutionBlocked: (blind.parserExecutionCount ?? 0) === 0,
    },
  };

  const outPath = resolve(process.cwd(), "reports", "benchmark-integrity-reconciliation.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("Benchmark integrity reconciliation");
  console.log(JSON.stringify(report.development, null, 2));
  console.log(JSON.stringify(report.identityAudit, null, 2));
  console.log(`Report: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
