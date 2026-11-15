#!/usr/bin/env npx tsx
/**
 * Model D diagnostics-only postmortem — no retraining, no TEST-driven feature design.
 * Reproduces frozen-hyperparameter fits only to extract coefficient block statistics
 * not persisted in model-d artifacts.
 */
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadProjectEnvLocal } from "./lib/script-env";
import { loadCombinedCorpus } from "../src/lib/commander-strategy/combined-corpus-v1";
import {
  loadTrainingSnapshotManifest,
  modelArtifactDir,
} from "../src/lib/commander-strategy/training-snapshot-v1";
import { MODEL_B_VERSION } from "../src/lib/commander-strategy/model-b/types";
import { MODEL_C_VERSION } from "../src/lib/commander-strategy/model-c/types";
import { filterPrimaryPodSize, loadSplitObservations } from "../src/lib/commander-strategy/model-a/dataset-v1";
import type { ModelAPodObservation } from "../src/lib/commander-strategy/model-a/types";
import { fitConditionalLogitCommanderPlayer } from "../src/lib/commander-strategy/model-b/conditional-logit-commander-player-v1";
import { evaluateObservationPredictor } from "../src/lib/commander-strategy/model-b/evaluation-v1";
import {
  fitConditionalLogitDeckModel,
  modelCPredictProbabilities,
} from "../src/lib/commander-strategy/model-c/conditional-logit-deck-v1";
import {
  columnNamesForVariant as c2ColumnNames,
  loadFeatureMatrixRows as loadC2FeatureMatrixRows,
} from "../src/lib/commander-strategy/model-c/feature-matrix-io-v1";
import { fitFeatureStandardizer } from "../src/lib/commander-strategy/model-c/standardization-v1";
import {
  fitConditionalLogitModelD,
  modelDPredictProbabilities,
  type ConditionalLogitModelD,
} from "../src/lib/commander-strategy/model-d/conditional-logit-deck-v1";
import { featureBlockForModelDColumn } from "../src/lib/commander-strategy/model-d/feature-blocks-v1";
import {
  columnNamesForVariant as dColumnNames,
  loadFeatureMatrixRows as loadDFeatureMatrixRows,
  loadFeatureNames,
} from "../src/lib/commander-strategy/model-d/feature-matrix-io-v1";
import { opponentContextFeatureNames } from "../src/lib/commander-strategy/model-d/opponent-context-features-v1";
import {
  SEMANTIC_MATCHUP_CHANNELS,
  semanticMatchupFeatureNames,
} from "../src/lib/commander-strategy/model-d/matchup-interaction-features-v1";
import { MODEL_D_VERSION } from "../src/lib/commander-strategy/model-d/types";
import { createSeededRandom } from "../src/lib/commander-strategy/model-b/bootstrap-v1";

loadProjectEnvLocal();

const FINAL_EPOCHS_SPARSE = 120;
const NEAR_ZERO = 1e-6;
const MATERIAL = 1e-4;
const HOMOGENEOUS_EPS = 1e-8;
const DUPLICATE_CORR = 0.99;
const C2_RECONSTRUCT_CORR = 0.95;
const DIAG_SEED = 20260812;
const SAMPLE_PODS = 15;
const CORR_SAMPLE_ROWS = 8000;

const RC8_LABEL: Record<string, string> = {
  rc8_dep_graveyard_dependent: "graveyard reliance",
  rc8_dep_spell_chain_dependent: "spell-chain reliance",
  rc8_dep_battlefield_dependent: "battlefield reliance",
  rc8_dep_artifact_dependent: "artifact dependence",
  rc8_dep_creature_dependent: "creature reliance",
  rc8_dep_library_search_dependent: "tutoring reliance",
  rc8_dep_activated_ability_dependent: "activated-ability reliance",
  rc8_attack_graveyard_disruption: "graveyard disruption",
  rc8_attack_counterspell: "countermagic",
  rc8_attack_board_reset: "board reset",
  rc8_attack_artifact_interaction: "artifact interaction",
  rc8_attack_creature_removal: "creature removal",
  rc8_attack_resource_denial: "resource denial",
  rc8_attack_ability_denial: "ability denial",
  rc8_attack_exile_removal: "exile pressure",
  rc8_role_token: "token/go-wide profile",
  rc8_attack_card_engine: "card-engine density",
  rc8_attack_recursion: "recursion density",
};

