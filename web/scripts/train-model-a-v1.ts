#!/usr/bin/env npx tsx
/**
 * Model A — CommanderConfiguration-only conditional-logit baseline.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  EXPECTED_DATASET_HASH,
  loadTrainingSnapshotManifest,
  modelArtifactDir,
  OBSERVATION_WINDOW,
  trainingSnapshotDir,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import {
  buildTrainCommanderConfigSet,
  buildTrainDeckHashSet,
  countTrainCommanderAppearances,
  filterPrimaryPodSize,
  loadSplitObservations,
  podSizeDistribution,
} from "../src/lib/commander-strategy/model-a/dataset-v1";
import { fitFrequencyBaseline, frequencyBaselineProbabilities, uniformProbabilities } from "../src/lib/commander-strategy/model-a/baselines-v1";
import {
  fitConditionalLogit,
  impliedNeutralFourPodWinProbability,
  modelAProbabilities,
  serializeConditionalLogitModel,
} from "../src/lib/commander-strategy/model-a/conditional-logit-v1";
import {
  evaluateAllCohorts,
  evaluateFrequencyBaseline,
  evaluateModelA,
  evaluateUniformBaseline,
} from "../src/lib/commander-strategy/model-a/evaluation-v1";
import {
  commanderSupportBucket,
  podMinSupportBucket,
  SUPPORT_BUCKET_THRESHOLDS,
} from "../src/lib/commander-strategy/model-a/support-buckets-v1";
import {
  MODEL_A_VERSION,
  type CommanderStrengthRow,
  type ModelAHyperparameters,
  type ModelAPodObservation,
  type ModelAPredictionRow,
} from "../src/lib/commander-strategy/model-a/types";

loadProjectEnvLocal();

const L2_CANDIDATES = [0.001, 0.01, 0.1, 1, 10, 50];
const FREQUENCY_SHRINKAGE_ALPHA = 1;

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function patchSnapshotObservationWindowLabels(): void {
  const manifestPath = resolve(trainingSnapshotDir(), "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  manifest.observationWindow = OBSERVATION_WINDOW;
  manifest.requestedSourceWindowStart = OBSERVATION_WINDOW.requestedSourceWindowStart;
  manifest.requestedSourceWindowEnd = OBSERVATION_WINDOW.requestedSourceWindowEnd;
  manifest.observationCutoff = OBSERVATION_WINDOW.observationCutoff;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  const splitsPath = resolve(trainingSnapshotDir(), "chronological-splits-v1.json");
  const splits = JSON.parse(readFileSync(splitsPath, "utf8")) as Record<string, unknown>;
  splits.observationWindow = OBSERVATION_WINDOW;
  splits.testPeriodLabel = OBSERVATION_WINDOW.testPeriodLabel;
  writeFileSync(splitsPath, JSON.stringify(splits, null, 2));
}

function seatAppearanceMap(
  stats: Map<string, { seatAppearances: number; podAppearances: number; wins: number }>,
): Map<string, number> {
  return new Map([...stats.entries()].map(([id, row]) => [id, row.seatAppearances]));
}

function buildPredictionRows(input: {
  observations: ModelAPodObservation[];
  split: "validation" | "test";
  modelA: ReturnType<typeof fitConditionalLogit>;
  frequencyModel: ReturnType<typeof fitFrequencyBaseline>;
  trainDeckHashes: Set<string>;
  trainCommanderConfigs: Set<string>;
  trainSeatAppearances: Map<string, number>;
  datasetHash: string;
}): ModelAPredictionRow[] {
  return input.observations.map((obs) => {
    const configIds = obs.seats.map((s) => s.commanderConfigurationId);
    const modelProbs = modelAProbabilities(configIds, input.modelA);
    const uniform = uniformProbabilities(obs.podSize);
    const frequency = frequencyBaselineProbabilities(configIds, input.frequencyModel);
    const deckHashSeenInTrain = obs.seats.every(
      (s) => !s.deckHash.startsWith("unresolved:") && input.trainDeckHashes.has(s.deckHash),
    );
    const commanderConfigSeenInTrain = configIds.every((id) => input.trainCommanderConfigs.has(id));

    return {
      podId: obs.podId,
      tournamentId: obs.tournamentId,
      tournamentDate: obs.tournamentDate,
      podSize: obs.podSize,
      split: input.split,
      seats: obs.seats.map((s) => ({
        seatIndex: s.seatIndex,
        playerHash: s.playerHash,
        commanderConfigurationId: s.commanderConfigurationId,
        deckHash: s.deckHash,
        winner: s.winner,
      })),
      actualWinnerSeat: obs.winnerSeatIndex,
      predictedProbabilityBySeat: modelProbs,
      uniformPredictedProbabilityBySeat: uniform,
      frequencyBaselinePredictedProbabilityBySeat: frequency,
      modelAPredictedProbabilityBySeat: modelProbs,
      commanderSupportBucket: podMinSupportBucket(configIds, input.trainSeatAppearances),
      deckHashSeenInTrain,
      commanderConfigSeenInTrain,
      modelVersion: MODEL_A_VERSION,
      datasetHash: input.datasetHash,
    };
  });
}

function writeJsonl(path: string, rows: ModelAPredictionRow[]): void {
  writeFileSync(path, rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : ""));
}

function buildCommanderStrengthTable(input: {
  stats: Map<string, { seatAppearances: number; podAppearances: number; wins: number }>;
  modelA: ReturnType<typeof fitConditionalLogit>;
}): CommanderStrengthRow[] {
  const rows: CommanderStrengthRow[] = [];
  for (const [configId, stat] of input.stats.entries()) {
    const idx = input.modelA.configToIndex.get(configId);
    const utility = idx !== undefined ? input.modelA.coefficients[idx] ?? 0 : input.modelA.unseenUtility;
    rows.push({
      commanderConfigurationId: configId,
      trainingSeatAppearances: stat.seatAppearances,
      trainingPodAppearances: stat.podAppearances,
      trainingWins: stat.wins,
      observedTrainWinRate: stat.seatAppearances > 0 ? stat.wins / stat.seatAppearances : 0,
      modelEstimatedUtility: utility,
      impliedNeutralFourPodWinProbability: impliedNeutralFourPodWinProbability(utility),
      supportBucket: commanderSupportBucket(stat.seatAppearances),
      seenInTrain: true,
    });
  }
  rows.sort((a, b) => b.modelEstimatedUtility - a.modelEstimatedUtility);
  return rows;
}

async function main() {
  patchSnapshotObservationWindowLabels();

  const manifest = loadTrainingSnapshotManifest();
  const months = manifest.topdeckSourceRuns.map((r) => r.month);
  const corpus = await loadCombinedCorpus(months, { includeRawTournaments: false });

  const trainAll = loadSplitObservations({ manifest, corpus, split: "train" });
  const valAll = loadSplitObservations({ manifest, corpus, split: "validation" });
  const testAll = loadSplitObservations({ manifest, corpus, split: "test" });

  const train = filterPrimaryPodSize(trainAll);
  const val = filterPrimaryPodSize(valAll);
  const test = filterPrimaryPodSize(testAll);

  const commanderStats = countTrainCommanderAppearances(train);
  const trainSeatAppearances = seatAppearanceMap(commanderStats);
  const trainDeckHashes = buildTrainDeckHashSet(train);
  const trainCommanderConfigs = buildTrainCommanderConfigSet(train);

  let bestLambda = L2_CANDIDATES[0]!;
  let bestValLogLoss = Infinity;
  const lambdaSearch: Array<{ l2Lambda: number; validationLogLoss: number }> = [];

  for (const l2Lambda of L2_CANDIDATES) {
    const candidate = fitConditionalLogit({ trainObservations: train, l2Lambda });
    const valMetrics = evaluateModelA(val, candidate);
    lambdaSearch.push({ l2Lambda, validationLogLoss: valMetrics.logLoss });
    if (valMetrics.logLoss < bestValLogLoss) {
      bestValLogLoss = valMetrics.logLoss;
      bestLambda = l2Lambda;
    }
  }

  const hyperparameters: ModelAHyperparameters = {
    l2Lambda: bestLambda,
    learningRate: 0.05,
    epochs: 250,
    frequencyBaselineShrinkageAlpha: FREQUENCY_SHRINKAGE_ALPHA,
    supportBuckets: {
      highMinTrainAppearances: SUPPORT_BUCKET_THRESHOLDS.highMinTrainAppearances,
      mediumMinTrainAppearances: SUPPORT_BUCKET_THRESHOLDS.mediumMinTrainAppearances,
    },
    primaryPodSizes: [3, 4],
    selectedOnSplit: "validation",
  };

  const modelA = fitConditionalLogit({
    trainObservations: train,
    l2Lambda: hyperparameters.l2Lambda,
    learningRate: hyperparameters.learningRate,
    epochs: hyperparameters.epochs,
  });
  const frequencyModel = fitFrequencyBaseline({
    trainObservations: train,
    shrinkageAlpha: FREQUENCY_SHRINKAGE_ALPHA,
  });

  const outDir = modelArtifactDir(MODEL_A_VERSION);
  mkdirSync(outDir, { recursive: true });

  const valPredictions = buildPredictionRows({
    observations: val,
    split: "validation",
    modelA,
    frequencyModel,
    trainDeckHashes,
    trainCommanderConfigs,
    trainSeatAppearances,
    datasetHash: EXPECTED_DATASET_HASH,
  });
  const testPredictions = buildPredictionRows({
    observations: test,
    split: "test",
    modelA,
    frequencyModel,
    trainDeckHashes,
    trainCommanderConfigs,
    trainSeatAppearances,
    datasetHash: EXPECTED_DATASET_HASH,
  });

  writeJsonl(resolve(outDir, "predictions-validation.jsonl"), valPredictions);
  writeJsonl(resolve(outDir, "predictions-test.jsonl"), testPredictions);

  const commanderStrength = buildCommanderStrengthTable({ stats: commanderStats, modelA });
  const supportDistribution: Record<string, number> = { high: 0, medium: 0, low: 0, unseen: 0 };
  for (const row of commanderStats.values()) {
    const bucket = commanderSupportBucket(row.seatAppearances);
    supportDistribution[bucket] = (supportDistribution[bucket] ?? 0) + 1;
  }

  const testCohorts = evaluateAllCohorts({
    observations: test,
    frequencyModel,
    modelA,
    trainDeckHashes,
    trainCommanderConfigs,
    trainSeatAppearances,
  });

  const report = {
    modelVersion: MODEL_A_VERSION,
    label:
      "Tournament-corpus Model A estimate from TopDeck EDH competitive population Sep 2025–Aug 11 2026. Not an objective commander power ranking.",
    datasetHash: EXPECTED_DATASET_HASH,
    gitSha: gitSha(),
    trainingTimestamp: new Date().toISOString(),
    observationWindow: OBSERVATION_WINDOW,
    hyperparameters,
    lambdaSearch,
    dataCounts: {
      trainPodsPrimary: train.length,
      validationPodsPrimary: val.length,
      testPodsPrimary: test.length,
      trainPodsAllSizes: trainAll.length,
      validationPodsAllSizes: valAll.length,
      testPodsAllSizes: testAll.length,
      trainCommanderConfigurations: trainCommanderConfigs.size,
      podSizeDistribution: {
        train: podSizeDistribution(trainAll),
        validation: podSizeDistribution(valAll),
        test: podSizeDistribution(testAll),
      },
    },
    metrics: {
      validation: {
        uniform: evaluateUniformBaseline(val),
        frequencyBaseline: evaluateFrequencyBaseline(val, frequencyModel),
        modelA: evaluateModelA(val, modelA),
      },
      test: {
        uniform: evaluateUniformBaseline(test),
        frequencyBaseline: evaluateFrequencyBaseline(test, frequencyModel),
        modelA: evaluateModelA(test, modelA),
        cohorts: testCohorts,
      },
    },
    commanderSupportDistribution: supportDistribution,
    commanderStrengthExploratory: {
      topByModelUtility: commanderStrength.slice(0, 25),
      bottomByModelUtility: [...commanderStrength].slice(-25).reverse(),
    },
    artifacts: {
      predictionsValidation: resolve(outDir, "predictions-validation.jsonl"),
      predictionsTest: resolve(outDir, "predictions-test.jsonl"),
      coefficients: resolve(outDir, "coefficients.json"),
      commanderStrengthTable: resolve(outDir, "commander-strength-table.json"),
      hyperparameters: resolve(outDir, "hyperparameters.json"),
    },
    reportHash: "",
  };

  report.reportHash = createHash("sha256")
    .update(JSON.stringify({ ...report, reportHash: undefined }))
    .digest("hex");

  writeFileSync(resolve(outDir, "hyperparameters.json"), JSON.stringify(hyperparameters, null, 2));
  writeFileSync(resolve(outDir, "coefficients.json"), JSON.stringify(serializeConditionalLogitModel(modelA), null, 2));
  writeFileSync(resolve(outDir, "commander-strength-table.json"), JSON.stringify(commanderStrength, null, 2));
  writeFileSync(resolve(outDir, "model-a-report.json"), JSON.stringify(report, null, 2));

  console.log("Model A training complete");
  console.log(`datasetHash: ${EXPECTED_DATASET_HASH}`);
  console.log(`selected l2Lambda: ${bestLambda} (validation log loss ${bestValLogLoss.toFixed(4)})`);
  console.log(`TRAIN primary pods: ${train.length}`);
  console.log(`VALIDATION primary pods: ${val.length}`);
  console.log(`TEST primary pods: ${test.length}`);
  console.log(`TEST Model A log loss: ${report.metrics.test.modelA.logLoss.toFixed(4)}`);
  console.log(`TEST uniform log loss: ${report.metrics.test.uniform.logLoss.toFixed(4)}`);
  console.log(`TEST top-seat accuracy: ${(report.metrics.test.modelA.topPredictedSeatAccuracy * 100).toFixed(2)}%`);
  console.log(`Report: ${resolve(outDir, "model-a-report.json")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
