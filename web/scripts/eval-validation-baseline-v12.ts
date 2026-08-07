/**
 * Rerun unchanged parser v1.12 against validation_set_v4 (taxonomy v1.2 corrected baseline).
 * Run: npx tsx scripts/eval-validation-baseline-v12.ts
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import {
  ORACLE_ACTION_PARSER_VERSION,
  ORACLE_ACTION_TAXONOMY_VERSION,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { auditValidationSet } from "./audit-validation-errors-v12";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const MILESTONE_COMMIT = "39a1e6108b97f084565e9151f5f3eef953762885";

function main() {
  if (!existsSync(resolve(process.cwd(), "data", "oracle-action-eval-validation-v4.json"))) {
    throw new Error("Run create-validation-set-v4.ts first");
  }

  const v4 = JSON.parse(
    readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-validation-v4.json"), "utf8"),
  ) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    setClassification: string;
    taxonomyVersion: string;
    parentContentHash: string;
  };

  const results = evaluateCaseSet(v4.cases, "validation_set_v4");
  const audit = auditValidationSet(v4.cases);

  const report = {
    generatedAt: new Date().toISOString(),
    evaluationVersion: "validation-v4-taxonomy-v1.2-baseline-v12",
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    taxonomyVersion: ORACLE_ACTION_TAXONOMY_VERSION,
    datasetTaxonomyVersion: v4.taxonomyVersion,
    commitSha: MILESTONE_COMMIT,
    parserModified: false,
    validationSet: "validation_set_v4",
    validationSetHash: v4.contentHash,
    parentValidationSetV3Hash: v4.parentContentHash,
    metrics: {
      accepted: results.metricsByEmissionTier.acceptedOnly,
      needsReview: results.metricsByEmissionTier.needsReviewOnly,
      allEmission: results.metricsByEmissionTier.allEmission,
      goldPositiveCount:
        results.metricsByEmissionTier.allEmission.truePositives +
        results.metricsByEmissionTier.allEmission.falseNegatives,
      tierInvariants: results.metricsByEmissionTier.tierInvariants,
    },
    acceptedUnsupportedCount: results.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    windfallAudit: {
      caseId: "held-0010",
      rootCause: "evaluator_defect",
      fix: "Third-person draw heuristic extended in inferSupportedPrimitiveFromEvidence",
      goldChanged: false,
    },
    putOntoBattlefieldAudit: {
      caseIds: ["held-0025", "held-0058"],
      rootCause: "missing_gold_label",
      fix: "validation_set_v4 gold adds put_onto_battlefield; parser still emits search_library (wrong_primitive)",
    },
    falsePositivesByCategory: results.falsePositiveClassification,
    emissionTotals: results.emissionCounts,
    classificationCounts: audit.records.reduce(
      (acc, r) => {
        acc[r.classification] = (acc[r.classification] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    ),
    remainingMismatchCount: audit.records.length,
  };

  const outPath = resolve(process.cwd(), "reports", "oracle-action-eval-validation-v4-baseline-v12.json");
  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("=== validation_set_v4 corrected baseline (parser unchanged) ===");
  console.log("parser:", ORACLE_ACTION_PARSER_VERSION);
  console.log("taxonomy:", ORACLE_ACTION_TAXONOMY_VERSION);
  console.log("v4 hash:", v4.contentHash.slice(0, 12) + "…");
  console.log(
    "accepted TP/FP/FN:",
    report.metrics.accepted.truePositives,
    report.metrics.accepted.falsePositives,
    report.metrics.accepted.falseNegatives,
  );
  console.log(
    "needs-review TP/FP:",
    report.metrics.needsReview.truePositives,
    report.metrics.needsReview.falsePositives,
  );
  console.log(
    "all-emission TP/FP/FN:",
    report.metrics.allEmission.truePositives,
    report.metrics.allEmission.falsePositives,
    report.metrics.allEmission.falseNegatives,
  );
  console.log(
    "accepted P/R:",
    (report.metrics.accepted.precision * 100).toFixed(1) + "%",
    (report.metrics.accepted.recall * 100).toFixed(1) + "%",
  );
  console.log(
    "all-emission P/R:",
    (report.metrics.allEmission.precision * 100).toFixed(1) + "%",
    (report.metrics.allEmission.recall * 100).toFixed(1) + "%",
  );
  console.log("gold positives:", report.metrics.goldPositiveCount);
  console.log("unsupported:", report.acceptedUnsupportedCount);
  console.log("tier invariants:", JSON.stringify(report.metrics.tierInvariants));
  console.log("→", outPath);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("eval-validation-baseline-v12.ts")) {
  main();
}
