/**
 * Oracle-action evaluation v12 — development_set_v7 + optional validation_set_v2 milestone.
 * Run: npx tsx scripts/eval-oracle-action-extraction-v12.ts
 *      npx tsx scripts/eval-oracle-action-extraction-v12.ts --validation-milestone
 */
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import {
  ORACLE_ACTION_PARSER_VERSION,
  ORACLE_ACTION_PRODUCTION_GATES,
} from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { runMetricsReconciliation } from "./reconcile-metrics-v6";
import { runNeedsReviewCalibration } from "./calibrate-needs-review-v6";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const V6_IMMUTABLE_HASH = "24d24887732e5ae6412ee3597b1654753ccccf8cd4d044c095b07822e530bb9d";

function gatePass(value: number, target: number, direction: "min" | "max"): boolean {
  return direction === "min" ? value >= target : value <= target;
}

function main() {
  const validationMilestone = process.argv.includes("--validation-milestone");
  const repoRoot = resolve(process.cwd(), "..");

  if (!existsSync(resolve(process.cwd(), "data", "oracle-action-eval-development-v7.json"))) {
    execSync("npx tsx scripts/create-development-set-v7.ts", { cwd: process.cwd(), stdio: "inherit" });
  }

  const dev = JSON.parse(
    readFileSync(resolve(process.cwd(), "data", "oracle-action-eval-development-v7.json"), "utf8"),
  ) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
    caseCount: number;
    setClassification: string;
    parentContentHash: string;
  };

  let commitSha = "unknown";
  try {
    commitSha = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  } catch {
    commitSha = "uncommitted";
  }

  const devResults = evaluateCaseSet(dev.cases, "development_set_v7");
  const reconciliation = runMetricsReconciliation(dev.cases, "development_set_v7");
  const calibration = runNeedsReviewCalibration(dev.cases);

  const accepted = devResults.metricsByEmissionTier.acceptedOnly;
  const needsReview = devResults.metricsByEmissionTier.needsReviewOnly;
  const allEmission = devResults.metricsByEmissionTier.allEmission;
  const invariants = devResults.metricsByEmissionTier.tierInvariants;

  const goldPositiveCount =
    allEmission.truePositives + allEmission.falseNegatives;

  const devGates = {
    acceptedPrecision: {
      value: accepted.precision,
      target: 0.98,
      pass: gatePass(accepted.precision, 0.98, "min"),
    },
    acceptedRecall: {
      value: accepted.recall,
      target: 0.9,
      pass: gatePass(accepted.recall, 0.9, "min"),
    },
    acceptedUnsupported: {
      value: devResults.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
      target: 0,
      pass: devResults.authoritativeClassification.counts.genuinely_unsupported_by_oracle === 0,
    },
    tierInvariantsExact: {
      tpSumHolds: invariants?.tpSumHolds ?? false,
      fpSumHolds: invariants?.fpSumHolds ?? false,
      pass: Boolean(invariants?.tpSumHolds && invariants?.fpSumHolds),
    },
  };

  const devReport = {
    generatedAt: new Date().toISOString(),
    evaluationVersion: "eval-v12-development-v7",
    commitSha,
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    developmentSetV7Hash: dev.contentHash,
    parentV6Hash: dev.parentContentHash ?? V6_IMMUTABLE_HASH,
    goldPositiveCount,
    accepted: {
      truePositives: accepted.truePositives,
      falsePositives: accepted.falsePositives,
      falseNegatives: accepted.falseNegatives,
      precision: accepted.precision,
      recall: accepted.recall,
    },
    needsReview: {
      truePositives: needsReview.truePositives,
      falsePositives: needsReview.falsePositives,
    },
    allEmission: {
      truePositives: allEmission.truePositives,
      falsePositives: allEmission.falsePositives,
      falseNegatives: allEmission.falseNegatives,
      precision: allEmission.precision,
      recall: allEmission.recall,
    },
    invariantChecks: invariants,
    remainingParserMisses: reconciliation.emissionFalseNegatives.filter(
      (fn) => fn.failureCategory === "missing_grammar",
    ),
    remainingNeedsReviewReasons: reconciliation.needsReviewClassification.postPromotion,
    devGates,
    devGatesPass: Object.values(devGates).every((g) => g.pass),
    emissionCounts: devResults.emissionCounts,
    metricsByPrimitive: devResults.perPrimitive,
    metricsByLayout: devResults.metricsByLayout,
    multifaceSafetyNote: "Run eval-oracle-action-extraction-v8.ts for multiface gate metrics (unchanged parser gates).",
  };

  mkdirSync(resolve(process.cwd(), "reports"), { recursive: true });
  const devOut = resolve(process.cwd(), "reports", "oracle-action-eval-development-v12.json");
  writeFileSync(devOut, JSON.stringify(devReport, null, 2), "utf8");

  console.log("=== development_set_v7 ===");
  console.log("commit:", commitSha);
  console.log("parser:", ORACLE_ACTION_PARSER_VERSION);
  console.log("v7 hash:", dev.contentHash.slice(0, 12) + "…");
  console.log("gold positives:", goldPositiveCount);
  console.log("accepted TP/FP/FN:", accepted.truePositives, accepted.falsePositives, accepted.falseNegatives);
  console.log("needs-review TP/FP:", needsReview.truePositives, needsReview.falsePositives);
  console.log("all-emission TP/FP/FN:", allEmission.truePositives, allEmission.falsePositives, allEmission.falseNegatives);
  console.log("invariants:", invariants);
  console.log("dev gates pass:", devReport.devGatesPass);
  console.log("→", devOut);

  if (!validationMilestone) {
    console.log("\nValidation not run (use --validation-milestone when dev gates pass).");
    return;
  }

  if (!devReport.devGatesPass) {
    console.error("\nValidation blocked: development gates did not pass.");
    process.exit(1);
  }

  const validationPath = resolve(process.cwd(), "data", "oracle-action-eval-validation-v2.json");
  const validation = JSON.parse(readFileSync(validationPath, "utf8")) as {
    cases: OracleActionEvalCaseV2[];
    contentHash: string;
  };
  const validationResults = evaluateCaseSet(validation.cases, "validation_set_v2");
  const valAccepted = validationResults.metricsByEmissionTier.acceptedOnly;
  const valAll = validationResults.metricsByEmissionTier.allEmission;
  const valNeedsReview = validationResults.metricsByEmissionTier.needsReviewOnly;

  const validationReport = {
    generatedAt: new Date().toISOString(),
    evaluationVersion: "eval-v12-validation-milestone",
    commitSha,
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    validationSetHash: validation.contentHash,
    accepted: {
      precision: valAccepted.precision,
      recall: valAccepted.recall,
      truePositives: valAccepted.truePositives,
      falsePositives: valAccepted.falsePositives,
      falseNegatives: valAccepted.falseNegatives,
    },
    allEmission: {
      precision: valAll.precision,
      recall: valAll.recall,
      truePositives: valAll.truePositives,
      falsePositives: valAll.falsePositives,
      falseNegatives: valAll.falseNegatives,
    },
    acceptedUnsupportedCount:
      validationResults.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    falsePositivesByCategory: validationResults.falsePositiveClassification,
    falseNegativesByCategory: validationResults.metricsByEmissionTier.allEmission.falseNegatives,
    emissionTotals: validationResults.emissionCounts,
    needsReviewTotals: {
      needsReviewActions: validationResults.emissionCounts.needsReviewActions,
      needsReviewTruePositives: valNeedsReview.truePositives,
      needsReviewFalsePositives: valNeedsReview.falsePositives,
    },
    multifaceSafetyNote: "Run eval-oracle-action-extraction-v8.ts for multiface gate metrics.",
    metricsByPrimitive: validationResults.perPrimitive,
    metricsByLayout: validationResults.metricsByLayout,
    tierInvariants: validationResults.metricsByEmissionTier.tierInvariants,
    productionGates: validationResults.gateResults,
    allProductionGatesPass: validationResults.allProductionGatesPass,
  };

  const valOut = resolve(process.cwd(), "reports", "oracle-action-eval-validation-v12-milestone.json");
  writeFileSync(valOut, JSON.stringify(validationReport, null, 2), "utf8");

  const logPath = resolve(process.cwd(), "data", "oracle-action-validation-access-log.json");
  let log: unknown[] = [];
  try {
    log = JSON.parse(readFileSync(logPath, "utf8")) as unknown[];
  } catch {
    log = [];
  }
  log.push({
    timestamp: new Date().toISOString(),
    reason: "validation-milestone-v12",
    commitSha,
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    metrics: validationReport.accepted,
  });
  writeFileSync(logPath, JSON.stringify(log, null, 2), "utf8");

  console.log("\n=== validation_set_v2 milestone ===");
  console.log("accepted P/R:", valAccepted.precision, valAccepted.recall);
  console.log("all-emission P/R:", valAll.precision, valAll.recall);
  console.log("accepted unsupported:", validationReport.acceptedUnsupportedCount);
  console.log("→", valOut);
}

main();
