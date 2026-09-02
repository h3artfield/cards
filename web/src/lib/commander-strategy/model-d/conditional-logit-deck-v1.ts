import type { ModelAPodObservation } from "../model-a/types";
import { softmaxProbabilities } from "../model-a/conditional-logit-v1";
import {
  commanderPlayerUtilitiesForObservation,
  type ConditionalLogitCommanderPlayerModel,
} from "../model-b/conditional-logit-commander-player-v1";
import type { ModelCBlockLambdas } from "../model-c/conditional-logit-deck-v1";
import type { LoadedFeatureRow } from "../model-c/feature-matrix-io-v1";
import { standardizeDenseValues, type FeatureStandardizer } from "../model-c/standardization-v1";
import { featureBlockForModelDColumn } from "./feature-blocks-v1";
import type { ModelDVariant } from "./types";

export type ModelDBlockLambdas = ModelCBlockLambdas & {
  lambdaOpponentContext: number;
  lambdaSemanticMatchup: number;
};

export type ConditionalLogitModelD = {
  variant: ModelDVariant;
  frozenB: ConditionalLogitCommanderPlayerModel;
  columnNames: string[];
  denseColumnCount: number;
  standardizer: FeatureStandardizer;
  coefficients: Float64Array;
  cardIdColumnNames: string[];
  cardIdColumnToCoeffIndex: Map<string, number>;
  cardIdSupportCutoff: number;
  lambdas: ModelDBlockLambdas;
  learningRate: number;
  epochs: number;
};

type PreparedSeat = {
  denseX: Float64Array;
  sparseTerms: Array<{ coeffIdx: number; value: number }>;
};

type PreparedObservation = {
  winnerSeatIndex: number;
  baseUtilities: number[];
  seats: PreparedSeat[];
};

function lambdaForColumn(name: string, lambdas: ModelDBlockLambdas): number {
  const block = featureBlockForModelDColumn(name);
  if (block === "OPPONENT_CONTEXT") return lambdas.lambdaOpponentContext;
  if (block === "SEMANTIC_MATCHUP") return lambdas.lambdaSemanticMatchup;
  if (block === "CARD_ID") return lambdas.lambdaCardIdentity;
  if (name.startsWith("basic_")) return lambdas.lambdaBasic;
  if (name.startsWith("gc_")) return lambdas.lambdaGameChanger;
  return lambdas.lambdaSemantic;
}

function buildCardIdSupport(input: {
  trainRows: LoadedFeatureRow[];
  allowedCardColumns: Set<string>;
  supportCutoff: number;
}): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of input.trainRows) {
    for (const [name, value] of Object.entries(row.sparseCardIdentity ?? {})) {
      if (value <= 0 || !input.allowedCardColumns.has(name)) continue;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  const supported = new Map<string, number>();
  [...counts.entries()]
    .filter(([, count]) => count >= input.supportCutoff)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([name], idx) => supported.set(name, idx));
  return supported;
}

function prepareSeat(
  row: LoadedFeatureRow | undefined,
  standardizer: FeatureStandardizer,
  cardIdColumnToCoeffIndex: Map<string, number>,
  denseColumnCount: number,
): PreparedSeat {
  const denseX = standardizeDenseValues(row?.denseValues ?? [], standardizer);
  const sparseTerms: Array<{ coeffIdx: number; value: number }> = [];
  for (const [name, value] of Object.entries(row?.sparseCardIdentity ?? {})) {
    if (value <= 0) continue;
    const relIdx = cardIdColumnToCoeffIndex.get(name);
    if (relIdx === undefined) continue;
    sparseTerms.push({ coeffIdx: denseColumnCount + relIdx, value });
  }
  return { denseX, sparseTerms };
}

