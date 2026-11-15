#!/usr/bin/env npx tsx
/**
 * Model B — CommanderConfiguration + player strength conditional-logit baseline.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  EXPECTED_DATASET_HASH,
  loadTrainingSnapshotManifest,
  modelArtifactDir,
  OBSERVATION_WINDOW,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import { MODEL_A_VERSION } from "../src/lib/commander-strategy/model-a/types";
import {
  buildTrainCommanderConfigSet,
  buildTrainDeckHashSet,
  countTrainCommanderAppearances,
  filterPrimaryPodSize,
  loadSplitObservations,
  podSizeDistribution,
} from "../src/lib/commander-strategy/model-a/dataset-v1";
import { fitFrequencyBaseline, uniformProbabilities, frequencyBaselineProbabilities } from "../src/lib/commander-strategy/model-a/baselines-v1";
import {
  fitConditionalLogitCommanderPlayer,
  modelBPredictProbabilities,
  serializeCommanderPlayerModel,
} from "../src/lib/commander-strategy/model-b/conditional-logit-commander-player-v1";
import {
  bootstrapAllComparisons,
  perPodLogLossRows,
  BOOTSTRAP_REPLICATES,
  BOOTSTRAP_SEED,
} from "../src/lib/commander-strategy/model-b/bootstrap-v1";
import {
  buildPredictorBundle,
  evaluateObservationPredictor,
  filterByModelBCohort,
  loadFrozenModelAPredictions,
} from "../src/lib/commander-strategy/model-b/evaluation-v1";
import {
  buildTrainPlayerSet,
  computePlayerCoverageStats,
  countTrainPlayerAppearances,
} from "../src/lib/commander-strategy/model-b/player-support-v1";
import {
  MODEL_B_VERSION,
  type ModelBEvaluationBundle,
  type ModelBPredictionRow,
} from "../src/lib/commander-strategy/model-b/types";

loadProjectEnvLocal();

const LAMBDA_COMMANDER_CANDIDATES = [0.001, 0.01, 0.1, 1];
const LAMBDA_PLAYER_CANDIDATES = [0.1, 1, 10, 100, 1000];
const PLAYER_ONLY_LAMBDA_CANDIDATES = [0.1, 1, 10, 100, 1000];
const FREQUENCY_SHRINKAGE_ALPHA = 1;

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function assertFrozenModelA(): void {
  const frozenTestPath = resolve(
    modelArtifactDir(MODEL_A_VERSION),
    "predictions-test.jsonl",
  );
  if (!existsSync(frozenTestPath)) {
    throw new Error(`Frozen Model A predictions missing: ${frozenTestPath}`);
  }
}

function alignToFrozenPods<T extends { podId: string }>(
  observations: T[],
  frozenPodIds: Set<string>,
): T[] {
  const aligned = observations.filter((o) => frozenPodIds.has(o.podId));
  if (aligned.length !== frozenPodIds.size) {
    throw new Error(
      `Frozen pod alignment mismatch: observations=${aligned.length} frozen=${frozenPodIds.size}`,
    );
  }
  return aligned.sort((a, b) => a.podId.localeCompare(b.podId));
}

async function main() {
  assertFrozenModelA();

  const manifest = loadTrainingSnapshotManifest();
  const months = manifest.topdeckSourceRuns.map((r) => r.month);
  const corpus = await loadCombinedCorpus(months, { includeRawTournaments: false });

  const trainAll = loadSplitObservations({ manifest, corpus, split: "train" });
  const valAll = loadSplitObservations({ manifest, corpus, split: "validation" });
  const testAll = loadSplitObservations({ manifest, corpus, split: "test" });

  const train = filterPrimaryPodSize(trainAll);
  const val = filterPrimaryPodSize(valAll);
  const test = filterPrimaryPodSize(testAll);

  const frozenValPath = resolve(modelArtifactDir(MODEL_A_VERSION), "predictions-validation.jsonl");
  const frozenTestPath = resolve(modelArtifactDir(MODEL_A_VERSION), "predictions-test.jsonl");
  const frozenValPredictions = loadFrozenModelAPredictions(frozenValPath);
  const frozenTestPredictions = loadFrozenModelAPredictions(frozenTestPath);

  const valAligned = alignToFrozenPods(val, new Set(frozenValPredictions.keys()));
  const testAligned = alignToFrozenPods(test, new Set(frozenTestPredictions.keys()));

  const commanderStats = countTrainCommanderAppearances(train);
  const trainSeatAppearances = new Map(
    [...commanderStats.entries()].map(([id, row]) => [id, row.seatAppearances]),
  );
  const trainDeckHashes = buildTrainDeckHashSet(train);
  const trainCommanderConfigs = buildTrainCommanderConfigSet(train);
  const trainPlayerStats = countTrainPlayerAppearances(train);
  const trainPlayerAppearances = new Map(
    [...trainPlayerStats.entries()].map(([id, row]) => [id, row.seatAppearances]),
  );
  const trainPlayers = buildTrainPlayerSet(train);

  const frequencyModel = fitFrequencyBaseline({
    trainObservations: train,
    shrinkageAlpha: FREQUENCY_SHRINKAGE_ALPHA,
  });

  let bestPlayerOnlyLambda = PLAYER_ONLY_LAMBDA_CANDIDATES[0]!;
  let bestPlayerOnlyValLoss = Infinity;
  for (const lambdaPlayer of PLAYER_ONLY_LAMBDA_CANDIDATES) {
    const candidate = fitConditionalLogitCommanderPlayer({
      trainObservations: train,
      mode: "player_only",
      lambdaCommander: 0,
      lambdaPlayer,
    });
    const metrics = evaluateObservationPredictor(valAligned, (obs) =>
      modelBPredictProbabilities(obs, candidate),
    );
    if (metrics.logLoss < bestPlayerOnlyValLoss) {
      bestPlayerOnlyValLoss = metrics.logLoss;
      bestPlayerOnlyLambda = lambdaPlayer;
    }
  }

  let bestLambdaCommander = LAMBDA_COMMANDER_CANDIDATES[0]!;
  let bestLambdaPlayer = LAMBDA_PLAYER_CANDIDATES[0]!;
  let bestModelBValLoss = Infinity;
  const lambdaSearch: Array<{
    lambdaCommander: number;
    lambdaPlayer: number;
    validationLogLoss: number;
  }> = [];

  for (const lambdaCommander of LAMBDA_COMMANDER_CANDIDATES) {
    for (const lambdaPlayer of LAMBDA_PLAYER_CANDIDATES) {
      const candidate = fitConditionalLogitCommanderPlayer({
        trainObservations: train,
        mode: "commander_player",
        lambdaCommander,
        lambdaPlayer,
      });
      const metrics = evaluateObservationPredictor(valAligned, (obs) =>
        modelBPredictProbabilities(obs, candidate),
      );
      lambdaSearch.push({
        lambdaCommander,
        lambdaPlayer,
        validationLogLoss: metrics.logLoss,
      });
      if (metrics.logLoss < bestModelBValLoss) {
        bestModelBValLoss = metrics.logLoss;
        bestLambdaCommander = lambdaCommander;
        bestLambdaPlayer = lambdaPlayer;
      }
    }
  }

  const playerOnlyModel = fitConditionalLogitCommanderPlayer({
    trainObservations: train,
    mode: "player_only",
    lambdaCommander: 0,
    lambdaPlayer: bestPlayerOnlyLambda,
  });

  const modelB = fitConditionalLogitCommanderPlayer({
    trainObservations: train,
    mode: "commander_player",
    lambdaCommander: bestLambdaCommander,
    lambdaPlayer: bestLambdaPlayer,
  });

  const predictorsForSplit = (frozenModelAByPodId: Map<string, number[]>) =>
    buildPredictorBundle({
      frequencyModel,
      frozenModelAByPodId,
      playerOnlyModel,
      modelB,
    });

  function evaluateBundle(
    observations: typeof testAligned,
    predictors: ReturnType<typeof buildPredictorBundle>,
  ): ModelBEvaluationBundle {
    return {
      uniform: evaluateObservationPredictor(observations, predictors.uniform),
      frequency: evaluateObservationPredictor(observations, predictors.frequency),
      frozenModelA: evaluateObservationPredictor(observations, predictors.frozenModelA),
      playerOnly: evaluateObservationPredictor(observations, predictors.playerOnly),
      modelB: evaluateObservationPredictor(observations, predictors.modelB),
    };
  }

  const valPredictors = predictorsForSplit(frozenValPredictions);
  const testPredictors = predictorsForSplit(frozenTestPredictions);

  const valMetrics = evaluateBundle(valAligned, valPredictors);
  const testMetrics = evaluateBundle(testAligned, testPredictors);

  const testLogLossRows = perPodLogLossRows({
    observations: testAligned,
    predictors: testPredictors,
  });

  const bootstrapComparisons = bootstrapAllComparisons({
    rows: testLogLossRows,
    comparisons: [
      { baseline: "uniform", challenger: "frequency" },
      { baseline: "uniform", challenger: "frozenModelA" },
      { baseline: "frequency", challenger: "frozenModelA" },
      { baseline: "uniform", challenger: "playerOnly" },
      { baseline: "uniform", challenger: "modelB" },
      { baseline: "frequency", challenger: "modelB" },
      { baseline: "frozenModelA", challenger: "modelB" },
      { baseline: "playerOnly", challenger: "modelB" },
    ],
  });

  const cohortNames: Array<Parameters<typeof filterByModelBCohort>[1]> = [
    "all",
    "deckHashNeverSeenInTrain",
    "allPlayersSeenInTrain",
    "anyPlayerUnseenInTrain",
    "winnerPlayerHighSupport",
    "winnerPlayerMediumSupport",
    "winnerPlayerLowSupport",
    "winnerPlayerUnseen",
    "podSize3",
    "podSize4",
  ];

  const testCohorts: Record<string, ModelBEvaluationBundle> = {};
  for (const cohort of cohortNames) {
    const filtered = filterByModelBCohort(testAligned, cohort, {
      trainDeckHashes,
      trainPlayers,
      trainPlayerAppearances,
    });
    testCohorts[cohort] = evaluateBundle(filtered, testPredictors);
  }

  const playerCoverage = computePlayerCoverageStats({
    trainObservations: train,
    testObservations: testAligned,
  });

  const outDir = modelArtifactDir(MODEL_B_VERSION);
  mkdirSync(outDir, { recursive: true });

  function buildPredictionRows(
    observations: typeof testAligned,
    split: "validation" | "test",
    frozenModelA: Map<string, number[]>,
  ): ModelBPredictionRow[] {
    return observations.map((obs) => {
      const configIds = obs.seats.map((s) => s.commanderConfigurationId);
      const uniform = uniformProbabilities(obs.podSize);
      const frequency = frequencyBaselineProbabilities(configIds, frequencyModel);
      const frozenA = frozenModelA.get(obs.podId)!;
      const playerOnly = modelBPredictProbabilities(obs, playerOnlyModel);
      const modelBProbs = modelBPredictProbabilities(obs, modelB);
      const allPlayersSeen = obs.seats.every((s) => trainPlayers.has(s.playerHash));
      const anyPlayerUnseen = obs.seats.some((s) => !trainPlayers.has(s.playerHash));
      const deckHashSeenInTrain = obs.seats.every(
        (s) => !s.deckHash.startsWith("unresolved:") && trainDeckHashes.has(s.deckHash),
      );

      return {
        podId: obs.podId,
        tournamentId: obs.tournamentId,
        tournamentDate: obs.tournamentDate,
        podSize: obs.podSize,
        split,
        seats: obs.seats.map((s) => ({
          seatIndex: s.seatIndex,
          playerHash: s.playerHash,
          commanderConfigurationId: s.commanderConfigurationId,
          deckHash: s.deckHash,
          winner: s.winner,
        })),
        actualWinnerSeat: obs.winnerSeatIndex,
        uniformPredictedProbabilityBySeat: uniform,
        frequencyBaselinePredictedProbabilityBySeat: frequency,
        frozenModelAPredictedProbabilityBySeat: frozenA,
        playerOnlyPredictedProbabilityBySeat: playerOnly,
        modelBPredictedProbabilityBySeat: modelBProbs,
        deckHashSeenInTrain,
        commanderConfigSeenInTrain: configIds.every((id) => trainCommanderConfigs.has(id)),
        allPlayersSeenInTrain: allPlayersSeen,
        anyPlayerUnseenInTrain: anyPlayerUnseen,
        modelVersion: MODEL_B_VERSION,
        frozenModelAVersion: MODEL_A_VERSION,
        datasetHash: EXPECTED_DATASET_HASH,
      };
    });
  }

  const valPredictions = buildPredictionRows(valAligned, "validation", frozenValPredictions);
  const testPredictions = buildPredictionRows(testAligned, "test", frozenTestPredictions);

  writeFileSync(
    resolve(outDir, "predictions-validation.jsonl"),
    valPredictions.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );
  writeFileSync(
    resolve(outDir, "predictions-test.jsonl"),
    testPredictions.map((r) => JSON.stringify(r)).join("\n") + "\n",
  );

  const hyperparameters = {
    lambdaCommander: bestLambdaCommander,
    lambdaPlayer: bestLambdaPlayer,
    playerOnlyLambdaPlayer: bestPlayerOnlyLambda,
    learningRate: 0.05,
    epochs: 250,
    selectedOnSplit: "validation" as const,
  };

  writeFileSync(resolve(outDir, "hyperparameters.json"), JSON.stringify(hyperparameters, null, 2));
  writeFileSync(
    resolve(outDir, "coefficients-model-b.json"),
    JSON.stringify(serializeCommanderPlayerModel(modelB), null, 2),
  );
  writeFileSync(
    resolve(outDir, "coefficients-player-only.json"),
    JSON.stringify(serializeCommanderPlayerModel(playerOnlyModel), null, 2),
  );

  const report = {
    modelVersion: MODEL_B_VERSION,
    frozenModelAVersion: MODEL_A_VERSION,
    label:
      "Tournament-corpus Model B estimate: CommanderConfiguration + player strength. Player strength from TRAIN only; unseen players utility=0.",
    datasetHash: EXPECTED_DATASET_HASH,
    gitSha: gitSha(),
    trainingTimestamp: new Date().toISOString(),
    observationWindow: OBSERVATION_WINDOW,
    hyperparameters,
    lambdaSearch,
    playerOnlyLambdaSearchNote: `Selected playerOnlyLambdaPlayer=${bestPlayerOnlyLambda} on validation`,
    playerCoverage,
    dataCounts: {
      trainPodsPrimary: train.length,
      validationPodsPrimary: valAligned.length,
      testPodsPrimary: testAligned.length,
      trainCommanderConfigurations: trainCommanderConfigs.size,
      trainPlayers: trainPlayers.size,
      podSizeDistribution: {
        train: podSizeDistribution(trainAll),
        validation: podSizeDistribution(valAll),
        test: podSizeDistribution(testAll),
      },
    },
    metrics: {
      validation: valMetrics,
      test: {
        ...testMetrics,
        cohorts: testCohorts,
      },
    },
    calibrationComparison: {
      frequency: testMetrics.frequency.calibrationBins,
      frozenModelA: testMetrics.frozenModelA.calibrationBins,
      modelB: testMetrics.modelB.calibrationBins,
    },
    bootstrapUncertainty: {
      method: "paired_tournament_cluster_bootstrap_percentile_ci",
      seed: BOOTSTRAP_SEED,
      replicates: BOOTSTRAP_REPLICATES,
      clusterUnit: "tournamentId",
      comparisons: bootstrapComparisons,
    },
    modelGate: {
      modelC: "wait_for_model_b_report",
      modelD: "wait",
    },
    artifacts: {
      predictionsValidation: resolve(outDir, "predictions-validation.jsonl"),
      predictionsTest: resolve(outDir, "predictions-test.jsonl"),
      hyperparameters: resolve(outDir, "hyperparameters.json"),
      coefficientsModelB: resolve(outDir, "coefficients-model-b.json"),
      coefficientsPlayerOnly: resolve(outDir, "coefficients-player-only.json"),
    },
    reportHash: "",
  };

  report.reportHash = createHash("sha256")
    .update(JSON.stringify({ ...report, reportHash: undefined }))
    .digest("hex");

  writeFileSync(resolve(outDir, "model-b-report.json"), JSON.stringify(report, null, 2));

  console.log("Model B training complete");
  console.log(`datasetHash: ${EXPECTED_DATASET_HASH}`);
  console.log(`TEST primary pods: ${testAligned.length}`);
  console.log(`λ_commander=${bestLambdaCommander} λ_player=${bestLambdaPlayer}`);
  console.log(`player-only λ_player=${bestPlayerOnlyLambda}`);
  console.log(`TEST log loss uniform=${testMetrics.uniform.logLoss.toFixed(4)}`);
  console.log(`TEST log loss frequency=${testMetrics.frequency.logLoss.toFixed(4)}`);
  console.log(`TEST log loss frozen Model A=${testMetrics.frozenModelA.logLoss.toFixed(4)}`);
  console.log(`TEST log loss player-only=${testMetrics.playerOnly.logLoss.toFixed(4)}`);
  console.log(`TEST log loss Model B=${testMetrics.modelB.logLoss.toFixed(4)}`);
  console.log(`Report: ${resolve(outDir, "model-b-report.json")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
