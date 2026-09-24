#!/usr/bin/env npx tsx
/**
 * Model D2 — TRAIN fitting + VALIDATION hyperparameter selection on frozen C2 offset.
 * Does NOT score TEST or prospective holdout.
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
  trainingSnapshotDir,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import { MODEL_B_VERSION } from "../src/lib/commander-strategy/model-b/types";
import { MODEL_C_VERSION } from "../src/lib/commander-strategy/model-c/types";
import { filterPrimaryPodSize, loadSplitObservations } from "../src/lib/commander-strategy/model-a/dataset-v1";
import type { ModelAMetrics, ModelAPodObservation } from "../src/lib/commander-strategy/model-a/types";
import { fitConditionalLogitCommanderPlayer } from "../src/lib/commander-strategy/model-b/conditional-logit-commander-player-v1";
import { evaluateObservationPredictor } from "../src/lib/commander-strategy/model-b/evaluation-v1";
import {
  fitConditionalLogitDeckModel,
  modelCPredictProbabilities,
  type ConditionalLogitDeckModel,
} from "../src/lib/commander-strategy/model-c/conditional-logit-deck-v1";
import { explicitLogLossComparison } from "../src/lib/commander-strategy/model-c/evaluation-v1";
import {
  columnNamesForVariant as c2ColumnNames,
  loadFeatureMatrixRows as loadC2FeatureMatrixRows,
} from "../src/lib/commander-strategy/model-c/feature-matrix-io-v1";
import { fitFeatureStandardizer } from "../src/lib/commander-strategy/model-c/standardization-v1";
import {
  fitConditionalLogitModelD2,
  modelD2PredictProbabilities,
  serializeModelD2,
  type ConditionalLogitModelD2,
  type ModelD2BlockLambdas,
} from "../src/lib/commander-strategy/model-d2/conditional-logit-d2-v1";
import { newBlockColumnNamesForVariant } from "../src/lib/commander-strategy/model-d2/feature-blocks-v1";
import {
  columnNamesForVariant as d2ColumnNames,
  loadFeatureMatrixRows as loadD2FeatureMatrixRows,
  loadFeatureNames,
} from "../src/lib/commander-strategy/model-d2/feature-matrix-io-v1";
import {
  fitNewBlockStandardizer,
  serializeStandardizer,
} from "../src/lib/commander-strategy/model-d2/standardization-v1";
import {
  MODEL_D2_FEATURE_SPEC_VERSION,
  MODEL_D2_FEATURES_VERSION,
  MODEL_D2_VERSION,
  type ModelD2Variant,
} from "../src/lib/commander-strategy/model-d2/types";
import type { LoadedFeatureRow } from "../src/lib/commander-strategy/model-c/feature-matrix-io-v1";

loadProjectEnvLocal();

const LAMBDA_GRID_INITIAL = [0.001, 0.01, 0.1, 1, 10] as const;
const LAMBDA_GRID_EXPANDED = [0.0001, 0.001, 0.01, 0.1, 1, 10, 100] as const;
const SEARCH_EPOCHS = 80;
const FINAL_EPOCHS = 200;
const VARIANTS: ModelD2Variant[] = ["P0", "P1", "D2"];

function gitSha(): string {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function sha256Json(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function assertFeatureQaPass(): void {
  const qaPath = resolve(
    modelArtifactDir(MODEL_D2_FEATURES_VERSION),
    "commander-model-d2-feature-generation-qa-v1.json",
  );
  if (!existsSync(qaPath)) throw new Error(`Missing D2 feature QA: ${qaPath}`);
  const qa = JSON.parse(readFileSync(qaPath, "utf8")) as { qaVerdict?: string };
  if (qa.qaVerdict !== "PASS") {
    throw new Error(`D2 feature QA verdict not acceptable: ${qa.qaVerdict}`);
  }
}

function splitC2Names() {
  const names = c2ColumnNames("C2");
  return {
    denseColumnNames: names.filter((n) => !n.startsWith("card_id_")),
    cardIdColumnNames: names.filter((n) => n.startsWith("card_id_")),
  };
}

function trainRows(observations: ModelAPodObservation[], rows: Map<string, LoadedFeatureRow>) {
  return observations.flatMap((obs) =>
    obs.seats.map((seat) => rows.get(`${obs.podId}:${seat.seatIndex}`)).filter(Boolean),
  ) as LoadedFeatureRow[];
}

function newBlockSetup(input: {
  variant: ModelD2Variant;
  allColumnNames: string[];
  featureNames: ReturnType<typeof loadFeatureNames>;
}) {
  const newColumnNames = newBlockColumnNamesForVariant({
    variant: input.variant,
    selfProfileColumns: input.featureNames.selfProfileColumns,
    opponentMarginalColumns: input.featureNames.opponentMarginalColumns,
    interactionColumns: input.featureNames.interactionColumns,
  });
  const newColumnIndices = newColumnNames.map((name) => {
    const idx = input.allColumnNames.indexOf(name);
    if (idx < 0) throw new Error(`Missing new-block column ${name} in ${input.variant} matrix`);
    return idx;
  });
  return { newColumnNames, newColumnIndices };
}

function validationLossD2(
  observations: ModelAPodObservation[],
  model: ConditionalLogitModelD2,
  variantRows: Map<string, LoadedFeatureRow>,
  c2Rows: Map<string, LoadedFeatureRow>,
): number {
  return evaluateObservationPredictor(observations, (obs) =>
    modelD2PredictProbabilities(obs, model, variantRows, c2Rows),
  ).logLoss;
}

type LambdaSearchResult = {
  selectedLambda: number;
  validationLogLoss: number;
  searchLog: Array<{ lambda: number; validationLogLoss: number }>;
  boundaryHit: boolean;
  gridUsed: readonly number[];
  expanded: boolean;
};

function searchLambda(input: {
  block: "lambdaSelf" | "lambdaOpponentMarginal" | "lambdaInteraction";
  grid: readonly number[];
  fixedLambdas: ModelD2BlockLambdas;
  variant: ModelD2Variant;
  train: ModelAPodObservation[];
  val: ModelAPodObservation[];
  variantTrainRows: Map<string, LoadedFeatureRow>;
  variantValRows: Map<string, LoadedFeatureRow>;
  c2TrainRows: Map<string, LoadedFeatureRow>;
  c2ValRows: Map<string, LoadedFeatureRow>;
  frozenC2: ConditionalLogitDeckModel;
  newColumnNames: string[];
  newColumnIndices: number[];
  standardizer: ReturnType<typeof fitNewBlockStandardizer>;
}): LambdaSearchResult {
  let bestLambda = input.grid[0]!;
  let bestLoss = Infinity;
  const searchLog: Array<{ lambda: number; validationLogLoss: number }> = [];

  for (const lambda of input.grid) {
    const lambdas: ModelD2BlockLambdas = {
      ...input.fixedLambdas,
      [input.block]: lambda,
    };
    const model = fitConditionalLogitModelD2({
      variant: input.variant,
      trainObservations: input.train,
      featureRowsByKey: input.variantTrainRows,
      c2RowsByKey: input.c2TrainRows,
      frozenC2: input.frozenC2,
      newColumnNames: input.newColumnNames,
      newColumnIndices: input.newColumnIndices,
      standardizer: input.standardizer,
      lambdas,
      epochs: SEARCH_EPOCHS,
    });
    const loss = validationLossD2(input.val, model, input.variantValRows, input.c2ValRows);
    searchLog.push({ lambda, validationLogLoss: loss });
    if (loss < bestLoss) {
      bestLoss = loss;
      bestLambda = lambda;
    }
  }

  const minGrid = input.grid[0]!;
  const maxGrid = input.grid[input.grid.length - 1]!;
  const boundaryHit = bestLambda === minGrid || bestLambda === maxGrid;
  return {
    selectedLambda: bestLambda,
    validationLogLoss: bestLoss,
    searchLog,
    boundaryHit,
    gridUsed: input.grid,
    expanded: false,
  };
}

function searchWithBoundaryExpansion(input: {
  block: "lambdaSelf" | "lambdaOpponentMarginal" | "lambdaInteraction";
  fixedLambdas: ModelD2BlockLambdas;
  variant: ModelD2Variant;
  train: ModelAPodObservation[];
  val: ModelAPodObservation[];
  variantTrainRows: Map<string, LoadedFeatureRow>;
  variantValRows: Map<string, LoadedFeatureRow>;
  c2TrainRows: Map<string, LoadedFeatureRow>;
  c2ValRows: Map<string, LoadedFeatureRow>;
  frozenC2: ConditionalLogitDeckModel;
  newColumnNames: string[];
  newColumnIndices: number[];
  standardizer: ReturnType<typeof fitNewBlockStandardizer>;
}): LambdaSearchResult {
  let result = searchLambda({ ...input, grid: LAMBDA_GRID_INITIAL });
  if (result.boundaryHit) {
    console.warn(`BOUNDARY_HIT on ${input.block} — expanding grid (VALIDATION only)`);
    result = {
      ...searchLambda({ ...input, grid: LAMBDA_GRID_EXPANDED }),
      expanded: true,
    };
    if (result.boundaryHit) {
      console.warn(`BOUNDARY_HIT persists for ${input.block} after grid expansion`);
    }
  }
  return result;
}

function metricsSummary(metrics: ModelAMetrics) {
  return {
    logLoss: metrics.logLoss,
    multiclass_seat_brier_v1: metrics.brierScore,
    seat_level_ece_v1: metrics.expectedCalibrationError,
    pod_argmax_accuracy: metrics.topPredictedSeatAccuracy,
  };
}

async function main() {
  assertFeatureQaPass();

  const qaPath = resolve(
    modelArtifactDir(MODEL_D2_FEATURES_VERSION),
    "commander-model-d2-feature-generation-qa-v1.json",
  );
  const qaReport = JSON.parse(readFileSync(qaPath, "utf8")) as {
    matrixHashes: Record<string, string>;
    featureSpecVersion: string;
  };

  const c2Hyper = JSON.parse(
    readFileSync(resolve(modelArtifactDir(MODEL_C_VERSION), "hyperparameters.json"), "utf8"),
  ) as { variants: { C2: { lambdas: Record<string, number>; cardIdSupportCutoff: number } } };
  const frozenC2Hyper = c2Hyper.variants.C2!;

  const manifest = loadTrainingSnapshotManifest();
  const corpus = await loadCombinedCorpus(manifest.topdeckSourceRuns.map((r) => r.month), {
    includeRawTournaments: false,
  });
  const train = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "train" }));
  const val = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "validation" }));

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

  const c2Names = splitC2Names();
  const c2FeatureRows = {
    train: await loadC2FeatureMatrixRows({ split: "train", variant: "C2" }),
    validation: await loadC2FeatureMatrixRows({ split: "validation", variant: "C2" }),
  };

  const c2Standardizer = fitFeatureStandardizer({
    rows: trainRows(train, c2FeatureRows.train),
    columnCount: c2Names.denseColumnNames.length,
  });

  console.log("Refitting frozen C2 offset on TRAIN (not updated during P0/P1/D2 block fitting)...");
  const modelC2 = fitConditionalLogitDeckModel({
    variant: "C2",
    trainObservations: train,
    featureRowsByKey: c2FeatureRows.train,
    frozenB,
    columnNames: c2Names.denseColumnNames,
    denseColumnNames: c2Names.denseColumnNames,
    cardIdColumnNames: c2Names.cardIdColumnNames,
    standardizer: c2Standardizer,
    lambdas: frozenC2Hyper.lambdas,
    cardIdSupportCutoff: frozenC2Hyper.cardIdSupportCutoff,
    epochs: FINAL_EPOCHS,
  });

  const d2Rows = {
    P0: {
      train: await loadD2FeatureMatrixRows({ split: "train", variant: "P0" }),
      validation: await loadD2FeatureMatrixRows({ split: "validation", variant: "P0" }),
    },
    P1: {
      train: await loadD2FeatureMatrixRows({ split: "train", variant: "P1" }),
      validation: await loadD2FeatureMatrixRows({ split: "validation", variant: "P1" }),
    },
    D2: {
      train: await loadD2FeatureMatrixRows({ split: "train", variant: "D2" }),
      validation: await loadD2FeatureMatrixRows({ split: "validation", variant: "D2" }),
    },
  };

  const featureNamesByVariant = Object.fromEntries(
    VARIANTS.map((v) => [v, loadFeatureNames(v)]),
  ) as Record<ModelD2Variant, ReturnType<typeof loadFeatureNames>>;

  const setupByVariant = Object.fromEntries(
    VARIANTS.map((v) => [
      v,
      newBlockSetup({
        variant: v,
        allColumnNames: d2ColumnNames(v),
        featureNames: featureNamesByVariant[v]!,
      }),
    ]),
  ) as Record<
    ModelD2Variant,
    { newColumnNames: string[]; newColumnIndices: number[] }
  >;

  const standardizers = Object.fromEntries(
    VARIANTS.map((v) => {
      const setup = setupByVariant[v]!;
      const standardizer = fitNewBlockStandardizer({
        rows: trainRows(train, d2Rows[v].train),
        columnIndices: setup.newColumnIndices,
        columnNames: setup.newColumnNames,
      });
      return [v, standardizer];
    }),
  ) as Record<ModelD2Variant, ReturnType<typeof fitNewBlockStandardizer>>;

  console.log("VALIDATION search: P0 lambdaSelf...");
  const p0Search = searchWithBoundaryExpansion({
    block: "lambdaSelf",
    fixedLambdas: { lambdaSelf: 0.01, lambdaOpponentMarginal: 0, lambdaInteraction: 0 },
    variant: "P0",
    train,
    val,
    variantTrainRows: d2Rows.P0.train,
    variantValRows: d2Rows.P0.validation,
    c2TrainRows: c2FeatureRows.train,
    c2ValRows: c2FeatureRows.validation,
    frozenC2: modelC2,
    newColumnNames: setupByVariant.P0.newColumnNames,
    newColumnIndices: setupByVariant.P0.newColumnIndices,
    standardizer: standardizers.P0,
  });

  console.log("VALIDATION search: P1 lambdaOpponentMarginal...");
  const p1Search = searchWithBoundaryExpansion({
    block: "lambdaOpponentMarginal",
    fixedLambdas: {
      lambdaSelf: p0Search.selectedLambda,
      lambdaOpponentMarginal: 0.01,
      lambdaInteraction: 0,
    },
    variant: "P1",
    train,
    val,
    variantTrainRows: d2Rows.P1.train,
    variantValRows: d2Rows.P1.validation,
    c2TrainRows: c2FeatureRows.train,
    c2ValRows: c2FeatureRows.validation,
    frozenC2: modelC2,
    newColumnNames: setupByVariant.P1.newColumnNames,
    newColumnIndices: setupByVariant.P1.newColumnIndices,
    standardizer: standardizers.P1,
  });

  console.log("VALIDATION search: D2 lambdaInteraction...");
  const d2Search = searchWithBoundaryExpansion({
    block: "lambdaInteraction",
    fixedLambdas: {
      lambdaSelf: p0Search.selectedLambda,
      lambdaOpponentMarginal: p1Search.selectedLambda,
      lambdaInteraction: 0.01,
    },
    variant: "D2",
    train,
    val,
    variantTrainRows: d2Rows.D2.train,
    variantValRows: d2Rows.D2.validation,
    c2TrainRows: c2FeatureRows.train,
    c2ValRows: c2FeatureRows.validation,
    frozenC2: modelC2,
    newColumnNames: setupByVariant.D2.newColumnNames,
    newColumnIndices: setupByVariant.D2.newColumnIndices,
    standardizer: standardizers.D2,
  });

  const selectedLambdas: ModelD2BlockLambdas = {
    lambdaSelf: p0Search.selectedLambda,
    lambdaOpponentMarginal: p1Search.selectedLambda,
    lambdaInteraction: d2Search.selectedLambda,
  };

  console.log("Final TRAIN refit: P0, P1, D2...");
  const modelP0 = fitConditionalLogitModelD2({
    variant: "P0",
    trainObservations: train,
    featureRowsByKey: d2Rows.P0.train,
    c2RowsByKey: c2FeatureRows.train,
    frozenC2: modelC2,
    newColumnNames: setupByVariant.P0.newColumnNames,
    newColumnIndices: setupByVariant.P0.newColumnIndices,
    standardizer: standardizers.P0,
    lambdas: {
      ...selectedLambdas,
      lambdaOpponentMarginal: 0,
      lambdaInteraction: 0,
    },
    epochs: FINAL_EPOCHS,
  });

  const modelP1 = fitConditionalLogitModelD2({
    variant: "P1",
    trainObservations: train,
    featureRowsByKey: d2Rows.P1.train,
    c2RowsByKey: c2FeatureRows.train,
    frozenC2: modelC2,
    newColumnNames: setupByVariant.P1.newColumnNames,
    newColumnIndices: setupByVariant.P1.newColumnIndices,
    standardizer: standardizers.P1,
    lambdas: {
      ...selectedLambdas,
      lambdaInteraction: 0,
    },
    epochs: FINAL_EPOCHS,
  });

  const modelD2 = fitConditionalLogitModelD2({
    variant: "D2",
    trainObservations: train,
    featureRowsByKey: d2Rows.D2.train,
    c2RowsByKey: c2FeatureRows.train,
    frozenC2: modelC2,
    newColumnNames: setupByVariant.D2.newColumnNames,
    newColumnIndices: setupByVariant.D2.newColumnIndices,
    standardizer: standardizers.D2,
    lambdas: selectedLambdas,
    epochs: FINAL_EPOCHS,
  });

  const predictors = {
    C2: (obs: ModelAPodObservation) => modelCPredictProbabilities(obs, modelC2, c2FeatureRows.validation),
    P0: (obs: ModelAPodObservation) =>
      modelD2PredictProbabilities(obs, modelP0, d2Rows.P0.validation, c2FeatureRows.validation),
    P1: (obs: ModelAPodObservation) =>
      modelD2PredictProbabilities(obs, modelP1, d2Rows.P1.validation, c2FeatureRows.validation),
    D2: (obs: ModelAPodObservation) =>
      modelD2PredictProbabilities(obs, modelD2, d2Rows.D2.validation, c2FeatureRows.validation),
  };

  const validationMetrics = Object.fromEntries(
    (["C2", "P0", "P1", "D2"] as const).map((name) => [
      name,
      evaluateObservationPredictor(val, predictors[name]),
    ]),
  ) as Record<"C2" | "P0" | "P1" | "D2", ModelAMetrics>;

  const validationLogLoss = Object.fromEntries(
    (["C2", "P0", "P1", "D2"] as const).map((m) => [m, validationMetrics[m]!.logLoss]),
  ) as Record<"C2" | "P0" | "P1" | "D2", number>;

  const podSize3 = val.filter((o) => o.podSize === 3);
  const podSize4 = val.filter((o) => o.podSize === 4);
  const validationPodSizeMetrics = {
    podSize3: Object.fromEntries(
      (["C2", "P0", "P1", "D2"] as const).map((m) => [
        m,
        metricsSummary(evaluateObservationPredictor(podSize3, predictors[m])),
      ]),
    ),
    podSize4: Object.fromEntries(
      (["C2", "P0", "P1", "D2"] as const).map((m) => [
        m,
        metricsSummary(evaluateObservationPredictor(podSize4, predictors[m])),
      ]),
    ),
  };

  const hyperparameterGrid = {
    initial: [...LAMBDA_GRID_INITIAL],
    expanded: [...LAMBDA_GRID_EXPANDED],
    boundaryExpansionPolicy: "If selected lambda hits grid min/max, expand grid and re-search on VALIDATION only.",
  };

  const hyperparameterSearch = {
    P0_lambdaSelf: p0Search,
    P1_lambdaOpponentMarginal: p1Search,
    D2_lambdaInteraction: d2Search,
    selected: selectedLambdas,
    boundaryHits: {
      lambdaSelf: p0Search.boundaryHit ? "BOUNDARY_HIT" : null,
      lambdaOpponentMarginal: p1Search.boundaryHit ? "BOUNDARY_HIT" : null,
      lambdaInteraction: d2Search.boundaryHit ? "BOUNDARY_HIT" : null,
    },
  };

  const scalingArtifacts = Object.fromEntries(
    VARIANTS.map((v) => [v, serializeStandardizer(standardizers[v]!)]),
  );

  const featureSpecHash = sha256File(
    resolve(trainingSnapshotDir(), "commander-model-d2-feature-spec-v1.json"),
  );
  const ipv21AuditPath = resolve(
    modelArtifactDir("commander-model-d-v1"),
    "interaction-profile-v2.1/interaction-profile-v2.1-audit-report-v1.json",
  );
  const interactionProfileV21Hash = existsSync(ipv21AuditPath) ? sha256File(ipv21AuditPath) : null;

  const candidateFreezeInput = {
    interactionProfileV21Hash,
    featureSpecHash,
    matrixHashes: qaReport.matrixHashes,
    scalingArtifacts,
    hyperparameterGrid,
    selectedHyperparameters: selectedLambdas,
    codeSha: gitSha(),
  };
  const candidateHash = sha256Json(candidateFreezeInput);

  const outDir = modelArtifactDir(MODEL_D2_VERSION);
  mkdirSync(outDir, { recursive: true });

  writeFileSync(
    resolve(outDir, "hyperparameters.json"),
    JSON.stringify(
      {
        selectedOnSplit: "validation",
        frozenC2HyperparametersSource: MODEL_C_VERSION,
        hyperparameterGrid,
        search: hyperparameterSearch,
        selected: selectedLambdas,
      },
      null,
      2,
    ),
  );

  writeFileSync(resolve(outDir, "scaling-P0.json"), JSON.stringify(scalingArtifacts.P0, null, 2));
  writeFileSync(resolve(outDir, "scaling-P1.json"), JSON.stringify(scalingArtifacts.P1, null, 2));
  writeFileSync(resolve(outDir, "scaling-D2.json"), JSON.stringify(scalingArtifacts.D2, null, 2));

  writeFileSync(resolve(outDir, "coefficients-P0.json"), JSON.stringify(serializeModelD2(modelP0), null, 2));
  writeFileSync(resolve(outDir, "coefficients-P1.json"), JSON.stringify(serializeModelD2(modelP1), null, 2));
  writeFileSync(resolve(outDir, "coefficients-D2.json"), JSON.stringify(serializeModelD2(modelD2), null, 2));

  const report = {
    modelVersion: MODEL_D2_VERSION,
    featureSpecVersion: MODEL_D2_FEATURE_SPEC_VERSION,
    featureArtifactVersion: MODEL_D2_FEATURES_VERSION,
    frozenIndividualDeckBaseline: { model: MODEL_C_VERSION, variant: "C2", policy: "frozen offset — not refit during block fitting" },
    frozenModelBVersion: MODEL_B_VERSION,
    datasetHash: EXPECTED_DATASET_HASH,
    gitSha: gitSha(),
    trainingTimestamp: new Date().toISOString(),
    observationWindow: OBSERVATION_WINDOW,
    authorization: {
      d2FeatureQA: "ACCEPTED_FROZEN",
      trainScaling: "COMPLETE",
      trainFitting: "COMPLETE",
      validationHyperparameterSelection: "COMPLETE",
      candidateFreeze: "COMPLETE",
      oldTest: "PROHIBITED",
      prospectiveHoldout: "SEALED_DO_NOT_SCORE",
      d2ProspectiveEvaluation: "WAIT",
      rc8: "FROZEN",
    },
    comparisonConvention: {
      deltaLogLoss: "loss(baseline) - loss(challenger)",
      positiveDeltaMeans: "challenger better (lower log loss)",
      primarySelectionMetric: "logLoss",
    },
    primaryRpsTest: "D2 vs P1",
    validationComparisons: {
      "P0 vs C2": explicitLogLossComparison({ baseline: "C2", challenger: "P0", logLossByModel: validationLogLoss }),
      "P1 vs P0": explicitLogLossComparison({ baseline: "P0", challenger: "P1", logLossByModel: validationLogLoss }),
      "D2 vs P1": explicitLogLossComparison({ baseline: "P1", challenger: "D2", logLossByModel: validationLogLoss }),
      "D2 vs C2": explicitLogLossComparison({ baseline: "C2", challenger: "D2", logLossByModel: validationLogLoss }),
    },
    validationMetrics: Object.fromEntries(
      (["C2", "P0", "P1", "D2"] as const).map((m) => [m, metricsSummary(validationMetrics[m]!)]),
    ),
    validationPodSizeMetrics,
    hyperparameterSearch,
    coefficientBlockDiagnostics: {
      P0: serializeModelD2(modelP0).blockDiagnostics,
      P1: serializeModelD2(modelP1).blockDiagnostics,
      D2: serializeModelD2(modelD2).blockDiagnostics,
    },
    d2InteractionCoefficientsByRelationship: serializeModelD2(modelD2).interactionCoefficientsByRelationship,
    zoneCoefficientMass: {
      P0: serializeModelD2(modelP0).zoneCoefficientMass,
      P1: serializeModelD2(modelP1).zoneCoefficientMass,
      D2: serializeModelD2(modelD2).zoneCoefficientMass,
    },
    candidateFreeze: {
      ...candidateFreezeInput,
      candidateHash,
      trainMatrixHashes: {
        P0: qaReport.matrixHashes["train-P0"],
        P1: qaReport.matrixHashes["train-P1"],
        D2: qaReport.matrixHashes["train-D2"],
      },
      validationMatrixHashes: {
        P0: qaReport.matrixHashes["validation-P0"],
        P1: qaReport.matrixHashes["validation-P1"],
        D2: qaReport.matrixHashes["validation-D2"],
      },
      coefficientArtifacts: [
        "coefficients-P0.json",
        "coefficients-P1.json",
        "coefficients-D2.json",
      ],
      status: "IMMUTABLE_BEFORE_PROSPECTIVE_EVALUATION",
    },
    dataCounts: {
      trainPods: train.length,
      validationPods: val.length,
      validationPodSize3: podSize3.length,
      validationPodSize4: podSize4.length,
    },
    nextStep: "REPORT_AND_WAIT — review validation ladder before opening prospective holdout.",
  };

  writeFileSync(resolve(outDir, "model-d2-validation-report.json"), JSON.stringify(report, null, 2));

  console.log("\n=== Model D2 VALIDATION report (holdout NOT scored) ===");
  console.log(JSON.stringify(report.validationComparisons, null, 2));
  console.log("\nValidation metrics:");
  console.log(JSON.stringify(report.validationMetrics, null, 2));
  console.log(`\nCandidate hash: ${candidateHash}`);
  console.log(`Report: ${resolve(outDir, "model-d2-validation-report.json")}`);
  console.log("\nREPORT AND WAIT — prospective holdout remains sealed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