const CHANNEL_ENGLISH: Record<string, string> = {
  graveyard_dep_vs_graveyard_disruption: "graveyard reliance × opponent graveyard disruption",
  spell_chain_dep_vs_counterspell: "spell-chain reliance × opponent countermagic",
  battlefield_dep_vs_board_reset: "battlefield reliance × opponent board reset",
  artifact_dep_vs_artifact_interaction: "artifact dependence × opponent artifact interaction",
  creature_dep_vs_creature_removal: "creature reliance × opponent creature removal",
  library_search_dep_vs_resource_denial: "tutoring reliance × opponent resource denial",
  activated_dep_vs_ability_denial: "activated-ability reliance × opponent ability denial",
  graveyard_dep_vs_exile_removal: "graveyard reliance × opponent exile pressure",
  token_profile_vs_board_reset: "token/go-wide profile × opponent board reset",
  card_engine_vs_resource_denial: "card-engine density × opponent resource denial",
  recursion_vs_graveyard_disruption: "recursion density × opponent graveyard disruption",
  attack_vuln_dot: "attack-vector × opponent vulnerability-vector dot product",
};

function trainRows(observations: ModelAPodObservation[], rows: Map<string, { denseValues: number[] }>) {
  return observations.flatMap((obs) =>
    obs.seats.map((seat) => rows.get(`${obs.podId}:${seat.seatIndex}`)).filter(Boolean),
  );
}

function splitNames(variant: "C2" | "D0" | "D1") {
  const names = variant === "C2" ? c2ColumnNames("C2") : dColumnNames(variant);
  return {
    denseColumnNames: names.filter((n) => !n.startsWith("card_id_")),
    cardIdColumnNames: names.filter((n) => n.startsWith("card_id_")),
  };
}

function blockCoefficients(model: ConditionalLogitModelD, block: "OPPONENT_CONTEXT" | "SEMANTIC_MATCHUP") {
  const out: Array<{ name: string; coefficient: number }> = [];
  for (let j = 0; j < model.columnNames.length; j += 1) {
    const name = model.columnNames[j]!;
    if (featureBlockForModelDColumn(name) !== block) continue;
    out.push({ name, coefficient: model.coefficients[j] ?? 0 });
  }
  return out;
}

function coefficientUtilization(rows: Array<{ name: string; coefficient: number }>) {
  const abs = rows.map((r) => Math.abs(r.coefficient));
  const l1 = abs.reduce((a, b) => a + b, 0);
  const l2 = Math.sqrt(abs.reduce((a, b) => a + b * b, 0));
  return {
    count: rows.length,
    exactlyZero: abs.filter((v) => v === 0).length,
    nearZero: abs.filter((v) => v > 0 && v < NEAR_ZERO).length,
    materiallyNonzero: abs.filter((v) => v >= MATERIAL).length,
    maxAbs: abs.length ? Math.max(...abs) : 0,
    medianAbs: abs.length ? abs.sort((a, b) => a - b)[Math.floor(abs.length / 2)]! : 0,
    l1Norm: l1,
    l2Norm: l2,
  };
}

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 2) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i += 1) {
    const vx = x[i]! - mx;
    const vy = y[i]! - my;
    num += vx * vy;
    dx += vx * vx;
    dy += vy * vy;
  }
  const den = Math.sqrt(dx * dy);
  return den > 0 ? num / den : 0;
}

