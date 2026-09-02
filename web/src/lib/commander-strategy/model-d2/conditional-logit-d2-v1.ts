import type { ModelAPodObservation } from "../model-a/types";
import { softmaxProbabilities } from "../model-a/conditional-logit-v1";
import { commanderPlayerUtilitiesForObservation } from "../model-b/conditional-logit-commander-player-v1";
import {
  seatUtility as c2SeatUtility,
  type ConditionalLogitDeckModel,
} from "../model-c/conditional-logit-deck-v1";
import type { LoadedFeatureRow } from "../model-c/feature-matrix-io-v1";
import { featureBlockForModelD2Column, lambdaForModelD2Column } from "./feature-blocks-v1";
import {
  standardizeNewBlockValues,
  type NewBlockStandardizer,
} from "./standardization-v1";
import type { ModelD2Variant } from "./types";

export type ModelD2BlockLambdas = {
  lambdaSelf: number;
  lambdaOpponentMarginal: number;
  lambdaInteraction: number;
};

export type ConditionalLogitModelD2 = {
  variant: ModelD2Variant;
  frozenC2: ConditionalLogitDeckModel;
  newColumnNames: string[];
  newColumnIndices: number[];
  newBlockStandardizer: NewBlockStandardizer;
  coefficients: Float64Array;
  lambdas: ModelD2BlockLambdas;
  learningRate: number;
  epochs: number;
};

type PreparedSeat = {
  c2Utility: number;
  newX: Float64Array;
};

type PreparedObservation = {
  winnerSeatIndex: number;
  seats: PreparedSeat[];
};

function prepareSeat(input: {
  row: LoadedFeatureRow | undefined;
  c2Row: LoadedFeatureRow | undefined;
  frozenC2: ConditionalLogitDeckModel;
  newColumnIndices: number[];
  standardizer: NewBlockStandardizer;
  baseUtility: number;
}): PreparedSeat {
  const c2Utility = input.c2Row
    ? c2SeatUtility({
        baseUtility: input.baseUtility,
        row: input.c2Row,
        model: input.frozenC2,
      })
    : input.baseUtility;
  const newX = input.row
    ? standardizeNewBlockValues(input.row, input.newColumnIndices, input.standardizer)
    : new Float64Array(input.newColumnIndices.length);
  return { c2Utility, newX };
}

function prepareObservations(input: {
  observations: ModelAPodObservation[];
  featureRowsByKey: Map<string, LoadedFeatureRow>;
  c2RowsByKey: Map<string, LoadedFeatureRow>;
  frozenC2: ConditionalLogitDeckModel;
  newColumnIndices: number[];
  standardizer: NewBlockStandardizer;
}): PreparedObservation[] {
  return input.observations.map((obs) => {
    const baseUtilities = commanderPlayerUtilitiesForObservation(obs, input.frozenC2.frozenB);
    return {
      winnerSeatIndex: obs.winnerSeatIndex,
      seats: obs.seats.map((seat, i) =>
        prepareSeat({
          row: input.featureRowsByKey.get(`${obs.podId}:${seat.seatIndex}`),
          c2Row: input.c2RowsByKey.get(`${obs.podId}:${seat.seatIndex}`),
          frozenC2: input.frozenC2,
          newColumnIndices: input.newColumnIndices,
          standardizer: input.standardizer,
          baseUtility: baseUtilities[i] ?? 0,
        }),
      ),
    };
  });
}

function utilitiesFromPrepared(prepared: PreparedObservation, coefficients: Float64Array): number[] {
  return prepared.seats.map((seat) => {
    let u = seat.c2Utility;
    for (let j = 0; j < seat.newX.length; j += 1) {
      u += coefficients[j]! * seat.newX[j]!;
    }
    return u;
  });
}

export function modelD2PredictProbabilities(
  obs: ModelAPodObservation,
  model: ConditionalLogitModelD2,
  featureRowsByKey: Map<string, LoadedFeatureRow>,
  c2RowsByKey: Map<string, LoadedFeatureRow>,
): number[] {
  const prepared = prepareObservations({
    observations: [obs],
    featureRowsByKey,
    c2RowsByKey,
    frozenC2: model.frozenC2,
    newColumnIndices: model.newColumnIndices,
    standardizer: model.newBlockStandardizer,
  })[0]!;
  return softmaxProbabilities(utilitiesFromPrepared(prepared, model.coefficients));
}

