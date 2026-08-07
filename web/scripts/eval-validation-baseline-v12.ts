/**
 * Rerun unchanged parser v1.12 against validation_set_v3 (corrected baseline).
 * Run: npx tsx scripts/eval-validation-baseline-v12.ts
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { auditValidationSet } from "./audit-validation-errors-v12";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const MILESTONE_COMMIT = "39a1e6108b97f084565e9151f5f3eef953762885";

function main() {
  if (!existsSync(resolve(process.cwd(), "data", "oracle-action-eval-validation-v3.json"))) {
    throw new Error("Run create-validation-set-v3.ts first");
  }

  const v3 = JSON.parse(
    readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-validation-v3.json"), "utf8"),
  ) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    setClassification: string;
    parentContentHash: string;
  };

  const results = evaluateCaseSet(v3.cases, "validation_set_v3");
  const audit = auditValidationSet(v3.cases);

  const report = {
    generatedAt: new Date().toISOString(),
    evaluationVersion: "validation-v3-corrected-baseline-v12",
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    commitSha: MILESTONE_COMMIT,
    parserModified: false,
    validationSet: "validation_set_v3",
    validationSetHash: v3.contentHash,
    parentValidationSetV2Hash: v3.parentContentHash,
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

  const outPath = resolve(process.cwd(), "reports", "oracle-action-eval-validation-v3-baseline-v12.json");
  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("=== validation_set_v3 corrected baseline (parser unchanged) ===");
  console.log("parser:", ORACLE_ACTION_PARSER_VERSION);
  console.log("v3 hash:", v3.contentHash.slice(0, 12) + "…");
  console.log(
    "accepted TP/FP/FN:",
    report.metrics.accepted.truePositives,
    report.metrics.accepted.falsePositives,
    report.metrics.accepted.falseNegatives,
  );
  console.log(
    "all-emission TP/FP/FN:",
    report.metrics.allEmission.truePositives,
    report.metrics.allEmission.falsePositives,
    report.metrics.allEmission.falseNegatives,
  );
  console.log("gold positives:", report.metrics.goldPositiveCount);
  console.log("unsupported:", report.acceptedUnsupportedCount);
  console.log("→", outPath);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("eval-validation-baseline-v12.ts")) {
  main();
}