function featureStats(input: {
  rows: Array<{ denseValues: number[] }>;
  columnNames: string[];
  featureNames: string[];
  c2ColumnNames: string[];
  c2ColumnIndices: number[];
}) {
  const rand = createSeededRandom(DIAG_SEED + 17);
  const sample =
    input.rows.length <= CORR_SAMPLE_ROWS
      ? input.rows
      : [...input.rows].sort(() => rand() - 0.5).slice(0, CORR_SAMPLE_ROWS);
  const nAll = input.rows.length;
  const n = sample.length;

  const allMatrices = input.featureNames.map((name) => {
    const idx = input.columnNames.indexOf(name);
    return input.rows.map((r) => (idx >= 0 ? r.denseValues[idx] ?? 0 : 0));
  });
  const sampleMatrices = input.featureNames.map((name) => {
    const idx = input.columnNames.indexOf(name);
    return sample.map((r) => (idx >= 0 ? r.denseValues[idx] ?? 0 : 0));
  });
  const c2SampleMatrices = input.c2ColumnIndices.map((c2Idx) =>
    sample.map((r) => r.denseValues[c2Idx] ?? 0),
  );

  const stats = input.featureNames.map((name, fi) => {
    const values = allMatrices[fi]!;
    const mean = values.reduce((a, b) => a + b, 0) / Math.max(nAll, 1);
    const variance =
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(nAll - 1, 1);
    const prevalence = values.filter((v) => Math.abs(v) > 1e-12).length / Math.max(nAll, 1);

    let maxAbsCorrWithC2 = 0;
    let maxCorrC2Feature = "";
    for (let ci = 0; ci < c2SampleMatrices.length; ci += 1) {
      const corr = Math.abs(pearson(sampleMatrices[fi]!, c2SampleMatrices[ci]!));
      if (corr > maxAbsCorrWithC2) {
        maxAbsCorrWithC2 = corr;
        maxCorrC2Feature = input.c2ColumnNames[ci]!;
      }
    }

    return {
      feature: name,
      trainVariance: variance,
      trainMean: mean,
      prevalenceNonZero: prevalence,
      maxAbsCorrelationWithC2: maxAbsCorrWithC2,
      highestCorrC2Feature: maxCorrC2Feature,
      reconstructableFromC2: maxAbsCorrWithC2 >= C2_RECONSTRUCT_CORR,
      correlationSampleRows: n,
    };
  });

  let nearDuplicatePairs = 0;
  for (let i = 0; i < input.featureNames.length; i += 1) {
    for (let j = i + 1; j < input.featureNames.length; j += 1) {
      if (Math.abs(pearson(sampleMatrices[i]!, sampleMatrices[j]!)) >= DUPLICATE_CORR) nearDuplicatePairs += 1;
    }
  }

  return {
    perFeature: stats,
    nearDuplicatePairCount: nearDuplicatePairs,
    reconstructableFromC2Count: stats.filter((s) => s.reconstructableFromC2).length,
    correlationSampleRows: n,
  };
}

function reducerHomogeneity(rows: Map<string, { denseValues: number[] }>, columnNames: string[]) {
  const channels = SEMANTIC_MATCHUP_CHANNELS.map((ch) =>
    "dotProduct" in ch && ch.dotProduct ? "attack_vuln_dot" : ch.name,
  );
  const byChannel: Record<string, { total: number; allEqual: number; maxMinSpread: number[] }> = {};

  for (const ch of channels) {
    byChannel[ch] = { total: 0, allEqual: 0, maxMinSpread: [] };
    const meanName = `match_${ch}_meanAcrossOpponents`;
    const maxName = `match_${ch}_maxAcrossOpponents`;
    const minName = `match_${ch}_minAcrossOpponents`;
    const mi = columnNames.indexOf(meanName);
    const xi = columnNames.indexOf(maxName);
    const ni = columnNames.indexOf(minName);
    if (mi < 0 || xi < 0 || ni < 0) continue;

    for (const row of rows.values()) {
      const mean = row.denseValues[mi] ?? 0;
      const max = row.denseValues[xi] ?? 0;
      const min = row.denseValues[ni] ?? 0;
      byChannel[ch]!.total += 1;
      if (Math.abs(max - min) <= HOMOGENEOUS_EPS && Math.abs(mean - max) <= HOMOGENEOUS_EPS) {
        byChannel[ch]!.allEqual += 1;
      }
      byChannel[ch]!.maxMinSpread.push(max - min);
    }
  }

  return Object.fromEntries(
    Object.entries(byChannel).map(([ch, v]) => {
      const spreads = v.maxMinSpread.sort((a, b) => a - b);
      const pct = v.total > 0 ? v.allEqual / v.total : 0;
      return [
        ch,
        {
          trainSeatCount: v.total,
          fractionMeanApproxMaxApproxMin: pct,
          maxMinSpreadQuantiles: {
            p50: spreads[Math.floor(spreads.length * 0.5)] ?? 0,
            p90: spreads[Math.floor(spreads.length * 0.9)] ?? 0,
            p99: spreads[Math.floor(spreads.length * 0.99)] ?? 0,
            max: spreads[spreads.length - 1] ?? 0,
          },
        },
      ];
    }),
  );
}

