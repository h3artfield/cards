/**
 * Precision-control gate runner after grammar passes.
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { loadEnvLocal } from "./lib/script-env";
import {
  diagnoseGoldRegion,
  findUnmatchedGrantedEmissions,
  computeStageMetrics,
} from "./lib/granted-pipeline-instrumentation";
import { metricsFromCounts } from "./lib/rc3-granted-stage-metrics";

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

function evalPositives(cases: Array<{ id: string; oracleId: string; oracleText: string; cardName?: string; expansionLabel: string; benchmarkTargets: Array<{ expectedContext: string; fullRegionSpan?: { start: number; end: number } }> }>) {
  const positives = cases.filter((c) => c.expansionLabel === "positive_granted_region");
  const diagnoses = positives.flatMap((c) =>
    c.benchmarkTargets
      .filter((t) => t.expectedContext === "genuine_granted" && t.fullRegionSpan)
      .map((t) => diagnoseGoldRegion(c.oracleText, c.oracleId, t.fullRegionSpan!)),
  );
  let fp = 0;
  for (const c of positives) {
    const gold = c.benchmarkTargets.filter((t) => t.expectedContext === "genuine_granted" && t.fullRegionSpan).map((t) => t.fullRegionSpan!);
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

function main() {
  resetRC3PromotedFamiliesToDefault();
  const gitRoot = execSync("git rev-parse --show-toplevel", { cwd: resolve("."), encoding: "utf8" }).trim();
  const commit = execSync("git rev-parse HEAD", { cwd: gitRoot, encoding: "utf8" }).trim().slice(0, 12);

  const v136 = JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"), "utf8")).cases;
  const negatives = JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-negative-controls-v135.json"), "utf8")).cases;

  const v136Pos = evalPositives(v136);
  const negFp = countGrantedFp(negatives);

  const report = {
    generatedAt: new Date().toISOString(),
    commit,
    blobs: {
      spanDetector: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts"),
      contextRouter: fileHash("src/lib/deck-builder/golden-catalog/oracle-rc3-semantic-context-router.ts"),
    },
    v136Development: v136Pos,
    negativeControls: { grantedRegionFp: negFp, pass: negFp === 0 },
    invariants: {
      negativeControlGrantedFpZero: negFp === 0,
      note: "Historical dev union not re-scored in this script — unchanged by policy",
    },
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-dev-precision-control-latest.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report, null, 2));
}

main();
