#!/usr/bin/env npx tsx
/**
 * Model C — train C0/G/C1/ID/C2 on frozen B utilities + deck feature blocks.
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
import { MODEL_B_VERSION } from "../src/lib/commander-strategy/model-b/types";
import {
  buildTrainCommanderConfigSet,
  buildTrainDeckHashSet,
  filterPrimaryPodSize,
  loadSplitObservations,
  podSizeDistribution,
} from "../src/lib/commander-strategy/model-a/dataset-v1";
import { fitFrequencyBaseline, frequencyBaselineProbabilities, uniformProbabilities } from "../src/lib/commander-strategy/model-a/baselines-v1";
import { fitConditionalLogitCommanderPlayer } from "../src/lib/commander-strategy/model-b/conditional-logit-commander-player-v1";
import {
  bootstrapAllComparisons,
  perPodLogLossRows,
  BOOTSTRAP_REPLICATES,
  BOOTSTRAP_SEED,
} from "../src/lib/commander-strategy/model-b/bootstrap-v1";
import {
  evaluateObservationPredictor,
  loadFrozenModelAPredictions,
} from "../src/lib/commander-strategy/model-b/evaluation-v1";
import { buildTrainPlayerSet, countTrainPlayerAppearances } from "../src/lib/commander-strategy/model-b/player-support-v1";
import {
  fitConditionalLogitDeckModel,
  modelCPredictProbabilities,
  serializeDeckModel,
  type ConditionalLogitDeckModel,
  type ModelCBlockLambdas,
} from "../src/lib/commander-strategy/model-c/conditional-logit-deck-v1";
import {
  buildGcCountByDeckHash,
  filterByModelCCohort,
  loadFrozenModelBPredictions,
  type ModelCCohortFilter,
} from "../src/lib/commander-strategy/model-c/evaluation-v1";
import {
  columnNamesForVariant,
  loadFeatureMatrixRows,
} from "../src/lib/commander-strategy/model-c/feature-matrix-io-v1";
import { fitFeatureStandardizer } from "../src/lib/commander-strategy/model-c/standardization-v1";
import { MODEL_C_FEATURES_ARTIFACT_VERSION } from "../src/lib/commander-strategy/model-c/feature-matrix-io-v1";
import { MODEL_C_FEATURE_SPEC_VERSION } from "../src/lib/commander-strategy/model-c/model-c-feature-spec-v1";
import { MODEL_C_VERSION, type ModelCVariant } from "../src/lib/commander-strategy/model-c/types";
import type { ModelAMetrics, ModelAPodObservation } from "../src/lib/commander-strategy/model-a/types";

loadProjectEnvLocal();

const VARIANTS: ModelCVariant[] = ["C0", "G", "C1", "ID", "C2"];
const LAMBDA_BASIC = [0.01, 0.1, 1, 10] as const;
const LAMBDA_GC = [0.01, 0.1, 1, 10] as const;
const LAMBDA_SEMANTIC = [0.01, 0.1, 1, 10] as const;
const LAMBDA_CARD_ID = [0.1, 1, 10, 100] as const;
const CARD_SUPPORT_CUTOFFS = [1, 3, 5] as const;
const SEARCH_EPOCHS = 80;
const SEARCH_EPOCHS_SPARSE = 40;
const FINAL_EPOCHS = 200;
const FINAL_EPOCHS_SPARSE = 120;
const FREQUENCY_SHRINKAGE_ALPHA = 1;

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function assertFrozenBaselines(): void {
  for (const model of [MODEL_A_VERSION, MODEL_B_VERSION]) {
    for (const split of ["validation", "test"] as const) {
      const path = resolve(modelArtifactDir(model), `predictions-${split}.jsonl`);
      if (!existsSync(path)) throw new Error(`Missing frozen predictions: ${path}`);
    }
  }
  const qaPath = resolve(
    modelArtifactDir(MODEL_C_FEATURES_ARTIFACT_VERSION),
    "commander-model-c-feature-generation-qa-v3.json",
  );
  if (!existsSync(qaPath)) throw new Error(`Missing accepted feature QA v3: ${qaPath}`);
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

function splitColumnNames(variant: ModelCVariant): { denseColumnNames: string[]; cardIdColumnNames: string[] } {
  const names = columnNamesForVariant(variant);
  return {
    denseColumnNames: names.filter((n) => !n.startsWith("card_id_")),
    cardIdColumnNames: names.filter((n) => n.startsWith("card_id_")),
  };
}

function trainRowsForObs(
  observations: ModelAPodObservation[],
  featureRows: Map<string, import("../src/lib/commander-strategy/model-c/feature-matrix-io-v1").LoadedFeatureRow>,
) {
  return observations.flatMap((obs) =>
    obs.seats
      .map((seat) => featureRows.get(`${obs.podId}:${seat.seatIndex}`))
      .filter(Boolean),
  ) as import("../src/lib/commander-strategy/model-c/feature-matrix-io-v1").LoadedFeatureRow[];
}

async function selectHyperparameters(input: {
  variant: ModelCVariant;
  train: ModelAPodObservation[];
  val: ModelAPodObservation[];
  trainFeatures: Map<string, import("../src/lib/commander-strategy/model-c/feature-matrix-io-v1").LoadedFeatureRow>;
  valFeatures: Map<string, import("../src/lib/commander-strategy/model-c/feature-matrix-io-v1").LoadedFeatureRow>;
  frozenB: ReturnType<typeof fitConditionalLogitCommanderPlayer>;
  denseColumnNames: string[];
  cardIdColumnNames: string[];
  inheritedLambdas?: Partial<ModelCBlockLambdas>;
}): Promise<{
  lambdas: ModelCBlockLambdas;
  cardIdSupportCutoff: number;
  validationLogLoss: number;
  searchLog: unknown[];
}> {
  const standardizer = fitFeatureStandardizer({
    rows: trainRowsForObs(input.train, input.trainFeatures),
    columnCount: input.denseColumnNames.length,
  });

  const searchLog: unknown[] = [];
  let bestLoss = Infinity;
  let best: ModelCBlockLambdas = {
    lambdaBasic: input.inheritedLambdas?.lambdaBasic ?? LAMBDA_BASIC[0]!,
    lambdaGameChanger: input.inheritedLambdas?.lambdaGameChanger ?? LAMBDA_GC[0]!,
    lambdaSemantic: input.inheritedLambdas?.lambdaSemantic ?? LAMBDA_SEMANTIC[0]!,
    lambdaCardIdentity: input.inheritedLambdas?.lambdaCardIdentity ?? LAMBDA_CARD_ID[0]!,
  };
  let bestCutoff: number = CARD_SUPPORT_CUTOFFS[0]!;

  const tryCandidate = (lambdas: ModelCBlockLambdas, cardIdSupportCutoff: number) => {
    const searchEpochs =
      input.variant === "ID" || input.variant === "C2" ? SEARCH_EPOCHS_SPARSE : SEARCH_EPOCHS;
    const model = fitConditionalLogitDeckModel({
      variant: input.variant,
      trainObservations: input.train,
      featureRowsByKey: input.trainFeatures,
      frozenB: input.frozenB,
      columnNames: input.denseColumnNames,
      denseColumnNames: input.denseColumnNames,
      cardIdColumnNames: input.cardIdColumnNames,
      standardizer,
      lambdas,
      cardIdSupportCutoff,
      epochs: searchEpochs,
    });
    const metrics = evaluateObservationPredictor(input.val, (obs) =>
      modelCPredictProbabilities(obs, model, input.valFeatures),
    );
    searchLog.push({ lambdas, cardIdSupportCutoff, validationLogLoss: metrics.logLoss });
    if (metrics.logLoss < bestLoss) {
      bestLoss = metrics.logLoss;
      best = lambdas;
      bestCutoff = cardIdSupportCutoff;
    }
  };

  const basicCandidates = input.variant === "C0" ? LAMBDA_BASIC : [best.lambdaBasic];
  const gcCandidates = input.variant === "G" ? LAMBDA_GC : [best.lambdaGameChanger];
  const semanticCandidates = input.variant === "C1" ? LAMBDA_SEMANTIC : [best.lambdaSemantic];
  const cardIdCandidates =
    input.variant === "ID" || input.variant === "C2" ? LAMBDA_CARD_ID : [best.lambdaCardIdentity];
  const supportCandidates =
    input.variant === "ID" || input.variant === "C2" ? CARD_SUPPORT_CUTOFFS : [999999];

  for (const lambdaBasic of basicCandidates) {
    for (const lambdaGameChanger of gcCandidates) {
      for (const lambdaSemantic of semanticCandidates) {
        for (const lambdaCardIdentity of cardIdCandidates) {
          for (const cardIdSupportCutoff of supportCandidates) {
            tryCandidate(
              { lambdaBasic, lambdaGameChanger, lambdaSemantic, lambdaCardIdentity },
              cardIdSupportCutoff,
            );
          }
        }
      }
    }
  }

  return {
    lambdas: best,
    cardIdSupportCutoff: bestCutoff,
    validationLogLoss: bestLoss,
    searchLog,
  };
}

async function main() {
  assertFrozenBaselines();

  const manifest = loadTrainingSnapshotManifest();
  const months = manifest.topdeckSourceRuns.map((r) => r.month);
  const corpus = await loadCombinedCorpus(months, { includeRawTournaments: false });

  const train = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "train" }));
  const val = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "validation" }));
  const test = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "test" }));

  const frozenValA = loadFrozenModelAPredictions(
    resolve(modelArtifactDir(MODEL_A_VERSION), "predictions-validation.jsonl"),
  );
  const frozenTestA = loadFrozenModelAPredictions(
    resolve(modelArtifactDir(MODEL_A_VERSION), "predictions-test.jsonl"),
  );
  const frozenValB = loadFrozenModelBPredictions(
    resolve(modelArtifactDir(MODEL_B_VERSION), "predictions-validation.jsonl"),
  );
  const frozenTestB = loadFrozenModelBPredictions(
    resolve(modelArtifactDir(MODEL_B_VERSION), "predictions-test.jsonl"),
  );

  const valAligned = alignToFrozenPods(val, new Set(frozenValB.keys()));
  const testAligned = alignToFrozenPods(test, new Set(frozenTestB.keys()));

  const bHyper = JSON.parse(
    readFileSync(resolve(modelArtifactDir(MODEL_B_VERSION), "hyperparameters.json"), "utf8"),
  ) as { lambdaCommander: number; lambdaPlayer: number; learningRate: number; epochs: number };

  const frozenB = fitConditionalLogitCommanderPlayer({
    trainObservations: train,
    mode: "commander_player",
    lambdaCommander: bHyper.lambdaCommander,
    lambdaPlayer: bHyper.lambdaPlayer,
    learningRate: bHyper.learningRate,
    epochs: bHyper.epochs,
  });

  const trainDeckHashes = buildTrainDeckHashSet(train);
  const trainCommanderConfigs = buildTrainCommanderConfigSet(train);
  const trainPlayers = buildTrainPlayerSet(train);
  const trainPlayerAppearances = new Map(
    [...countTrainPlayerAppearances(train).entries()].map(([id, row]) => [id, row.seatAppearances]),
  );
  const frequencyModel = fitFrequencyBaseline({
    trainObservations: train,
    shrinkageAlpha: FREQUENCY_SHRINKAGE_ALPHA,
  });

  const deckByHash = new Map(
    corpus.combined.decks
      .filter((d) => d.deckHash && !d.deckHash.startsWith("unresolved:"))
      .map((d) => [d.deckHash, d] as const),
  );

  const trainOracleIds = new Set<string>();
  for (const obs of train) {
    for (const seat of obs.seats) {
      const deck = deckByHash.get(seat.deckHash);
      if (!deck) continue;
      const commanderSet = new Set(deck.commanderOracleIds);
      for (const card of deck.mainboard) {
        if (!card.oracleId || !card.paperEligible) continue;
        if (commanderSet.has(card.oracleId)) continue;
        trainOracleIds.add(card.oracleId);
      }
    }
  }

  const featureRows = {
    train: {} as Record<ModelCVariant, Awaited<ReturnType<typeof loadFeatureMatrixRows>>>,
    validation: {} as Record<ModelCVariant, Awaited<ReturnType<typeof loadFeatureMatrixRows>>>,
    test: {} as Record<ModelCVariant, Awaited<ReturnType<typeof loadFeatureMatrixRows>>>,
  };

  for (const variant of VARIANTS) {
    featureRows.train[variant] = await loadFeatureMatrixRows({ split: "train", variant });
    featureRows.validation[variant] = await loadFeatureMatrixRows({ split: "validation", variant });
    featureRows.test[variant] = await loadFeatureMatrixRows({ split: "test", variant });
  }

  const gcCountByDeckHash = buildGcCountByDeckHash(
    featureRows.test.G,
    splitColumnNames("G").denseColumnNames,
  );

  const hyperparamResults: Record<string, unknown> = {};
  const models: Partial<Record<ModelCVariant, ConditionalLogitDeckModel>> = {};
  let inheritedLambdas: Partial<ModelCBlockLambdas> = {};

  for (const variant of VARIANTS) {
    const { denseColumnNames, cardIdColumnNames } = splitColumnNames(variant);
    console.log(`Selecting hyperparameters for ${variant}...`);
    const selected = await selectHyperparameters({
      variant,
      train,
      val: valAligned,
      trainFeatures: featureRows.train[variant]!,
      valFeatures: featureRows.validation[variant]!,
      frozenB,
      denseColumnNames,
      cardIdColumnNames,
      inheritedLambdas,
    });
    hyperparamResults[variant] = selected;
    inheritedLambdas = { ...selected.lambdas };

    const standardizer = fitFeatureStandardizer({
      rows: trainRowsForObs(train, featureRows.train[variant]!),
      columnCount: denseColumnNames.length,
    });

    models[variant] = fitConditionalLogitDeckModel({
      variant,
      trainObservations: train,
      featureRowsByKey: featureRows.train[variant]!,
      frozenB,
      columnNames: denseColumnNames,
      denseColumnNames,
      cardIdColumnNames,
      standardizer,
      lambdas: selected.lambdas,
      cardIdSupportCutoff: selected.cardIdSupportCutoff,
      epochs: variant === "ID" || variant === "C2" ? FINAL_EPOCHS_SPARSE : FINAL_EPOCHS,
      learningRate: 0.05,
    });
    console.log(
      `${variant} val log loss=${selected.validationLogLoss.toFixed(4)} λ_basic=${selected.lambdas.lambdaBasic}`,
    );
  }

  type PredictorMap = Record<string, (obs: ModelAPodObservation) => number[]>;
  const buildPredictors = (split: "validation" | "test"): PredictorMap => {
    const frozenA = split === "validation" ? frozenValA : frozenTestA;
    const frozenBMap = split === "validation" ? frozenValB : frozenTestB;
    const predictors: PredictorMap = {
      uniform: (obs) => uniformProbabilities(obs.podSize),
      frequency: (obs) =>
        frequencyBaselineProbabilities(
          obs.seats.map((s) => s.commanderConfigurationId),
          frequencyModel,
        ),
      frozenModelA: (obs) => frozenA.get(obs.podId)!,
      frozenModelB: (obs) => frozenBMap.get(obs.podId)!,
    };
    for (const variant of VARIANTS) {
      const model = models[variant]!;
      const rows = featureRows[split][variant]!;
      predictors[variant] = (obs) => modelCPredictProbabilities(obs, model, rows);
    }
    return predictors;
  };

  const evaluateBundle = (
    observations: ModelAPodObservation[],
    predictors: PredictorMap,
  ): Record<string, ModelAMetrics> => {
    const out: Record<string, ModelAMetrics> = {};
    for (const [name, predict] of Object.entries(predictors)) {
      out[name] = evaluateObservationPredictor(observations, predict);
    }
    return out;
  };

  const valPredictors = buildPredictors("validation");
  const testPredictors = buildPredictors("test");
  const valMetrics = evaluateBundle(valAligned, valPredictors);
  const testMetrics = evaluateBundle(testAligned, testPredictors);

  const cohortNames: ModelCCohortFilter[] = [
    "all",
    "deckHashNeverSeenInTrain",
    "deckHashSeenInTrain",
    "cardNoveltyAtLeast1",
    "cardNoveltyAtLeast5",
    "cardNoveltyAtLeast10",
    "podSize3",
    "podSize4",
    "gameChangerCount0",
    "gameChangerCount1",
    "gameChangerCount2",
    "gameChangerCount3",
    "gameChangerCount4Plus",
  ];

  const cohortFilterInput = {
    trainDeckHashes,
    trainPlayers,
    trainPlayerAppearances,
    trainOracleIds,
    deckByHash,
    featureRowsByKey: featureRows.test.G,
    gcCountByDeckHash,
  };

  const testCohorts: Record<string, Record<string, ModelAMetrics>> = {};
  for (const cohort of cohortNames) {
    const filtered = filterByModelCCohort(testAligned, cohort, cohortFilterInput);
    if (filtered.length === 0) continue;
    testCohorts[cohort] = evaluateBundle(filtered, testPredictors);
  }

  const testLogLossRows = perPodLogLossRows({
    observations: testAligned,
    predictors: testPredictors,
  });

  const bootstrapComparisons = bootstrapAllComparisons({
    rows: testLogLossRows,
    comparisons: [
      { baseline: "frozenModelB", challenger: "C0" },
      { baseline: "C0", challenger: "G" },
      { baseline: "G", challenger: "C1" },
      { baseline: "G", challenger: "ID" },
      { baseline: "C1", challenger: "ID" },
      { baseline: "C1", challenger: "C2" },
      { baseline: "ID", challenger: "C2" },
      { baseline: "uniform", challenger: "C1" },
      { baseline: "frequency", challenger: "C1" },
      { baseline: "frozenModelA", challenger: "C1" },
      { baseline: "frozenModelB", challenger: "C1" },
    ],
  });

  const semanticLiftByGcBand = Object.fromEntries(
    (["gameChangerCount0", "gameChangerCount1", "gameChangerCount2", "gameChangerCount3", "gameChangerCount4Plus"] as const).map(
      (cohort) => {
        const filtered = filterByModelCCohort(testAligned, cohort, cohortFilterInput);
        if (filtered.length < 50) return [cohort, { podCount: filtered.length, note: "insufficient sample" }];
        const gMetrics = evaluateObservationPredictor(filtered, testPredictors.G!);
        const c1Metrics = evaluateObservationPredictor(filtered, testPredictors.C1!);
        return [
          cohort,
          {
            podCount: filtered.length,
            logLossG: gMetrics.logLoss,
            logLossC1: c1Metrics.logLoss,
            deltaLogLoss_C1_minus_G: gMetrics.logLoss - c1Metrics.logLoss,
          },
        ];
      },
    ),
  );

  const outDir = modelArtifactDir(MODEL_C_VERSION);
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    resolve(outDir, "hyperparameters.json"),
    JSON.stringify({ selectedOnSplit: "validation", variants: hyperparamResults }, null, 2),
  );

  for (const variant of VARIANTS) {
    writeFileSync(
      resolve(outDir, `coefficients-${variant}.json`),
      JSON.stringify(serializeDeckModel(models[variant]!), null, 2),
    );
  }

  const report = {
    modelVersion: MODEL_C_VERSION,
    featureSpecVersion: MODEL_C_FEATURE_SPEC_VERSION,
    featureArtifactVersion: MODEL_C_FEATURES_ARTIFACT_VERSION,
    frozenModelAVersion: MODEL_A_VERSION,
    frozenModelBVersion: MODEL_B_VERSION,
    datasetHash: EXPECTED_DATASET_HASH,
    gitSha: gitSha(),
    trainingTimestamp: new Date().toISOString(),
    observationWindow: OBSERVATION_WINDOW,
    authorization: {
      featureQAv3: "ACCEPTED_FROZEN",
      modelCTraining: "COMPLETE",
      testScoring: "COMPLETE",
      modelD: "WAIT",
      prospectiveHoldout: "SEALED",
      rc8: "FROZEN",
    },
    hyperparameters: hyperparamResults,
    dataCounts: {
      trainPodsPrimary: train.length,
      validationPodsPrimary: valAligned.length,
      testPodsPrimary: testAligned.length,
      testTournamentClusters: new Set(testAligned.map((o) => o.tournamentId)).size,
      podSizeDistribution: {
        train: podSizeDistribution(loadSplitObservations({ manifest, corpus, split: "train" })),
        test: podSizeDistribution(loadSplitObservations({ manifest, corpus, split: "test" })),
      },
    },
    metrics: {
      validation: valMetrics,
      test: testMetrics,
      testCohorts,
    },
    primaryComparisons: {
      "C0 vs B": {
        testDeltaLogLoss: testMetrics.frozenModelB!.logLoss - testMetrics.C0!.logLoss,
        interpretation: "Ordinary deck construction beyond commander+player",
      },
      "G vs C0": {
        testDeltaLogLoss: testMetrics.C0!.logLoss - testMetrics.G!.logLoss,
        interpretation: "Official Game Changer signal beyond structure",
      },
      "C1 vs G": {
        testDeltaLogLoss: testMetrics.G!.logLoss - testMetrics.C1!.logLoss,
        interpretation: "PRIMARY SEMANTIC TEST — RC8 beyond Game Changers",
      },
      "ID vs G": {
        testDeltaLogLoss: testMetrics.G!.logLoss - testMetrics.ID!.logLoss,
        interpretation: "Exact card identity beyond structure + Game Changers",
      },
      "C1 vs ID": {
        testDeltaLogLoss: testMetrics.ID!.logLoss - testMetrics.C1!.logLoss,
        interpretation: "SEMANTICS VS MEMORIZATION",
      },
      "C2 vs C1": {
        testDeltaLogLoss: testMetrics.C1!.logLoss - testMetrics.C2!.logLoss,
        interpretation: "Identity after semantics",
      },
      "C2 vs ID": {
        testDeltaLogLoss: testMetrics.ID!.logLoss - testMetrics.C2!.logLoss,
        interpretation: "Semantics after identity",
      },
    },
    semanticLiftByGameChangerBand: semanticLiftByGcBand,
    bootstrapUncertainty: {
      method: "paired_tournament_cluster_bootstrap_percentile_ci",
      seed: BOOTSTRAP_SEED,
      replicates: BOOTSTRAP_REPLICATES,
      clusterUnit: "tournamentId",
      comparisons: bootstrapComparisons,
    },
    coefficientInterpretation: {
      note: "Predictive associations on TRAIN-standardized features — not causal effects or universal card-power rankings.",
      C0: serializeDeckModel(models.C0!),
      G: serializeDeckModel(models.G!),
      C1: serializeDeckModel(models.C1!),
      ID: serializeDeckModel(models.ID!),
      C2: serializeDeckModel(models.C2!),
    },
    artifacts: {
      hyperparameters: resolve(outDir, "hyperparameters.json"),
      report: resolve(outDir, "model-c-report.json"),
    },
    reportHash: "",
  };

  report.reportHash = createHash("sha256")
    .update(JSON.stringify({ ...report, reportHash: undefined }))
    .digest("hex");

  writeFileSync(resolve(outDir, "model-c-report.json"), JSON.stringify(report, null, 2));

  console.log("Model C training complete");
  console.log(`TEST pods: ${testAligned.length}`);
  console.log(`TEST log loss B=${testMetrics.frozenModelB!.logLoss.toFixed(4)} C0=${testMetrics.C0!.logLoss.toFixed(4)} G=${testMetrics.G!.logLoss.toFixed(4)} C1=${testMetrics.C1!.logLoss.toFixed(4)} ID=${testMetrics.ID!.logLoss.toFixed(4)} C2=${testMetrics.C2!.logLoss.toFixed(4)}`);
  console.log(`Report: ${resolve(outDir, "model-c-report.json")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
