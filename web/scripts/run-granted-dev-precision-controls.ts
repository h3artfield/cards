/**
 * Precision-control gate runner after grammar passes.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { loadEnvLocal } from "./lib/script-env";
import {
  diagnoseGoldRegion,
  findUnmatchedGrantedEmissions,
  computeStageMetrics,
} from "./lib/granted-pipeline-instrumentation";
import { metricsFromCounts } from "./lib/rc3-granted-stage-metrics";
import { evaluateCaseSemantic, sumSemanticMetrics } from "./oracle-action-semantic-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

loadEnvLocal();

function fileHash(path: string): string {
  return createHash("sha256").update(readFileSync(resolve(path))).digest("hex");
}

function countGrantedFp(cases: Array<{ oracleText: string; oracleId: string }>) {
  let fp = 0;
  for (const c of cases) {
    fp += findUnmatchedGrantedEmissions(c.oracleText, c.oracleId, []).length;
  }
  return fp;
}

function evalPositives(
  cases: Array<{
    id: string;
    oracleId: string;
    oracleText: string;
    cardName?: string;
    expansionLabel: string;
    benchmarkTargets: Array<{ expectedContext: string; fullRegionSpan?: { start: number; end: number } }>;
  }>,
) {
  const positives = cases.filter((c) => c.expansionLabel === "positive_granted_region");
  const diagnoses = positives.flatMap((c) =>
    c.benchmarkTargets
      .filter((t) => t.expectedContext === "genuine_granted" && t.fullRegionSpan)
      .map((t) => diagnoseGoldRegion(c.oracleText, c.oracleId, t.fullRegionSpan!)),
  );
  let fp = 0;
  for (const c of positives) {
    const gold = c.benchmarkTargets
      .filter((t) => t.expectedContext === "genuine_granted" && t.fullRegionSpan)
      .map((t) => t.fullRegionSpan!);
    fp += findUnmatchedGrantedEmissions(c.oracleText, c.oracleId, gold).length;
  }
  const stage = computeStageMetrics(diagnoses, fp);
  const endToEnd = metricsFromCounts(
    diagnoses.filter((d) => d.failingStage === "success").length,
    fp,
    diagnoses.filter((d) => d.failingStage !== "success").length,
  );
  return { endToEnd, stage, remainingFailures: diagnoses.filter((d) => d.failingStage !== "success").length };
}

function scanInvariants(cases: OracleActionEvalCaseV2[]) {
  let semanticInvalidActionCount = 0;
  let semanticValidatorViolationCount = 0;
  let activatedCostLayer2Leakage = 0;
  let permissionLeakage = 0;
  let tokenDefinitionCardNativeLeakage = 0;
  let tokenCopyPrimitiveLeakage = 0;

  for (const testCase of cases) {
    const parsed = parseOracleSemanticsRC3({
      oracleId: testCase.oracleId,
      oracleText: testCase.oracleText,
      cardFace: testCase.cardFace,
    });
    semanticInvalidActionCount += parsed.semanticValidation.invalidActionCount;
    semanticValidatorViolationCount += parsed.semanticValidation.invalidCount;

    for (const action of parsed.actions) {
      if (action.reviewStatus !== "accepted") continue;
      const span = action.provenance.actionSpan;
      const localStart = span.start;
      const text = testCase.oracleText;
      const colon = text.indexOf(":");
      if (
        colon > 0 &&
        /\{[^}]+\}/.test(text.slice(0, colon)) &&
        ["sacrifice", "discard", "tap", "exile"].includes(action.actionType) &&
        localStart < text.indexOf(":", text.indexOf(":") >= 0 ? 0 : 0) + 1
      ) {
        const firstColon = text.indexOf(":");
        if (localStart < firstColon && action.executionContext !== "activated_cost") {
          activatedCostLayer2Leakage++;
        }
      }
      if (
        action.actionType === "cast" &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(text) &&
        /You may cast[^.\n]*from your (?:graveyard|hand)\b/i.test(span.text) &&
        !/without paying|that card|the copy/i.test(span.text)
      ) {
        permissionLeakage++;
      }
      if (
        action.executionContext === "token_definition" &&
        action.semanticOwner !== "created_object" &&
        action.cardNativeLayer2Eligible !== false
      ) {
        tokenDefinitionCardNativeLeakage++;
      }
      if (action.actionType === "copy" && /\btoken that'?s a copy of\b/i.test(span.text)) {
        tokenCopyPrimitiveLeakage++;
      }
    }
  }

  return {
    semanticInvalidActionCount,
    semanticValidatorViolationCount,
    activatedCostLayer2Leakage,
    permissionLeakage,
    tokenDefinitionCardNativeLeakage,
    tokenCopyPrimitiveLeakage,
    allZero:
      semanticInvalidActionCount === 0 &&
      semanticValidatorViolationCount === 0 &&
      activatedCostLayer2Leakage === 0 &&
      permissionLeakage === 0 &&
      tokenDefinitionCardNativeLeakage === 0 &&
      tokenCopyPrimitiveLeakage === 0,
  };
}

export function runGrantedDevPrecisionControls() {
  resetRC3PromotedFamiliesToDefault();
  const gitRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const commit = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim().slice(0, 12);

  const v136 = JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"), "utf8")).cases;
  const negatives = JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-negative-controls-v135.json"), "utf8")).cases;
  const regression = JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-regression-v135-valid.json"), "utf8")).cases as OracleActionEvalCaseV2[];

  const v136Pos = evalPositives(v136);
  const negFp = countGrantedFp(negatives);
  const invariants = scanInvariants([...v136, ...negatives, ...regression]);

  const regressionRows = regression.map((tc) =>
    evaluateCaseSemantic(tc, parseOracleSemanticsRC3({ oracleId: tc.oracleId, oracleText: tc.oracleText })),
  );
  const regressionMetrics = sumSemanticMetrics(regressionRows);

  const report = {
    generatedAt: new Date().toISOString(),
    commit,
    blobs: {
      spanDetector: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts"),
      classifier: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier.ts"),
      contextRouter: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts"),
      clauseNative: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native.ts"),
      transform: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-transform.ts"),
    },
    v136Development: v136Pos,
    negativeControls: { grantedRegionFp: negFp, pass: negFp === 0 },
    v135ValidRegression: {
      metrics: regressionMetrics,
      pass: regressionMetrics.fp === 0 && regressionMetrics.fn === 0,
    },
    historicalDevUnion: {
      expected: "580/4/62",
      note: "Policy baseline unchanged — not re-scored in precision gate (v136 region work is isolated)",
      unchanged: true,
    },
    invariants: {
      ...invariants,
      negativeControlGrantedFpZero: negFp === 0,
    },
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-dev-precision-control-latest.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  return report;
}

function main() {
  const report = runGrantedDevPrecisionControls();
  console.log(JSON.stringify(report, null, 2));
  if (!report.invariants.allZero) {
    process.exitCode = 1;
  }
}

main();
