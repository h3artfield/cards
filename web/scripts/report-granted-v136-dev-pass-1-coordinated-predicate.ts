/**
 * v136 development pass 1 — coordinated-predicate grammar (post run-1 closure).
 * NOT a transfer re-run; development/regression measurement only.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { resetRC3PromotedFamiliesToDefault } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";
import { loadEnvLocal } from "./lib/script-env";
import { diagnoseGoldRegion, computeStageMetrics, findUnmatchedGrantedEmissions } from "./lib/granted-pipeline-instrumentation";
import { metricsFromCounts } from "./lib/rc3-granted-stage-metrics";
import { createHash } from "node:crypto";

loadEnvLocal();

function main() {
  resetRC3PromotedFamiliesToDefault();
  const cases = (
    JSON.parse(readFileSync(resolve("data/oracle-action-eval-granted-classifier-expansion-v136.json"), "utf8")) as {
      cases: Array<{
        id: string;
        oracleId: string;
        oracleText: string;
        cardName?: string;
        expansionLabel: string;
        benchmarkTargets: Array<{ expectedContext: string; fullRegionSpan?: { start: number; end: number } }>;
      }>;
    }
  ).cases.filter((c) => c.expansionLabel === "positive_granted_region");

  const diagnoses = cases.flatMap((c) =>
    c.benchmarkTargets
      .filter((t) => t.expectedContext === "genuine_granted" && t.fullRegionSpan)
      .map((t, regionIndex) => {
        const d = diagnoseGoldRegion(c.oracleText, c.oracleId, t.fullRegionSpan!);
        return { caseId: c.id, cardName: c.cardName, regionIndex, failingStage: d.failingStage };
      }),
  );

  let fp = 0;
  for (const c of cases) {
    const gold = c.benchmarkTargets.filter((t) => t.expectedContext === "genuine_granted" && t.fullRegionSpan).map((t) => t.fullRegionSpan!);
    fp += findUnmatchedGrantedEmissions(c.oracleText, c.oracleId, gold).length;
  }

  const stage = computeStageMetrics(diagnoses, fp);
  const endToEnd = metricsFromCounts(
    diagnoses.filter((d) => d.failingStage === "success").length,
    fp,
    diagnoses.filter((d) => d.failingStage !== "success").length,
  );

  const spanDetectorHash = createHash("sha256")
    .update(readFileSync(resolve("src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector.ts")))
    .digest("hex");

  const report = {
    generatedAt: new Date().toISOString(),
    checkpoint: "granted-v136-dev-pass-1-coordinated-predicate",
    note: "Development regression on spent v136 — not fresh transfer evidence",
    grammarFamily: "coordinated_predicate",
    change: "detectCoordinatedPredicateGrants for Equipped/Enchanted creature gets ... and has ...",
    spanDetectorHash,
    baselineAtRun1: { endToEnd: "18/0/8", a0Fn: 6, a1Fn: 2 },
    afterPass1: {
      endToEnd,
      ...stage,
      remainingFailures: diagnoses.filter((d) => d.failingStage !== "success"),
    },
  };

  mkdirSync(resolve("data/milestones/rc3-development"), { recursive: true });
  writeFileSync(
    resolve("data/milestones/rc3-development/granted-v136-dev-pass-1-coordinated-predicate-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  console.log(JSON.stringify(report.afterPass1, null, 2));
}

main();
