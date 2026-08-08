/**
 * RC2 v1.26 development gate — combined dev + expansion v4 family training.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

function metrics(cases: OracleActionEvalCaseV2[], label: string) {
  const r = evaluateCaseSet(cases, label);
  const a = r.metricsByEmissionTier.acceptedOnly;
  return {
    caseCount: cases.length,
    accepted: {
      tp: a.truePositives,
      fp: a.falsePositives,
      fn: a.falseNegatives,
      precision: a.precision,
      recall: a.recall,
      unsupported: r.authoritativeClassification.counts.genuinely_unsupported_by_oracle,
    },
  };
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const parserCommit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();

  const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v26.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
  const expV2 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v2.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const expV3 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v3.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const expV4 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v4.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };

  const expV2Training = expV2.cases.filter(
    (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
  );
  const combined = [...dev.cases, ...expV2Training, ...expV3.cases];

  const devMetrics = metrics(dev.cases, "development_set_v26");
  const expV2Metrics = metrics(expV2Training, "expansion_training_v2");
  const expV3Metrics = metrics(expV3.cases, "expansion_training_v3");
  const expV4Metrics = metrics(expV4.cases, "expansion_training_v4");
  const combinedMetrics = metrics(combined, "combined_development_v126");

  const combinedGate =
    combinedMetrics.accepted.precision >= 0.98 &&
    combinedMetrics.accepted.recall >= 0.9 &&
    combinedMetrics.accepted.fp === 0 &&
    combinedMetrics.accepted.unsupported === 0;

  const familyGate =
    expV4Metrics.accepted.precision >= 0.95 &&
    expV4Metrics.accepted.recall >= 0.9 &&
    expV4Metrics.accepted.unsupported === 0;

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    parserCommit,
    metrics: {
      originalDevelopmentV26: devMetrics,
      expansionTrainingV2: expV2Metrics,
      expansionTrainingV3: expV3Metrics,
      expansionTrainingV4: expV4Metrics,
      combinedDevelopment: combinedMetrics,
    },
    gates: {
      combinedPrecisionTarget: combinedMetrics.accepted.precision >= 0.98,
      combinedRecallTarget: combinedMetrics.accepted.recall >= 0.9,
      combinedFpZero: combinedMetrics.accepted.fp === 0,
      combinedUnsupportedZero: combinedMetrics.accepted.unsupported === 0,
      familyTrainingPrecisionTarget: expV4Metrics.accepted.precision >= 0.95,
      familyTrainingRecallTarget: expV4Metrics.accepted.recall >= 0.9,
      familyTrainingUnsupportedZero: expV4Metrics.accepted.unsupported === 0,
      allDevelopmentGatesPass: combinedGate && familyGate,
    },
    nextMilestone: {
      action: combinedGate && familyGate ? "freeze v1.26 and run expansion-check-v3 once" : "continue v1.26 parser tuning",
      freshCheckGate: { precision: 0.95, recall: 0.85, unsupported: 0 },
    },
  };

  const outDir = resolve(process.cwd(), "data/milestones/rc2-development-planning");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "rc2-checkpoint-v126-dev.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.gates.allDevelopmentGatesPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