function levelLabel(value: number, breaks: [number, number]): string {
  if (value <= breaks[0]) return "low";
  if (value <= breaks[1]) return "medium";
  return "high";
}

function buildSemanticBreaks(
  rows: Map<string, { denseValues: number[] }>,
  columnNames: string[],
  keys: string[],
): Record<string, [number, number]> {
  const out: Record<string, [number, number]> = {};
  for (const key of keys) {
    const idx = columnNames.indexOf(key);
    if (idx < 0) continue;
    const vals = [...rows.values()]
      .map((r) => r.denseValues[idx] ?? 0)
      .filter((v) => v > 0)
      .sort((a, b) => a - b);
    if (vals.length < 10) {
      out[key] = [0, 0];
      continue;
    }
    out[key] = [
      vals[Math.floor(vals.length / 3)]!,
      vals[Math.floor((2 * vals.length) / 3)]!,
    ];
  }
  return out;
}

function humanReadablePod(input: {
  obs: ModelAPodObservation;
  d1Rows: Map<string, { denseValues: number[] }>;
  d1Columns: string[];
  c2Columns: string[];
  breaks: Record<string, [number, number]>;
}) {
  const seats = input.obs.seats.map((seat, seatIndex) => {
    const rowKey = `${input.obs.podId}:${seatIndex}`;
    const row = input.d1Rows.get(rowKey);
    if (!row) return { seatIndex, note: "missing row" };

    const deckProfile: Record<string, string> = {};
    for (const ch of SEMANTIC_MATCHUP_CHANNELS) {
      if ("dotProduct" in ch && ch.dotProduct) continue;
      const myIdx = input.c2Columns.indexOf(ch.myKey);
      if (myIdx >= 0) {
        const v = row.denseValues[myIdx] ?? 0;
        deckProfile[RC8_LABEL[ch.myKey] ?? ch.myKey] = levelLabel(v, input.breaks[ch.myKey] ?? [0, 0]);
      }
    }

    const opponentSummaries = input.obs.seats
      .map((oppSeat, oppIdx) => {
        if (oppIdx === seatIndex) return null;
        const oppRow = input.d1Rows.get(`${input.obs.podId}:${oppIdx}`);
        if (!oppRow) return null;
        const oppProfile: Record<string, string> = {};
        for (const ch of SEMANTIC_MATCHUP_CHANNELS) {
          if ("dotProduct" in ch && ch.dotProduct) continue;
          const oppIdx2 = input.c2Columns.indexOf(ch.oppKey);
          if (oppIdx2 >= 0) {
            const v = oppRow.denseValues[oppIdx2] ?? 0;
            oppProfile[RC8_LABEL[ch.oppKey] ?? ch.oppKey] = levelLabel(
              v,
              input.breaks[ch.oppKey] ?? [0, 0],
            );
          }
        }
        return { opponentSeat: oppIdx, deckHash: oppSeat.deckHash, profile: oppProfile };
      })
      .filter(Boolean);

    const d1Channels = semanticMatchupFeatureNames()
      .map((fname) => {
        const idx = input.d1Columns.indexOf(fname);
        const value = idx >= 0 ? row.denseValues[idx] ?? 0 : 0;
        const body = fname
          .replace(/^match_/, "")
          .replace(/_(meanAcrossOpponents|maxAcrossOpponents|minAcrossOpponents)$/, "");
        const reducer = fname.match(/_(meanAcrossOpponents|maxAcrossOpponents|minAcrossOpponents)$/)?.[1] ?? "";
        return {
          channel: CHANNEL_ENGLISH[body] ?? body,
          reducer: reducer.replace("AcrossOpponents", ""),
          value,
        };
      })
      .filter((c) => Math.abs(c.value) > 1e-12);

    return {
      seatIndex,
      deckHash: seat.deckHash,
      deckSemanticProfile: deckProfile,
      opponents: opponentSummaries,
      d1ChannelValues: d1Channels,
    };
  });

  return { podId: input.obs.podId, podSize: input.obs.podSize, seats };
}

