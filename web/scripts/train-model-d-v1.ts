#!/usr/bin/env npx tsx
/**
 * Model D — train D0/D1 on frozen C2 baseline; validation hyperparameter selection; TEST report.
 */
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadDeckResolutionCatalog } from "./lib/load-deck-resolution-catalog";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  EXPECTED_DATASET_HASH,
  loadTrainingSnapshotManifest,
  modelArtifactDir,
  OBSERVATION_WINDOW,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import { MODEL_B_VERSION } from "../src/lib/commander-strategy/model-b/types";
import { MODEL_C_VERSION } from "../src/lib/commander-strategy/model-c/types";
import {
  buildTrainDeckHashSet,
  filterPrimaryPodSize,
  loadSplitObservations,
  podSizeDistribution,
} from "../src/lib/commander-strategy/model-a/dataset-v1";
import type { ModelAMetrics, ModelAPodObservation } from "../src/lib/commander-strategy/model-a/types";
import { fitConditionalLogitCommanderPlayer } from "../src/lib/commander-strategy/model-b/conditional-logit-commander-player-v1";
import {
  bootstrapAllComparisons,
  bootstrapDeltaLogLossCI,
  perPodLogLossRows,
  BOOTSTRAP_REPLICATES,
  BOOTSTRAP_SEED,
} from "../src/lib/commander-strategy/model-b/bootstrap-v1";
import { evaluateObservationPredictor } from "../src/lib/commander-strategy/model-b/evaluation-v1";
import {
  fitConditionalLogitDeckModel,
  modelCPredictProbabilities,
} from "../src/lib/commander-strategy/model-c/conditional-logit-deck-v1";
import {
  buildGcCountByDeckHash,
  explicitLogLossComparison,
  filterByModelCCohort,
  summarizeNoveltyCohortMembership,
} from "../src/lib/commander-strategy/model-c/evaluation-v1";
import {
  columnNamesForVariant as c2ColumnNames,
  loadFeatureMatrixRows as loadC2FeatureMatrixRows,
} from "../src/lib/commander-strategy/model-c/feature-matrix-io-v1";
import { fitFeatureStandardizer } from "../src/lib/commander-strategy/model-c/standardization-v1";
import { MODEL_C_FEATURES_ARTIFACT_VERSION } from "../src/lib/commander-strategy/model-c/feature-matrix-io-v1";
import {
  fitConditionalLogitModelD,
  modelDPredictProbabilities,
  serializeModelD,
  topMatchupCoefficients,
  type ConditionalLogitModelD,
  type ModelDBlockLambdas,
} from "../src/lib/commander-strategy/model-d/conditional-logit-deck-v1";
import {
  columnNamesForVariant as dColumnNames,
  loadFeatureMatrixRows as loadDFeatureMatrixRows,
} from "../src/lib/commander-strategy/model-d/feature-matrix-io-v1";
import { MODEL_D_FEATURES_VERSION, MODEL_D_VERSION, type ModelDVariant } from "../src/lib/commander-strategy/model-d/types";
import { MODEL_D_FEATURE_SPEC_VERSION } from "../src/lib/commander-strategy/model-d/model-d-feature-spec-v1";
import { SEMANTIC_MATCHUP_CHANNELS } from "../src/lib/commander-strategy/model-d/matchup-interaction-features-v1";

loadProjectEnvLocal();

const LAMBDA_OPPONENT = [0.01, 0.1, 1, 10] as const;
const LAMBDA_MATCHUP = [0.01, 0.1, 1, 10] as const;
const SEARCH_EPOCHS = 80;
const SEARCH_EPOCHS_SPARSE = 40;
const FINAL_EPOCHS = 200;
const FINAL_EPOCHS_SPARSE = 120;