function nllAndGradientPrepared(
  preparedObservations: PreparedObservation[],
  model: ConditionalLogitModelD2,
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
      for (let j = 0; j < seat.newX.length; j += 1) {
        grad[j]! += delta * seat.newX[j]!;
      }
    }
  }

  const n = preparedObservations.length;
  nll /= n;
  for (let j = 0; j < grad.length; j += 1) grad[j]! /= n;

  for (let j = 0; j < model.coefficients.length; j += 1) {
    const name = model.newColumnNames[j]!;
    const lambda = lambdaForModelD2Column(name, model.lambdas);
    grad[j]! += 2 * lambda * model.coefficients[j]!;
  }

  return { nll, grad };
}

export function fitConditionalLogitModelD2(input: {
  variant: ModelD2Variant;
  trainObservations: ModelAPodObservation[];
  featureRowsByKey: Map<string, LoadedFeatureRow>;
  c2RowsByKey: Map<string, LoadedFeatureRow>;
  frozenC2: ConditionalLogitDeckModel;
  newColumnNames: string[];
  newColumnIndices: number[];
  standardizer: NewBlockStandardizer;
  lambdas: ModelD2BlockLambdas;
  learningRate?: number;
  epochs?: number;
}): ConditionalLogitModelD2 {
  const coefficients = new Float64Array(input.newColumnNames.length);
  const model: ConditionalLogitModelD2 = {
    variant: input.variant,
    frozenC2: input.frozenC2,
    newColumnNames: input.newColumnNames,
    newColumnIndices: input.newColumnIndices,
    newBlockStandardizer: input.standardizer,
    coefficients,
    lambdas: input.lambdas,
    learningRate: input.learningRate ?? 0.05,
    epochs: input.epochs ?? 200,
  };

  const prepared = prepareObservations({
    observations: input.trainObservations,
    featureRowsByKey: input.featureRowsByKey,
    c2RowsByKey: input.c2RowsByKey,
    frozenC2: input.frozenC2,
    newColumnIndices: input.newColumnIndices,
    standardizer: input.standardizer,
  });

  for (let epoch = 0; epoch < model.epochs; epoch += 1) {
    const { grad } = nllAndGradientPrepared(prepared, model);
    for (let j = 0; j < coefficients.length; j += 1) {
      coefficients[j]! -= model.learningRate * grad[j]!;
    }
  }

  return model;
}

export type BlockCoefficientDiagnostics = {
  block: string;
  selectedLambda: number;
  coefficientCount: number;
  l2Norm: number;
  maxAbsCoefficient: number;
  medianAbsCoefficient: number;
  zeroCount: number;
  nearZeroCount: number;
  materialCount: number;
};

export function blockCoefficientDiagnostics(
  model: ConditionalLogitModelD2,
): BlockCoefficientDiagnostics[] {
  const blocks: Record<string, number[]> = {
    IPV2_1_SELF: [],
    IPV2_1_OPP_MARGINAL: [],
    IPV2_1_RPS_INTERACTION: [],
  };
  for (let j = 0; j < model.newColumnNames.length; j += 1) {
    const name = model.newColumnNames[j]!;
    const coef = model.coefficients[j] ?? 0;
    blocks[featureBlockForModelD2Column(name)]!.push(coef);
  }

  const lambdaByBlock: Record<string, number> = {
    IPV2_1_SELF: model.lambdas.lambdaSelf,
    IPV2_1_OPP_MARGINAL: model.lambdas.lambdaOpponentMarginal,
    IPV2_1_RPS_INTERACTION: model.lambdas.lambdaInteraction,
  };

  return Object.entries(blocks).map(([block, coefs]) => {
    const abs = coefs.map(Math.abs).sort((a, b) => a - b);
    const l2 = Math.sqrt(coefs.reduce((s, c) => s + c * c, 0));
    const median = abs.length ? abs[Math.floor(abs.length / 2)]! : 0;
    return {
      block,
      selectedLambda: lambdaByBlock[block] ?? 0,
      coefficientCount: coefs.length,
      l2Norm: l2,
      maxAbsCoefficient: abs.length ? abs[abs.length - 1]! : 0,
      medianAbsCoefficient: median,
      zeroCount: coefs.filter((c) => c === 0).length,
      nearZeroCount: coefs.filter((c) => Math.abs(c) < 1e-6).length,
      materialCount: coefs.filter((c) => Math.abs(c) >= 1e-4).length,
    };
  });
}