function prepareObservations(
  observations: ModelAPodObservation[],
  featureRowsByKey: Map<string, LoadedFeatureRow>,
  frozenB: ConditionalLogitCommanderPlayerModel,
  standardizer: FeatureStandardizer,
  cardIdColumnToCoeffIndex: Map<string, number>,
  denseColumnCount: number,
): PreparedObservation[] {
  return observations.map((obs) => ({
    winnerSeatIndex: obs.winnerSeatIndex,
    baseUtilities: commanderPlayerUtilitiesForObservation(obs, frozenB),
    seats: obs.seats.map((seat) =>
      prepareSeat(
        featureRowsByKey.get(`${obs.podId}:${seat.seatIndex}`),
        standardizer,
        cardIdColumnToCoeffIndex,
        denseColumnCount,
      ),
    ),
  }));
}

function utilitiesFromPrepared(prepared: PreparedObservation, coefficients: Float64Array): number[] {
  return prepared.seats.map((seat, i) => {
    let u = prepared.baseUtilities[i] ?? 0;
    for (let j = 0; j < seat.denseX.length; j += 1) {
      u += coefficients[j]! * seat.denseX[j]!;
    }
    for (const term of seat.sparseTerms) {
      u += coefficients[term.coeffIdx]! * term.value;
    }
    return u;
  });
}

function seatUtility(input: {
  baseUtility: number;
  row: LoadedFeatureRow | undefined;
  model: ConditionalLogitModelD;
}): number {
  if (!input.row) return input.baseUtility;
  const seat = prepareSeat(
    input.row,
    input.model.standardizer,
    input.model.cardIdColumnToCoeffIndex,
    input.model.denseColumnCount,
  );
  let u = input.baseUtility;
  for (let j = 0; j < seat.denseX.length; j += 1) {
    u += (input.model.coefficients[j] ?? 0) * seat.denseX[j]!;
  }
  for (const term of seat.sparseTerms) {
    u += (input.model.coefficients[term.coeffIdx] ?? 0) * term.value;
  }
  return u;
}

export function modelDPredictProbabilities(
  obs: ModelAPodObservation,
  model: ConditionalLogitModelD,
  featureRowsByKey: Map<string, LoadedFeatureRow>,
): number[] {
  const base = commanderPlayerUtilitiesForObservation(obs, model.frozenB);
  const utilities = obs.seats.map((seat, i) =>
    seatUtility({
      baseUtility: base[i]!,
      row: featureRowsByKey.get(`${obs.podId}:${seat.seatIndex}`),
      model,
    }),
  );
  return softmaxProbabilities(utilities);
}

function nllAndGradientPrepared(
  preparedObservations: PreparedObservation[],
  model: ConditionalLogitModelD,
): { nll: number; grad: Float64Array } {
  const grad = new Float64Array(model.coefficients.length);
  let nll = 0;

  for (const obs of preparedObservations) {
    const utilities = utilitiesFromPrepared(obs, model.coefficients);
    const probs = softmaxProbabilities(utilities);
    nll -= Math.log(Math.max(probs[obs.winnerSeatIndex]!, 1e-15));

    for (let i = 0; i < obs.seats.length; i += 1) {
      const delta = probs[i]! - (i === obs.winnerSeatIndex ? 1 : 0);
      const seat = obs.seats[i]!;
      for (let j = 0; j < seat.denseX.length; j += 1) {
        grad[j]! += delta * seat.denseX[j]!;
      }
      for (const term of seat.sparseTerms) {
        grad[term.coeffIdx]! += delta * term.value;
      }
    }
  }

  const n = preparedObservations.length;
  nll /= n;
  for (let j = 0; j < grad.length; j += 1) grad[j]! /= n;

  for (let j = 0; j < model.denseColumnCount; j += 1) {
    const name = model.columnNames[j]!;
    grad[j]! += 2 * lambdaForColumn(name, model.lambdas) * model.coefficients[j]!;
  }
  for (let k = 0; k < model.cardIdColumnNames.length; k += 1) {
    const coeffIdx = model.denseColumnCount + k;
    grad[coeffIdx]! += 2 * model.lambdas.lambdaCardIdentity * model.coefficients[coeffIdx]!;
  }

  return { nll, grad };
}

