#!/usr/bin/env npx tsx
/**
 * P0: Reconcile Brier and regenerate frozen A/B TEST metrics without retraining.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  EXPECTED_DATASET_HASH,
  loadTrainingSnapshotManifest,
  modelArtifactDir,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import {
  filterPrimaryPodSize,
  loadSplitObservations,
} from "../src/lib/commander-strategy/model-a/dataset-v1";
import { MODEL_A_VERSION } from "../src/lib/commander-strategy/model-a/types";
import { MODEL_B_VERSION } from "../src/lib/commander-strategy/model-b/types";
import {
  countDistinctTournamentClusters,
  deprecatedModelABrierScore,
  evaluateObservationPredictorV1,
  FROZEN_METRIC_DEFINITIONS,
} from "../src/lib/commander-strategy/evaluation-metrics-v1";
import { bootstrapAllComparisons, perPodLogLossRows } from "../src/lib/commander-strategy/model-b/bootstrap-v1";

loadProjectEnvLocal();

type PredictionRow = {
  podId: string;
  uniformPredictedProbabilityBySeat: number[];
  frequencyBaselinePredictedProbabilityBySeat: number[];
  modelAPredictedProbabilityBySeat?: number[];
  frozenModelAPredictedProbabilityBySeat?: number[];
  playerOnlyPredictedProbabilityBySeat?: number[];
  modelBPredictedProbabilityBySeat?: number[];
};

function loadPredictions(path: string): Map<string, number[][]> {
  const fields = [
    "uniformPredictedProbabilityBySeat",
    "frequencyBaselinePredictedProbabilityBySeat",
    "modelAPredictedProbabilityBySeat",
    "frozenModelAPredictedProbabilityBySeat",
    "playerOnlyPredictedProbabilityBySeat",
    "modelBPredictedProbabilityBySeat",
  ] as const;

  const byPod = new Map<string, Record<string, number[]>>();
  for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
    const row = JSON.parse(line) as PredictionRow;
    const entry: Record<string, number[]> = {};
    for (const field of fields) {
      const probs = row[field];
      if (probs) {
        const key = field
          .replace("PredictedProbabilityBySeat", "")
          .replace("Baseline", "")
          .replace("frozenModelA", "frozenModelA")
          .replace("modelAPredictedProbabilityBySeat", "frozenModelA");
        if (field === "modelAPredictedProbabilityBySeat") entry.frozenModelA = probs;
        else if (field === "frozenModelAPredictedProbabilityBySeat") entry.frozenModelA = probs;
        else if (field === "uniformPredictedProbabilityBySeat") entry.uniform = probs;
        else if (field === "frequencyBaselinePredictedProbabilityBySeat") entry.frequency = probs;
        else if (field === "playerOnlyPredictedProbabilityBySeat") entry.playerOnly = probs;
        else if (field === "modelBPredictedProbabilityBySeat") entry.modelB = probs;
      }
    }
    byPod.set(row.podId, entry);
  }
  return byPod as Map<string, Record<string, number[]>>;
}

function metricsFromFrozen(
  observations: ReturnType<typeof loadSplitObservations>,
  preds: Map<string, Record<string, number[]>>,
  modelKey: string,
) {
  return evaluateObservationPredictorV1(observations, (obs) => {
    const row = preds.get(obs.podId)?.[modelKey];
    if (!row) throw new Error(`Missing ${modelKey} for ${obs.podId}`);
    return row;
  });
}

async function main() {
  const manifest = loadTrainingSnapshotManifest();
  const corpus = await loadCombinedCorpus(
    manifest.topdeckSourceRuns.map((r) => r.month),
    { includeRawTournaments: false },
  );
  const testAll = filterPrimaryPodSize(
    loadSplitObservations({ manifest, corpus, split: "test" }),
  );

  const modelAPath = resolve(modelArtifactDir(MODEL_A_VERSION), "predictions-test.jsonl");
  const modelBPath = resolve(modelArtifactDir(MODEL_B_VERSION), "predictions-test.jsonl");
  const modelAPreds = loadPredictions(modelAPath);
  const modelBPreds = loadPredictions(modelBPath);

  const testAligned = testAll
    .filter((o) => modelAPreds.has(o.podId) && modelBPreds.has(o.podId))
    .sort((a, b) => a.podId.localeCompare(b.podId));

  if (testAligned.length !== 17736) {
    throw new Error(`Expected 17736 TEST pods, got ${testAligned.length}`);
  }

  const totalSeats = testAligned.reduce((s, o) => s + o.seats.length, 0);
  const podSize3 = testAligned.filter((o) => o.podSize === 3).length;
  const podSize4 = testAligned.filter((o) => o.podSize === 4).length;
  const tournamentClusters = countDistinctTournamentClusters(testAligned);

  const reconciled = {
    uniform: metricsFromFrozen(testAligned, modelBPreds, "uniform"),
    frequency: metricsFromFrozen(testAligned, modelBPreds, "frequency"),
    frozenModelA: metricsFromFrozen(testAligned, modelAPreds, "frozenModelA"),
    playerOnly: metricsFromFrozen(testAligned, modelBPreds, "playerOnly"),
    modelB: metricsFromFrozen(testAligned, modelBPreds, "modelB"),
  };

  const deprecatedBrierModelA = deprecatedModelABrierScore(testAligned, (obs) => {
    return modelAPreds.get(obs.podId)!.frozenModelA!;
  });

  const predictors = {
    uniform: (obs: (typeof testAligned)[number]) => modelBPreds.get(obs.podId)!.uniform!,
    frequency: (obs: (typeof testAligned)[number]) => modelBPreds.get(obs.podId)!.frequency!,
    frozenModelA: (obs: (typeof testAligned)[number]) => modelAPreds.get(obs.podId)!.frozenModelA!,
    playerOnly: (obs: (typeof testAligned)[number]) => modelBPreds.get(obs.podId)!.playerOnly!,
    modelB: (obs: (typeof testAligned)[number]) => modelBPreds.get(obs.podId)!.modelB!,
  };

  const bootstrapComparisons = bootstrapAllComparisons({
    rows: perPodLogLossRows({ observations: testAligned, predictors }),
    comparisons: [
      { baseline: "uniform", challenger: "frequency" },
      { baseline: "uniform", challenger: "frozenModelA" },
      { baseline: "frequency", challenger: "frozenModelA" },
      { baseline: "uniform", challenger: "playerOnly" },
      { baseline: "uniform", challenger: "modelB" },
      { baseline: "frequency", challenger: "modelB" },
      { baseline: "frozenModelA", challenger: "modelB" },
    ],
  });

  const reconciliationReport = {
    version: "commander-model-metrics-reconciliation-v1",
    generatedAt: new Date().toISOString(),
    datasetHash: EXPECTED_DATASET_HASH,
    testPrimaryPodCount: testAligned.length,
    totalSeatCount: totalSeats,
    podSizeBreakdown: { podSize3, podSize4 },
    tournamentClusterCount: tournamentClusters,
    metricDefinitions: FROZEN_METRIC_DEFINITIONS,
    brierReconciliation: {
      rootCause:
        "Model A report used deprecated normalization: sum(seat_squared_errors) / (pod_count * seats[0].length). Mixed 3/4-player TEST pods made seats[0].length an incorrect denominator.",
      oldFormula: "brierScore = sum_i (p_i - y_i)^2 / (pod_count * seats[0].length)",
      newFormula: "brierScore = sum_i (p_i - y_i)^2 / total_seat_count",
      aggregationUnitOld: "pod_count multiplied by first pod seat count (incorrect proxy)",
      aggregationUnitNew: "seat (all pod seats equally weighted)",
      logLossUnchanged: true,
      exampleDenominators: {
        podCount: testAligned.length,
        totalSeatCount: totalSeats,
        deprecatedDenominatorIfFirstPodIs4: testAligned.length * (testAligned[0]?.seats.length ?? 0),
        ratioNewOverOld: totalSeats / (testAligned.length * (testAligned[0]?.seats.length ?? 1)),
      },
      deprecatedModelABrierOnSamePredictions: deprecatedBrierModelA,
      reconciledFrozenModelABrier: reconciled.frozenModelA.brierScore,
    },
    reconciledTestMetrics: reconciled,
    bootstrapUncertainty: {
      tournamentClusterCount: tournamentClusters,
      comparisons: bootstrapComparisons,
    },
  };

  const outPath = resolve(
    modelArtifactDir(MODEL_B_VERSION),
    "metrics-reconciliation-v1.json",
  );
  writeFileSync(outPath, JSON.stringify(reconciliationReport, null, 2));

  for (const [reportName, reportPath] of [
    ["model-a-report.json", resolve(modelArtifactDir(MODEL_A_VERSION), "model-a-report.json")],
    ["model-b-report.json", resolve(modelArtifactDir(MODEL_B_VERSION), "model-b-report.json")],
  ] as const) {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as Record<string, unknown>;
    report.metricsDefinitionVersion = FROZEN_METRIC_DEFINITIONS.version;
    report.metricsReconciliation = {
      note: "TEST metrics below supersede prior brierScore values. Log loss unchanged.",
      reconciliationArtifact: outPath,
      reconciledTestPrimary: reconciled,
    };
    if (reportName === "model-a-report.json") {
      (report.metrics as Record<string, unknown>).test = {
        ...(report.metrics as Record<string, unknown>).test as object,
        uniform: reconciled.uniform,
        frequencyBaseline: reconciled.frequency,
        modelA: reconciled.frozenModelA,
      };
    }
    if (reportName === "model-b-report.json") {
      (report.metrics as Record<string, unknown>).test = {
        ...(report.metrics as Record<string, unknown>).test as object,
        ...reconciled,
      };
    }
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
  }

  console.log("Metrics reconciliation complete");
  console.log(`TEST pods: ${testAligned.length}, seats: ${totalSeats}`);
  console.log(`Tournament clusters: ${tournamentClusters}`);
  console.log(`Deprecated Model A Brier: ${deprecatedBrierModelA.toFixed(6)}`);
  console.log(`Reconciled Brier uniform=${reconciled.uniform.brierScore.toFixed(6)}`);
  console.log(`Reconciled Brier F=${reconciled.frequency.brierScore.toFixed(6)}`);
  console.log(`Reconciled Brier A=${reconciled.frozenModelA.brierScore.toFixed(6)}`);
  console.log(`Reconciled Brier B=${reconciled.modelB.brierScore.toFixed(6)}`);
  console.log(`Report: ${outPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