export function interactionCoefficientGrid(model: ConditionalLogitModelD2): Array<{
  termKey: string;
  reducer: string;
  coefficient: number;
}> {
  const rows: Array<{ termKey: string; reducer: string; coefficient: number }> = [];
  for (let j = 0; j < model.newColumnNames.length; j += 1) {
    const name = model.newColumnNames[j]!;
    if (!name.startsWith("d2_")) continue;
    const body = name.slice("d2_".length);
    const reducerMatch = body.match(/_(meanAcrossOpponents|maxAcrossOpponents|minAcrossOpponents|varianceAcrossOpponents)$/);
    if (!reducerMatch) continue;
    const reducer = reducerMatch[1]!;
    const termKey = body.slice(0, -reducerMatch[0].length);
    rows.push({ termKey, reducer, coefficient: model.coefficients[j] ?? 0 });
  }
  return rows.sort((a, b) => a.termKey.localeCompare(b.termKey) || a.reducer.localeCompare(b.reducer));
}

export function zoneCoefficientMass(model: ConditionalLogitModelD2): Record<string, number> {
  const mass: Record<string, number> = {
    mainboardSelf: 0,
    commandZoneSelf: 0,
    mainboardRelianceMatchup: 0,
    commandZoneRelianceMatchup: 0,
  };
  for (let j = 0; j < model.newColumnNames.length; j += 1) {
    const name = model.newColumnNames[j]!;
    const c = model.coefficients[j] ?? 0;
    const sq = c * c;
    if (name.startsWith("ipv2_1_mb_")) mass.mainboardSelf! += sq;
    else if (name.startsWith("ipv2_1_cmd_")) mass.commandZoneSelf! += sq;
    else if (name.includes("_myMb") || name.includes("_myCmd")) {
      if (name.includes("_myCmd")) mass.commandZoneRelianceMatchup! += sq;
      else mass.mainboardRelianceMatchup! += sq;
    }
  }
  return mass;
}

export function serializeModelD2(model: ConditionalLogitModelD2): Record<string, unknown> {
  return {
    variant: model.variant,
    newColumnNames: model.newColumnNames,
    coefficients: [...model.coefficients],
    lambdas: model.lambdas,
    learningRate: model.learningRate,
    epochs: model.epochs,
    blockDiagnostics: blockCoefficientDiagnostics(model),
    interactionCoefficients: model.variant === "D2" ? interactionCoefficientGrid(model) : [],
    interactionCoefficientsByRelationship:
      model.variant === "D2" ? groupInteractionCoefficientsByRelationship(model) : {},
    zoneCoefficientMass: zoneCoefficientMass(model),
    note: "New-block coefficients only — C2 offset frozen separately.",
  };
}

export function groupInteractionCoefficientsByRelationship(
  model: ConditionalLogitModelD2,
): Record<string, Record<string, { coefficient: number; column: string }>> {
  const grouped: Record<string, Record<string, { coefficient: number; column: string }>> = {};
  for (let j = 0; j < model.newColumnNames.length; j += 1) {
    const name = model.newColumnNames[j]!;
    if (!name.startsWith("d2_")) continue;
    const body = name.slice("d2_".length);
    const reducerMatch = body.match(
      /_(meanAcrossOpponents|maxAcrossOpponents|minAcrossOpponents|varianceAcrossOpponents)$/,
    );
    if (!reducerMatch) continue;
    const reducer = reducerMatch[1]!;
    const termKey = body.slice(0, -reducerMatch[0].length);
    grouped[termKey] ??= {};
    grouped[termKey]![reducer] = { coefficient: model.coefficients[j] ?? 0, column: name };
  }
  return grouped;
}