export function fitConditionalLogitModelD(input: {
  variant: ModelDVariant;
  trainObservations: ModelAPodObservation[];
  featureRowsByKey: Map<string, LoadedFeatureRow>;
  frozenB: ConditionalLogitCommanderPlayerModel;
  denseColumnNames: string[];
  cardIdColumnNames: string[];
  standardizer: FeatureStandardizer;
  lambdas: ModelDBlockLambdas;
  cardIdSupportCutoff: number;
  learningRate?: number;
  epochs?: number;
}): ConditionalLogitModelD {
  const trainRows = input.trainObservations.flatMap((obs) =>
    obs.seats
      .map((seat) => input.featureRowsByKey.get(`${obs.podId}:${seat.seatIndex}`))
      .filter(Boolean),
  ) as LoadedFeatureRow[];

  const cardIdColumnToCoeffIndex = buildCardIdSupport({
    trainRows,
    allowedCardColumns: new Set(input.cardIdColumnNames),
    supportCutoff: input.cardIdSupportCutoff,
  });
  const cardIdColumnNames = [...cardIdColumnToCoeffIndex.keys()];
  const denseColumnCount = input.denseColumnNames.length;
  const coefficients = new Float64Array(denseColumnCount + cardIdColumnNames.length);

  const model: ConditionalLogitModelD = {
    variant: input.variant,
    frozenB: input.frozenB,
    columnNames: input.denseColumnNames,
    denseColumnCount,
    standardizer: input.standardizer,
    coefficients,
    cardIdColumnNames,
    cardIdColumnToCoeffIndex,
    cardIdSupportCutoff: input.cardIdSupportCutoff,
    lambdas: input.lambdas,
    learningRate: input.learningRate ?? 0.05,
    epochs: input.epochs ?? 250,
  };

  const prepared = prepareObservations(
    input.trainObservations,
    input.featureRowsByKey,
    input.frozenB,
    input.standardizer,
    cardIdColumnToCoeffIndex,
    denseColumnCount,
  );

  for (let epoch = 0; epoch < model.epochs; epoch += 1) {
    const { grad } = nllAndGradientPrepared(prepared, model);
    for (let j = 0; j < coefficients.length; j += 1) {
      coefficients[j]! -= model.learningRate * grad[j]!;
    }
  }

  return model;
}

export function topMatchupCoefficients(model: ConditionalLogitModelD, limit = 30): Array<{
  feature: string;
  coefficient: number;
  standardizedMagnitude: number;
  family: string;
  channel: string;
  reducer: string;
}> {
  const rows = model.columnNames
    .map((name, j) => {
      if (!name.startsWith("match_")) return null;
      const body = name.slice("match_".length);
      const reducerMatch = body.match(/_(meanAcrossOpponents|maxAcrossOpponents|minAcrossOpponents)$/);
      const reducer = reducerMatch?.[1] ?? "unknown";
      const channel = reducerMatch ? body.slice(0, -reducerMatch[0].length) : body;
      return {
        feature: name,
        coefficient: model.coefficients[j] ?? 0,
        standardizedMagnitude: Math.abs(model.coefficients[j] ?? 0),
        family: "SEMANTIC_MATCHUP",
        channel,
        reducer,
      };
    })
    .filter(Boolean) as Array<{
    feature: string;
    coefficient: number;
    standardizedMagnitude: number;
    family: string;
    channel: string;
    reducer: string;
  }>;
  return rows.sort((a, b) => b.standardizedMagnitude - a.standardizedMagnitude).slice(0, limit);
}

export function serializeModelD(model: ConditionalLogitModelD): Record<string, unknown> {
  return {
    variant: model.variant,
    denseColumnCount: model.denseColumnCount,
    cardIdSupportCutoff: model.cardIdSupportCutoff,
    supportedCardIdCount: model.cardIdColumnNames.length,
    lambdas: model.lambdas,
    topMatchupCoefficients: model.variant === "D1" ? topMatchupCoefficients(model, 36) : [],
    note: "Predictive associations on TRAIN-standardized features — not causal claims.",
  };
}