const CHANNEL_LABELS: Record<string, string> = {
  graveyard_dep_vs_graveyard_disruption: "graveyard disruption vs opponent recursion reliance",
  spell_chain_dep_vs_counterspell: "countermagic vs opponent spell-chain reliance",
  battlefield_dep_vs_board_reset: "board reset vs opponent battlefield reliance",
  artifact_dep_vs_artifact_interaction: "artifact interaction vs opponent artifact dependence",
  creature_dep_vs_creature_removal: "creature removal vs opponent creature reliance",
  library_search_dep_vs_resource_denial: "resource denial vs opponent tutoring reliance",
  activated_dep_vs_ability_denial: "ability denial vs activated-ability reliance",
  graveyard_dep_vs_exile_removal: "exile pressure vs graveyard reliance",
  token_profile_vs_board_reset: "mass removal vs token/go-wide profile",
  card_engine_vs_resource_denial: "resource denial vs card-engine density",
  recursion_vs_graveyard_disruption: "graveyard disruption vs recursion density",
  attack_vuln_dot: "attack vectors vs opponent vulnerability profile",
};

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function assertAuthorized(): void {
  const qaPath = resolve(
    modelArtifactDir(MODEL_D_FEATURES_VERSION),
    "commander-model-d-feature-generation-qa-v1.json",
  );
  if (!existsSync(qaPath)) throw new Error(`Missing Model D feature QA: ${qaPath}`);
  const qa = JSON.parse(readFileSync(qaPath, "utf8")) as {
    qaVerdict?: string;
    paperPopulationProvenance?: { pass?: boolean };
  };
  if (qa.paperPopulationProvenance?.pass !== true) {
    throw new Error("Paper-population provenance assertion must PASS before Model D training.");
  }
  if (qa.qaVerdict !== "PASS") {
    throw new Error(`Model D feature QA verdict not acceptable: ${qa.qaVerdict}`);
  }
}

function splitNames(variant: ModelDVariant | "C2") {
  const names = variant === "C2" ? c2ColumnNames("C2") : dColumnNames(variant);
  return {
    denseColumnNames: names.filter((n) => !n.startsWith("card_id_")),
    cardIdColumnNames: names.filter((n) => n.startsWith("card_id_")),
  };
}

function trainRows(observations: ModelAPodObservation[], rows: Map<string, { denseValues: number[] }>) {
  return observations.flatMap((obs) =>
    obs.seats.map((seat) => rows.get(`${obs.podId}:${seat.seatIndex}`)).filter(Boolean),
  );
}

function validationLoss(
  observations: ModelAPodObservation[],
  model: ConditionalLogitModelD,
  rows: Map<string, import("../src/lib/commander-strategy/model-c/feature-matrix-io-v1").LoadedFeatureRow>,
): number {
  return evaluateObservationPredictor(observations, (obs) => modelDPredictProbabilities(obs, model, rows)).logLoss;
}

function buildMatchupExplanation(input: {
  obs: ModelAPodObservation;
  model: ConditionalLogitModelD;
  rows: Map<string, import("../src/lib/commander-strategy/model-c/feature-matrix-io-v1").LoadedFeatureRow>;
  featureMeans: Map<string, number>;
}): Record<string, unknown> {
  const probs = modelDPredictProbabilities(input.obs, input.model, input.rows);
  const favIdx = probs.indexOf(Math.max(...probs));
  const rowKey = `${input.obs.podId}:${favIdx}`;
  const row = input.rows.get(rowKey);
  if (!row) return { podId: input.obs.podId, note: "missing row" };

  const contributions: Array<{ label: string; feature: string; rawValue: number; coefficient: number; score: number }> =
    [];
  for (let j = 0; j < input.model.columnNames.length; j += 1) {
    const name = input.model.columnNames[j]!;
    if (!name.startsWith("match_")) continue;
    const coef = input.model.coefficients[j] ?? 0;
    const raw = row.denseValues[j] ?? 0;
    if (Math.abs(raw) < 1e-8) continue;
    const body = name.slice("match_".length).replace(/_(mean|max|min)AcrossOpponents$/, "");
    const label = CHANNEL_LABELS[body] ?? body;
    contributions.push({ label, feature: name, rawValue: raw, coefficient: coef, score: coef * raw });
  }
  contributions.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  const advantages = contributions.filter((c) => c.score > 0).slice(0, 4);
  const disadvantages = contributions.filter((c) => c.score < 0).slice(0, 4);

  return {
    podId: input.obs.podId,
    podSize: input.obs.podSize,
    predictedFavoriteSeat: favIdx,
    predictedWinProbability: probs[favIdx],
    deckHashes: input.obs.seats.map((s) => s.deckHash),
    deckAdvantages: advantages.map((a) => `+ ${a.label}`),
    deckDisadvantages: disadvantages.map((d) => `- ${d.label}`),
    topContributions: contributions.slice(0, 8),
  };
}

