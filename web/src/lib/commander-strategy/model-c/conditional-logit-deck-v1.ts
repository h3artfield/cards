import type { ModelAPodObservation } from "../model-a/types";
import { softmaxProbabilities } from "../model-a/conditional-logit-v1";
import {
  commanderPlayerUtilitiesForObservation,
  type ConditionalLogitCommanderPlayerModel,
} from "../model-b/conditional-logit-commander-player-v1";
import type { LoadedFeatureRow } from "./feature-matrix-io-v1";
import { featureBlockForColumn } from "./feature-matrix-io-v1";
import { standardizeDenseValues, type FeatureStandardizer } from "./standardization-v1";
import type { ModelCVariant } from "./types";

export type ModelCBlockLambdas = {
  lambdaBasic: number;
  lambdaGameChanger: number;
  lambdaSemantic: number;
  lambdaCardIdentity: number;
};

export type ConditionalLogitDeckModel = {
  variant: ModelCVariant;
  frozenB: ConditionalLogitCommanderPlayerModel;
  columnNames: string[];
  denseColumnCount: number;
  standardizer: FeatureStandardizer;
  coefficients: Float64Array;
  cardIdColumnNames: string[];
  cardIdColumnToCoeffIndex: Map<string, number>;
  cardIdSupportCutoff: number;
  lambdas: ModelCBlockLambdas;
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

function lambdaForColumn(name: string, lambdas: ModelCBlockLambdas): number {
  const block = featureBlockForColumn(name);
  if (block === "BASIC") return lambdas.lambdaBasic;
  if (block === "GAME_CHANGER") return lambdas.lambdaGameChanger;
  if (block === "CARD_ID") return lambdas.lambdaCardIdentity;
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
  const eligible = [...counts.entries()]
    .filter(([, count]) => count >= input.supportCutoff)
    .sort(([a], [b]) => a.localeCompare(b));
  eligible.forEach(([name], idx) => supported.set(name, idx));
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

export function seatUtility(input: {
  baseUtility: number;
  row: LoadedFeatureRow | undefined;
  model: ConditionalLogitDeckModel;
}): number {
  if (!input.row) return input.baseUtility;
  const seat = prepareSeat(input.row, input.model.standardizer, input.model.cardIdColumnToCoeffIndex, input.model.denseColumnCount);
  let u = input.baseUtility;
  for (let j = 0; j < seat.denseX.length; j += 1) {
    u += (input.model.coefficients[j] ?? 0) * seat.denseX[j]!;
  }
  for (const term of seat.sparseTerms) {
    u += (input.model.coefficients[term.coeffIdx] ?? 0) * term.value;
  }
  return u;
}

export function modelCPredictProbabilities(
  obs: ModelAPodObservation,
  model: ConditionalLogitDeckModel,
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
  model: ConditionalLogitDeckModel,
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
  for (let j = 0; j < grad.length; j += 1) {
    grad[j]! /= n;
  }

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

export function fitConditionalLogitDeckModel(input: {
  variant: ModelCVariant;
  trainObservations: ModelAPodObservation[];
  featureRowsByKey: Map<string, LoadedFeatureRow>;
  frozenB: ConditionalLogitCommanderPlayerModel;
  columnNames: string[];
  denseColumnNames: string[];
  cardIdColumnNames: string[];
  standardizer: FeatureStandardizer;
  lambdas: ModelCBlockLambdas;
  cardIdSupportCutoff: number;
  learningRate?: number;
  epochs?: number;
}): ConditionalLogitDeckModel {
  const trainRows = input.trainObservations.flatMap((obs) =>
    obs.seats
      .map((seat) => input.featureRowsByKey.get(`${obs.podId}:${seat.seatIndex}`))
      .filter(Boolean),
  ) as LoadedFeatureRow[];

  const allowedCardColumns = new Set(input.cardIdColumnNames);
  const cardIdColumnToCoeffIndex =
    input.variant === "ID" || input.variant === "C2"
      ? buildCardIdSupport({
          trainRows,
          allowedCardColumns,
          supportCutoff: input.cardIdSupportCutoff,
        })
      : new Map<string, number>();

  const cardIdColumnNames = [...cardIdColumnToCoeffIndex.keys()];
  const denseColumnCount = input.denseColumnNames.length;
  const coefficients = new Float64Array(denseColumnCount + cardIdColumnNames.length);

  const model: ConditionalLogitDeckModel = {
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

export function topStandardizedCoefficients(model: ConditionalLogitDeckModel, limit = 20): {
  positive: Array<{ name: string; coefficient: number; block: string }>;
  negative: Array<{ name: string; coefficient: number; block: string }>;
} {
  const rows = model.columnNames.map((name, j) => ({
    name,
    coefficient: model.coefficients[j] ?? 0,
    block: featureBlockForColumn(name),
  }));
  const positive = [...rows].sort((a, b) => b.coefficient - a.coefficient).slice(0, limit);
  const negative = [...rows].sort((a, b) => a.coefficient - b.coefficient).slice(0, limit);
  return { positive, negative };
}

export function topCardIdentityCoefficients(model: ConditionalLogitDeckModel, limit = 30): Array<{
  cardColumn: string;
  coefficient: number;
}> {
  const rows = model.cardIdColumnNames.map((name, k) => ({
    cardColumn: name,
    coefficient: model.coefficients[model.denseColumnCount + k] ?? 0,
  }));
  return rows.sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient)).slice(0, limit);
}

export function serializeDeckModel(model: ConditionalLogitDeckModel): Record<string, unknown> {
  return {
    variant: model.variant,
    denseColumnCount: model.denseColumnCount,
    cardIdSupportCutoff: model.cardIdSupportCutoff,
    supportedCardIdCount: model.cardIdColumnNames.length,
    lambdas: model.lambdas,
    topCoefficients: topStandardizedCoefficients(model, 50),
    topCardIdentityCoefficients:
      model.variant === "ID" || model.variant === "C2"
        ? topCardIdentityCoefficients(model, 50)
        : [],
    note: "Coefficients apply to TRAIN-standardized features. Predictive associations only — not causal card-power rankings.",
  };
}