async function main() {
  const existingReport = JSON.parse(
    readFileSync(resolve(modelArtifactDir(MODEL_D_VERSION), "model-d-report.json"), "utf8"),
  ) as Record<string, unknown>;

  const hyper = JSON.parse(
    readFileSync(resolve(modelArtifactDir(MODEL_D_VERSION), "hyperparameters.json"), "utf8"),
  ) as {
    D0: { lambdas: ConditionalLogitModelD["lambdas"]; cardIdSupportCutoff: number; validationLogLoss: number };
    D1: { lambdas: ConditionalLogitModelD["lambdas"]; cardIdSupportCutoff: number; validationLogLoss: number };
  };
  const c2Hyper = JSON.parse(
    readFileSync(resolve(modelArtifactDir(MODEL_C_VERSION), "hyperparameters.json"), "utf8"),
  ) as { variants: { C2: { lambdas: ConditionalLogitModelD["lambdas"]; cardIdSupportCutoff: number } } };

  const manifest = loadTrainingSnapshotManifest();
  const corpus = await loadCombinedCorpus(manifest.topdeckSourceRuns.map((r) => r.month), {
    includeRawTournaments: false,
  });
  const train = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "train" }));
  const val = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "validation" }));
  const test = filterPrimaryPodSize(loadSplitObservations({ manifest, corpus, split: "test" }));
  const testAligned = test.sort((a, b) => a.podId.localeCompare(b.podId));

  const bHyper = JSON.parse(
    readFileSync(resolve(modelArtifactDir(MODEL_B_VERSION), "hyperparameters.json"), "utf8"),
  ) as { lambdaCommander: number; lambdaPlayer: number; learningRate: number; epochs: number };

  console.log("Loading feature matrices...");
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

  const d0Names = loadFeatureNames("D0");
  const d1Names = loadFeatureNames("D1");
  const c2DenseNames = splitNames("C2").denseColumnNames;
  const d0DenseNames = splitNames("D0").denseColumnNames;
  const d1DenseNames = splitNames("D1").denseColumnNames;
  const c2IndicesInD0 = d0Names.frozenC2Columns.map((n) => d0DenseNames.indexOf(n));

  console.log("Feature variance / redundancy analysis...");
  const d0TrainRows = trainRows(train, featureRows.D0.train);
  const d1TrainRows = trainRows(train, featureRows.D1.train);
  const d0FeatureStats = featureStats({
    rows: d0TrainRows as Array<{ denseValues: number[] }>,
    columnNames: d0DenseNames,
    featureNames: opponentContextFeatureNames(),
    c2ColumnNames: d0Names.frozenC2Columns,
    c2ColumnIndices: c2IndicesInD0,
  });
  const d1FeatureStats = featureStats({
    rows: d1TrainRows as Array<{ denseValues: number[] }>,
    columnNames: d1DenseNames,
    featureNames: semanticMatchupFeatureNames(),
    c2ColumnNames: d1Names.frozenC2Columns,
    c2ColumnIndices: d1Names.frozenC2Columns.map((n) => d1DenseNames.indexOf(n)),
  });

  console.log("Opponent aggregation homogeneity...");
  const aggregationHomogeneity = reducerHomogeneity(featureRows.D1.train, d1DenseNames);

  console.log("Reproducing frozen-hyperparameter fits for coefficient extraction...");
  const frozenB = fitConditionalLogitCommanderPlayer({
    trainObservations: train,
    mode: "commander_player",
    lambdaCommander: bHyper.lambdaCommander,
    lambdaPlayer: bHyper.lambdaPlayer,
    learningRate: bHyper.learningRate,
    epochs: bHyper.epochs,
  });

  const c2Names = splitNames("C2");
  const c2Standardizer = fitFeatureStandardizer({
    rows: trainRows(train, featureRows.C2.train),
    columnCount: c2Names.denseColumnNames.length,
  });
  const modelC2 = fitConditionalLogitDeckModel({
    variant: "C2",
    trainObservations: train,
    featureRowsByKey: featureRows.C2.train,
    frozenB,
    columnNames: c2Names.denseColumnNames,
    denseColumnNames: c2Names.denseColumnNames,
    cardIdColumnNames: c2Names.cardIdColumnNames,
    standardizer: c2Standardizer,
    lambdas: c2Hyper.variants.C2!.lambdas,
    cardIdSupportCutoff: c2Hyper.variants.C2!.cardIdSupportCutoff,
    epochs: FINAL_EPOCHS_SPARSE,
  });

  const d0Standardizer = fitFeatureStandardizer({
    rows: trainRows(train, featureRows.D0.train),
    columnCount: d0DenseNames.length,
  });
  const modelD0 = fitConditionalLogitModelD({
    variant: "D0",
    trainObservations: train,
    featureRowsByKey: featureRows.D0.train,
    frozenB,
    denseColumnNames: d0DenseNames,
    cardIdColumnNames: splitNames("D0").cardIdColumnNames,
    standardizer: d0Standardizer,
    lambdas: hyper.D0.lambdas,
    cardIdSupportCutoff: hyper.D0.cardIdSupportCutoff,
    epochs: FINAL_EPOCHS_SPARSE,
  });

  const d1Standardizer = fitFeatureStandardizer({
    rows: trainRows(train, featureRows.D1.train),
    columnCount: d1DenseNames.length,
  });
  const modelD1 = fitConditionalLogitModelD({
    variant: "D1",
    trainObservations: train,
    featureRowsByKey: featureRows.D1.train,
    frozenB,
    denseColumnNames: d1DenseNames,
    cardIdColumnNames: splitNames("D1").cardIdColumnNames,
    standardizer: d1Standardizer,
    lambdas: hyper.D1.lambdas,
    cardIdSupportCutoff: hyper.D1.cardIdSupportCutoff,
    epochs: FINAL_EPOCHS_SPARSE,
  });

  const valMetrics = {
    C2: evaluateObservationPredictor(val, (obs) =>
      modelCPredictProbabilities(obs, modelC2, featureRows.C2.validation),
    ).logLoss,
    D0: evaluateObservationPredictor(val, (obs) =>
      modelDPredictProbabilities(obs, modelD0, featureRows.D0.validation),
    ).logLoss,
    D1: evaluateObservationPredictor(val, (obs) =>
      modelDPredictProbabilities(obs, modelD1, featureRows.D1.validation),
    ).logLoss,
  };

  const d0Block = blockCoefficients(modelD0, "OPPONENT_CONTEXT");
  const d1Block = blockCoefficients(modelD1, "SEMANTIC_MATCHUP");

  const matchupCoefRows = d1Block.map(({ name, coefficient }) => {
    const idx = d1DenseNames.indexOf(name);
    const values = d1TrainRows.map((r) => (idx >= 0 ? r!.denseValues[idx] ?? 0 : 0));
    const mean = values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
    const variance =
      values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(values.length - 1, 1);
    const prevalence = values.filter((v) => Math.abs(v) > 1e-12).length / Math.max(values.length, 1);
    const body = name
      .replace(/^match_/, "")
      .replace(/_(meanAcrossOpponents|maxAcrossOpponents|minAcrossOpponents)$/, "");
    const reducer = name.match(/_(meanAcrossOpponents|maxAcrossOpponents|minAcrossOpponents)$/)?.[1] ?? "";
    return {
      feature: name,
      channel: body,
      channelEnglish: CHANNEL_ENGLISH[body] ?? body,
      reducer,
      coefficient,
      standardizedCoefficient: coefficient,
      trainVariance: variance,
      prevalenceNonZero: prevalence,
    };
  });

  const semanticKeys = [
    ...new Set(
      SEMANTIC_MATCHUP_CHANNELS.flatMap((ch) =>
        "dotProduct" in ch && ch.dotProduct ? [] : [ch.myKey, ch.oppKey],
      ),
    ),
  ];
  const breaks = buildSemanticBreaks(featureRows.D1.train, d1DenseNames, semanticKeys);

  const rand = createSeededRandom(DIAG_SEED);
  const shuffled = [...testAligned].sort(() => rand() - 0.5);
  const samplePods = shuffled.slice(0, SAMPLE_PODS).map((obs) =>
    humanReadablePod({
      obs,
      d1Rows: featureRows.D1.test,
      d1Columns: d1DenseNames,
      c2Columns: d1Names.frozenC2Columns,
      breaks,
    }),
  );

  const report = {
    version: "commander-model-d-diagnostics-v1",
    generatedAt: new Date().toISOString(),
    purpose: "Diagnostics-only postmortem — no retraining authorization, no TEST-driven feature design.",
    authorization: {
      modelC: "ACCEPTED_FROZEN",
      modelD: "COMPLETE_NEGATIVE_RESULT",
      dRetraining: "NOT_AUTHORIZED",
      newDArchitecture: "WAIT",
      rc8: "FROZEN",
      prospectiveHoldout: "SEALED",
    },
    conclusion:
      "Frozen D0/D1 representation did not add stable incremental TEST signal beyond C2. This does not prove matchup effects absent — only that this representation did not add measurable information.",
    validationLogLoss: valMetrics,
    validationVsTest: {
      C2: {
        validation: valMetrics.C2,
        test: (existingReport.metrics as { test: Record<string, { logLoss: number }> }).test.C2!.logLoss,
        deltaValidationMinusTest: valMetrics.C2 - (existingReport.metrics as { test: Record<string, { logLoss: number }> }).test.C2!.logLoss,
      },
      D0: {
        validation: valMetrics.D0,
        test: (existingReport.metrics as { test: Record<string, { logLoss: number }> }).test.D0!.logLoss,
        deltaValidationMinusTest: valMetrics.D0 - (existingReport.metrics as { test: Record<string, { logLoss: number }> }).test.D0!.logLoss,
      },
      D1: {
        validation: valMetrics.D1,
        test: (existingReport.metrics as { test: Record<string, { logLoss: number }> }).test.D1!.logLoss,
        deltaValidationMinusTest: valMetrics.D1 - (existingReport.metrics as { test: Record<string, { logLoss: number }> }).test.D1!.logLoss,
      },
    },
    testLogLoss: Object.fromEntries(
      (["C2", "D0", "D1"] as const).map((m) => [
        m,
        (existingReport.metrics as { test: Record<string, { logLoss: number }> }).test[m]!.logLoss,
      ]),
    ),
    primaryComparison: existingReport.primaryComparisons,
    bootstrapAllTest: (existingReport.bootstrapUncertainty as { allTest: unknown }).allTest,
    podSizeMetrics: existingReport.metrics
      ? (existingReport.metrics as { testPodSizeMetrics: unknown }).testPodSizeMetrics
      : null,
    podSizeBootstrapNote: "D1-vs-D0 bootstrap CIs were not precomputed by pod size; only all-TEST CIs available.",
    coefficientUtilization: {
      selectedRegularization: {
        D0: hyper.D0.lambdas,
        D1: hyper.D1.lambdas,
        note: "Both blocks selected minimum grid value λ=0.01 on VALIDATION.",
      },
      D0_opponentContextBlock: {
        ...coefficientUtilization(d0Block),
        coefficients: d0Block,
      },
      D1_semanticMatchupBlock: {
        ...coefficientUtilization(d1Block),
      },
    },
    featureVarianceRedundancy: {
      D0_opponentContext: d0FeatureStats,
      D1_semanticMatchup: d1FeatureStats,
      interpretationGuide: {
        reconstructableFromC2: `max |corr| with any C2 dense column >= ${C2_RECONSTRUCT_CORR}`,
        nearDuplicatePairs: `|corr| >= ${DUPLICATE_CORR} within block`,
      },
    },
    opponentAggregationHomogeneity: aggregationHomogeneity,
    allMatchupChannelCoefficients: matchupCoefRows,
    humanReadableSanityExamples: {
      disclaimer: "Mechanical feature verification only — not for model tuning.",
      sampleCount: SAMPLE_PODS,
      seed: DIAG_SEED,
      pods: samplePods,
    },
    reportHash: "",
  };

  report.reportHash = createHash("sha256")
    .update(JSON.stringify({ ...report, reportHash: undefined }))
    .digest("hex");

  const outDir = modelArtifactDir(MODEL_D_VERSION);
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, "model-d-diagnostics-report-v1.json");
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify({ outPath, validationLogLoss: valMetrics, testLogLoss: report.testLogLoss }, null, 2));
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