async function main() {
  assertAuthorized();

  const c2Hyper = JSON.parse(
    readFileSync(resolve(modelArtifactDir(MODEL_C_VERSION), "hyperparameters.json"), "utf8"),
  ) as { variants: { C2: { lambdas: ModelDBlockLambdas; cardIdSupportCutoff: number } } };
  const frozenC2 = c2Hyper.variants.C2!;

  const manifest = loadTrainingSnapshotManifest();
  const corpus = await loadCombinedCorpus(manifest.topdeckSourceRuns.map((r) => r.month), {
    includeRawTournaments: false,
  });
  const catalog = await loadDeckResolutionCatalog();
  const train = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "train" }));
  const val = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "validation" }));
  const test = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "test" }));
  const testAligned = test.sort((a, b) => a.podId.localeCompare(b.podId));

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

  const featureRows = {
    C2: {
      train: await loadC2FeatureMatrixRows({ split: "train", variant: "C2" }),
      validation: await loadC2FeatureMatrixRows({ split: "validation", variant: "C2" }),
      test: await loadC2FeatureMatrixRows({ split: "test", variant: "C2" }),
    },
    D0: {
      train: await loadDFeatureMatrixRows({ split: "train", variant: "D0" }),
      validation: await loadDFeatureMatrixRows({ split: "validation", variant: "D0" }),
      test: await loadDFeatureMatrixRows({ split: "test", variant: "D0" }),
    },
    D1: {
      train: await loadDFeatureMatrixRows({ split: "train", variant: "D1" }),
      validation: await loadDFeatureMatrixRows({ split: "validation", variant: "D1" }),
      test: await loadDFeatureMatrixRows({ split: "test", variant: "D1" }),
    },
  };

  const c2Names = splitNames("C2");
  const c2Standardizer = fitFeatureStandardizer({
    rows: trainRows(train, featureRows.C2.train),
    columnCount: c2Names.denseColumnNames.length,
  });

  console.log("Refitting frozen C2 baseline on TRAIN...");
  const modelC2 = fitConditionalLogitDeckModel({
    variant: "C2",
    trainObservations: train,
    featureRowsByKey: featureRows.C2.train,
    frozenB,
    columnNames: c2Names.denseColumnNames,
    denseColumnNames: c2Names.denseColumnNames,
    cardIdColumnNames: c2Names.cardIdColumnNames,
    standardizer: c2Standardizer,
    lambdas: frozenC2.lambdas,
    cardIdSupportCutoff: frozenC2.cardIdSupportCutoff,
    epochs: FINAL_EPOCHS_SPARSE,
  });

  const d0Names = splitNames("D0");
  const d0Standardizer = fitFeatureStandardizer({
    rows: trainRows(train, featureRows.D0.train),
    columnCount: d0Names.denseColumnNames.length,
  });

  console.log("Validation search: D0 lambdaOpponentContext...");
  let bestD0Lambda = 0.01;
  let bestD0Val = Infinity;
  const d0SearchLog: Array<{ lambdaOpponentContext: number; validationLogLoss: number }> = [];
  for (const lambdaOpponentContext of LAMBDA_OPPONENT) {
    const lambdas: ModelDBlockLambdas = {
      ...frozenC2.lambdas,
      lambdaOpponentContext,
      lambdaSemanticMatchup: 0.01,
    };
    const model = fitConditionalLogitModelD({
      variant: "D0",
      trainObservations: train,
      featureRowsByKey: featureRows.D0.train,
      frozenB,
      denseColumnNames: d0Names.denseColumnNames,
      cardIdColumnNames: d0Names.cardIdColumnNames,
      standardizer: d0Standardizer,
      lambdas,
      cardIdSupportCutoff: frozenC2.cardIdSupportCutoff,
      epochs: SEARCH_EPOCHS_SPARSE,
    });
    const loss = validationLoss(val, model, featureRows.D0.validation);
    d0SearchLog.push({ lambdaOpponentContext, validationLogLoss: loss });
    if (loss < bestD0Val) {
      bestD0Val = loss;
      bestD0Lambda = lambdaOpponentContext;
    }
  }

  console.log("Validation search: D1 lambdaSemanticMatchup...");
  let bestD1Lambda = 0.01;
  let bestD1Val = Infinity;
  const d1SearchLog: Array<{ lambdaSemanticMatchup: number; validationLogLoss: number }> = [];
  for (const lambdaSemanticMatchup of LAMBDA_MATCHUP) {
    const lambdas: ModelDBlockLambdas = {
      ...frozenC2.lambdas,
      lambdaOpponentContext: bestD0Lambda,
      lambdaSemanticMatchup,
    };
    const model = fitConditionalLogitModelD({
      variant: "D1",
      trainObservations: train,
      featureRowsByKey: featureRows.D1.train,
      frozenB,
      denseColumnNames: splitNames("D1").denseColumnNames,
      cardIdColumnNames: d0Names.cardIdColumnNames,
      standardizer: fitFeatureStandardizer({
        rows: trainRows(train, featureRows.D1.train),
        columnCount: splitNames("D1").denseColumnNames.length,
      }),
      lambdas,
      cardIdSupportCutoff: frozenC2.cardIdSupportCutoff,
      epochs: SEARCH_EPOCHS_SPARSE,
    });
    const loss = validationLoss(val, model, featureRows.D1.validation);
    d1SearchLog.push({ lambdaSemanticMatchup, validationLogLoss: loss });
    if (loss < bestD1Val) {
      bestD1Val = loss;
      bestD1Lambda = lambdaSemanticMatchup;
    }
  }

  const d1Names = splitNames("D1");
  const d1Standardizer = fitFeatureStandardizer({
    rows: trainRows(train, featureRows.D1.train),
    columnCount: d1Names.denseColumnNames.length,
  });

  console.log("Final TRAIN refit: D0, D1...");
  const modelD0 = fitConditionalLogitModelD({
    variant: "D0",
    trainObservations: train,
    featureRowsByKey: featureRows.D0.train,
    frozenB,
    denseColumnNames: d0Names.denseColumnNames,
    cardIdColumnNames: d0Names.cardIdColumnNames,
    standardizer: d0Standardizer,
    lambdas: {
      ...frozenC2.lambdas,
      lambdaOpponentContext: bestD0Lambda,
      lambdaSemanticMatchup: 0.01,
    },
    cardIdSupportCutoff: frozenC2.cardIdSupportCutoff,
    epochs: FINAL_EPOCHS_SPARSE,
  });

  const modelD1 = fitConditionalLogitModelD({
    variant: "D1",
    trainObservations: train,
    featureRowsByKey: featureRows.D1.train,
    frozenB,
    denseColumnNames: d1Names.denseColumnNames,
    cardIdColumnNames: d0Names.cardIdColumnNames,
    standardizer: d1Standardizer,
    lambdas: {
      ...frozenC2.lambdas,
      lambdaOpponentContext: bestD0Lambda,
      lambdaSemanticMatchup: bestD1Lambda,
    },
    cardIdSupportCutoff: frozenC2.cardIdSupportCutoff,
    epochs: FINAL_EPOCHS_SPARSE,
  });

  const predictors = {
    C2: (obs: ModelAPodObservation) => modelCPredictProbabilities(obs, modelC2, featureRows.C2.test),
    D0: (obs: ModelAPodObservation) => modelDPredictProbabilities(obs, modelD0, featureRows.D0.test),
    D1: (obs: ModelAPodObservation) => modelDPredictProbabilities(obs, modelD1, featureRows.D1.test),
  };

  const testMetrics = Object.fromEntries(
    (["C2", "D0", "D1"] as const).map((name) => [
      name,
      evaluateObservationPredictor(testAligned, predictors[name]),
    ]),
  ) as Record<"C2" | "D0" | "D1", ModelAMetrics>;

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
  const trainDeckHashes = buildTrainDeckHashSet(train);
  const cohortInput = {
    trainDeckHashes,
    trainPlayers: new Set(train.flatMap((o) => o.seats.map((s) => s.playerHash))),
    trainPlayerAppearances: new Map<string, number>(),
    trainOracleIds,
    deckByHash,
    featureRowsByKey: featureRows.D0.test,
    gcCountByDeckHash: buildGcCountByDeckHash(featureRows.C2.test, c2Names.denseColumnNames),
  };

  const cohortNames = [
    "all",
    "deckHashNeverSeenInTrain",
    "cardNoveltyAtLeast1",
    "cardNoveltyAtLeast5",
    "cardNoveltyAtLeast10",
  ] as const;

  const testCohorts: Record<string, Record<string, ModelAMetrics>> = {};
  for (const cohort of cohortNames) {
    const filtered =
      cohort === "all"
        ? testAligned
        : filterByModelCCohort(testAligned, cohort, cohortInput);
    if (filtered.length === 0) continue;
    testCohorts[cohort] = Object.fromEntries(
      (["C2", "D0", "D1"] as const).map((m) => [m, evaluateObservationPredictor(filtered, predictors[m])]),
    );
  }

  const podSizeCohorts = {
    podSize3: testAligned.filter((o) => o.podSize === 3),
    podSize4: testAligned.filter((o) => o.podSize === 4),
  };
  const testPodSizeMetrics = Object.fromEntries(
    Object.entries(podSizeCohorts).map(([label, obs]) => [
      label,
      Object.fromEntries(
        (["C2", "D0", "D1"] as const).map((m) => [m, evaluateObservationPredictor(obs, predictors[m])]),
      ),
    ]),
  );

  const comparisons = [
    { baseline: "C2", challenger: "D0" },
    { baseline: "D0", challenger: "D1" },
    { baseline: "C2", challenger: "D1" },
  ] as const;

  const bootstrapRows = perPodLogLossRows({ observations: testAligned, predictors });
  const bootstrap = bootstrapAllComparisons({
    rows: bootstrapRows,
    comparisons: [...comparisons],
  });

  const bootstrapByCohort: Record<
    string,
    Record<string, ReturnType<typeof bootstrapDeltaLogLossCI> & { baseline: string; challenger: string }>
  > = {};
  for (const cohort of cohortNames) {
    const filtered =
      cohort === "all"
        ? testAligned
        : filterByModelCCohort(testAligned, cohort, cohortInput);
    if (filtered.length < 50) continue;
    const rows = perPodLogLossRows({ observations: filtered, predictors });
    bootstrapByCohort[cohort] = Object.fromEntries(
      comparisons.map(({ baseline, challenger }) => {
        const row = bootstrapDeltaLogLossCI({ rows, baselineModel: baseline, challengerModel: challenger });
        return [
          `${challenger} vs ${baseline}`,
          { ...row, baseline, challenger },
        ];
      }),
    );
  }

  const featureMeans = new Map<string, number>();
  const matchCols = d1Names.denseColumnNames.filter((n) => n.startsWith("match_"));
  for (const col of matchCols) {
    const idx = d1Names.denseColumnNames.indexOf(col);
    let sum = 0;
    let n = 0;
    for (const row of featureRows.D1.train.values()) {
      sum += row.denseValues[idx] ?? 0;
      n += 1;
    }
    featureMeans.set(col, n > 0 ? sum / n : 0);
  }

  const matchupCoefInterpretation = topMatchupCoefficients(modelD1, 36).map((row) => ({
    ...row,
    channelLabel: CHANNEL_LABELS[row.channel] ?? row.channel,
    trainPrevalenceMean: featureMeans.get(row.feature) ?? null,
  }));

  const explanationPods = testAligned
    .filter((_, i) => i % Math.max(1, Math.floor(testAligned.length / 8)) === 0)
    .slice(0, 8);
  const matchupExplanations = explanationPods.map((obs) =>
    buildMatchupExplanation({ obs, model: modelD1, rows: featureRows.D1.test, featureMeans }),
  );

  const outDir = modelArtifactDir(MODEL_D_VERSION);
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    resolve(outDir, "hyperparameters.json"),
    JSON.stringify(
      {
        selectedOnSplit: "validation",
        frozenC2HyperparametersSource: MODEL_C_VERSION,
        D0: {
          lambdas: modelD0.lambdas,
          cardIdSupportCutoff: modelD0.cardIdSupportCutoff,
          validationLogLoss: bestD0Val,
          searchLog: d0SearchLog,
        },
        D1: {
          lambdas: modelD1.lambdas,
          cardIdSupportCutoff: modelD1.cardIdSupportCutoff,
          validationLogLoss: bestD1Val,
          searchLog: d1SearchLog,
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(resolve(outDir, "coefficients-D0.json"), JSON.stringify(serializeModelD(modelD0), null, 2));
  writeFileSync(resolve(outDir, "coefficients-D1.json"), JSON.stringify(serializeModelD(modelD1), null, 2));

  const logLoss = Object.fromEntries(
    (["C2", "D0", "D1"] as const).map((m) => [m, testMetrics[m]!.logLoss]),
  );

  const report = {
    modelVersion: MODEL_D_VERSION,
    featureSpecVersion: MODEL_D_FEATURE_SPEC_VERSION,
    featureArtifactVersion: MODEL_D_FEATURES_VERSION,
    frozenIndividualDeckBaseline: { model: MODEL_C_VERSION, variant: "C2" },
    frozenModelBVersion: MODEL_B_VERSION,
    datasetHash: EXPECTED_DATASET_HASH,
    gitSha: gitSha(),
    trainingTimestamp: new Date().toISOString(),
    observationWindow: OBSERVATION_WINDOW,
    authorization: {
      modelC: "ACCEPTED_FROZEN",
      modelDSpec: "ACCEPTED_FROZEN",
      modelDFeatureQA: "PASS",
      paperPopulationProvenance: "PASS",
      modelDTraining: "COMPLETE",
      prospectiveHoldout: "SEALED",
      rc8: "FROZEN",
    },
    comparisonConvention: {
      deltaLogLoss: "loss(baseline) - loss(challenger)",
      positiveDeltaMeans: "challenger better (lower log loss)",
    },
    primaryComparisons: {
      "D1 vs D0": explicitLogLossComparison({ baseline: "D0", challenger: "D1", logLossByModel: logLoss }),
      "D0 vs C2": explicitLogLossComparison({ baseline: "C2", challenger: "D0", logLossByModel: logLoss }),
      "D1 vs C2": explicitLogLossComparison({ baseline: "C2", challenger: "D1", logLossByModel: logLoss }),
    },
    metrics: { test: testMetrics, testCohorts, testPodSizeMetrics },
    bootstrapUncertainty: {
      method: "paired_tournament_cluster_bootstrap_percentile_ci",
      seed: BOOTSTRAP_SEED,
      replicates: BOOTSTRAP_REPLICATES,
      clusterUnit: "tournamentId",
      clusterCount: new Set(testAligned.map((o) => o.tournamentId)).size,
      allTest: Object.fromEntries(
        bootstrap.map((row) => [
          row.comparison.replace("_vs_", " vs "),
          {
            baseline: row.comparison.split("_vs_")[1],
            challenger: row.comparison.split("_vs_")[0],
            deltaLogLoss: row.deltaLogLoss,
            ciLower: row.ciLower,
            ciUpper: row.ciUpper,
          },
        ]),
      ),
      byCohort: bootstrapByCohort,
    },
    cohortPredicates: {
      cardNovelty: summarizeNoveltyCohortMembership({
        observations: testAligned,
        trainOracleIds,
        deckByHash,
        threshold: 1,
      }),
    },
    matchupChannelInterpretation: {
      disclaimer: "Predictive associations — not causal matchup claims. Do not modify RC8 from TEST.",
      channels: matchupCoefInterpretation,
      frozenChannelDefinitions: SEMANTIC_MATCHUP_CHANNELS,
    },
    diagnosticMatchupExplanations: {
      disclaimer: "Explanatory only — not used as training features.",
      samples: matchupExplanations,
    },
    dataCounts: {
      trainPods: train.length,
      validationPods: val.length,
      testPods: testAligned.length,
      podSizeDistribution: podSizeDistribution(test),
    },
    reportHash: "",
  };

  report.reportHash = createHash("sha256")
    .update(JSON.stringify({ ...report, reportHash: undefined }))
    .digest("hex");

  writeFileSync(resolve(outDir, "model-d-report.json"), JSON.stringify(report, null, 2));

  console.log("Model D training complete");
  console.log(
    `TEST log loss C2=${testMetrics.C2!.logLoss.toFixed(4)} D0=${testMetrics.D0!.logLoss.toFixed(4)} D1=${testMetrics.D1!.logLoss.toFixed(4)}`,
  );
  console.log(`Report: ${resolve(outDir, "model-d-report.json")}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
