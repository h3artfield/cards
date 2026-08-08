/**
 * RC2 v1.27 development gate — combined dev + expansion v5 structural family training.
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { ORACLE_ACTION_PARSER_VERSION } from "../src/lib/deck-builder/golden-catalog/oracle-action-schema";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";

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

function listFailures(cases: OracleActionEvalCaseV2[]) {
  const failures: Array<{ caseId: string; cardName?: string; fp: number; fn: number }> = [];
  for (const testCase of cases) {
    const raw = extractOracleActionsV1({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    const u = evaluateCaseUnified(
      testCase,
      raw.actions.map((a) => ({
        actionType: a.actionType,
        evidenceText: a.evidenceText,
        evidenceStart: a.evidenceStart,
        evidenceEnd: a.evidenceEnd,
        faceId: a.faceId,
        abilityIndex: a.abilityIndex,
        loyaltyCost: a.loyaltyCost,
        modalOptionId: a.modalOptionId,
        reviewStatus: a.reviewStatus,
        optionalEffect: a.optionalEffect,
        optional: a.optional,
      })),
    );
    if (u.accepted.fp > 0 || u.accepted.fn > 0) {
      failures.push({
        caseId: testCase.id,
        cardName: testCase.cardName,
        fp: u.accepted.fp,
        fn: u.accepted.fn,
      });
    }
  }
  return failures;
}

async function main() {
  const repoRoot = resolve(process.cwd(), "..");
  const parserCommit = execSync("git rev-parse HEAD", { cwd: repoRoot, encoding: "utf8" }).trim();
  const parserBlob = execSync(`git hash-object web/src/lib/deck-builder/golden-catalog/oracle-action-parser-v1.ts`, {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v26.json", "utf8")) as {
    cases: OracleActionEvalCaseV2[];
  };
  const expV2 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v2.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const expV3 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v3.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[] };
  const expV5 = JSON.parse(
    readFileSync("data/oracle-action-eval-development-generalization-expansion-v5.json", "utf8"),
  ) as { cases: OracleActionEvalCaseV2[]; contentHash: string };

  const expV2Training = expV2.cases.filter(
    (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
  );
  const combined = [...dev.cases, ...expV2Training, ...expV3.cases, ...expV5.cases];

  const devMetrics = metrics(dev.cases, "development_set_v26");
  const expV5Metrics = metrics(expV5.cases, "expansion_training_v5");
  const combinedMetrics = metrics(combined, "combined_development_v127");

  const combinedGate =
    combinedMetrics.accepted.precision >= 0.98 &&
    combinedMetrics.accepted.recall >= 0.9 &&
    combinedMetrics.accepted.fp === 0 &&
    combinedMetrics.accepted.unsupported === 0;

  const familyGate =
    expV5Metrics.accepted.precision >= 0.95 &&
    expV5Metrics.accepted.recall >= 0.9 &&
    expV5Metrics.accepted.unsupported === 0;

  const report = {
    generatedAt: new Date().toISOString(),
    parserVersion: ORACLE_ACTION_PARSER_VERSION,
    parserCommit,
    parserBlobSha: parserBlob,
    metrics: {
      originalDevelopmentV26: devMetrics,
      expansionTrainingV5: expV5Metrics,
      combinedDevelopment: combinedMetrics,
    },
    failures: {
      combined: listFailures(combined),
      expansionV5: listFailures(expV5.cases),
    },
    gates: {
      combinedPrecisionTarget: combinedMetrics.accepted.precision >= 0.98,
      combinedRecallTarget: combinedMetrics.accepted.recall >= 0.9,
      combinedFpZero: combinedMetrics.accepted.fp === 0,
      combinedUnsupportedZero: combinedMetrics.accepted.unsupported === 0,
      familyTrainingPrecisionTarget: expV5Metrics.accepted.precision >= 0.95,
      familyTrainingRecallTarget: expV5Metrics.accepted.recall >= 0.9,
      familyTrainingUnsupportedZero: expV5Metrics.accepted.unsupported === 0,
      allDevelopmentGatesPass: combinedGate && familyGate,
    },
    nextMilestone: {
      action:
        combinedGate && familyGate
          ? "freeze v1.27 parser SHA and run expansion-check-v4 once"
          : "continue v1.27 parser tuning",
      freshCheckGate: { precision: 0.95, recall: 0.85, unsupported: 0 },
    },
  };

  const outDir = resolve(process.cwd(), "data/milestones/rc2-development-planning");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "rc2-checkpoint-v127-dev.json"), JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  if (!report.gates.allDevelopmentGatesPass) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
