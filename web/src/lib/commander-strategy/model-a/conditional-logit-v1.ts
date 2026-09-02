import type { ModelAPodObservation } from "./types";

export type ConditionalLogitModel = {
  l2Lambda: number;
  configToIndex: Map<string, number>;
  coefficients: Float64Array;
  unseenUtility: number;
};

export function buildConfigIndex(trainObservations: ModelAPodObservation[]): Map<string, number> {
  const configToIndex = new Map<string, number>();
  for (const obs of trainObservations) {
    for (const seat of obs.seats) {
      if (!configToIndex.has(seat.commanderConfigurationId)) {
        configToIndex.set(seat.commanderConfigurationId, configToIndex.size);
      }
    }
  }
  return configToIndex;
}

function utilitiesForPod(
  commanderConfigIds: string[],
  model: ConditionalLogitModel,
): number[] {
  return commanderConfigIds.map((id) => {
    const idx = model.configToIndex.get(id);
    if (idx === undefined) return model.unseenUtility;
    return model.coefficients[idx] ?? 0;
  });
}

export function softmaxProbabilities(utilities: number[]): number[] {
  const maxU = Math.max(...utilities);
  const exps = utilities.map((u) => Math.exp(u - maxU));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function modelAProbabilities(
  commanderConfigIds: string[],
  model: ConditionalLogitModel,
): number[] {
  return softmaxProbabilities(utilitiesForPod(commanderConfigIds, model));
}

function nllAndGradient(
  observations: ModelAPodObservation[],
  model: ConditionalLogitModel,
): { nll: number; grad: Float64Array } {
  const grad = new Float64Array(model.coefficients.length);
  let nll = 0;

  for (const obs of observations) {
    const configIds = obs.seats.map((s) => s.commanderConfigurationId);
    const utilities = utilitiesForPod(configIds, model);
    const probs = softmaxProbabilities(utilities);
    nll -= Math.log(Math.max(probs[obs.winnerSeatIndex]!, 1e-15));

    for (let i = 0; i < obs.seats.length; i++) {
      const delta = probs[i]! - (i === obs.winnerSeatIndex ? 1 : 0);
      const configId = configIds[i]!;
      const idx = model.configToIndex.get(configId);
      if (idx !== undefined) {
        grad[idx]! += delta;
      }
    }
  }

  nll /= observations.length;
  for (let i = 0; i < grad.length; i++) {
    grad[i]! /= observations.length;
    grad[i]! += 2 * model.l2Lambda * model.coefficients[i]!;
  }

  return { nll, grad };
}

export function fitConditionalLogit(input: {
  trainObservations: ModelAPodObservation[];
  l2Lambda: number;
  learningRate?: number;
  epochs?: number;
}): ConditionalLogitModel {
  const configToIndex = buildConfigIndex(input.trainObservations);
  const coefficients = new Float64Array(configToIndex.size);
  const learningRate = input.learningRate ?? 0.05;
  const epochs = input.epochs ?? 250;

  const model: ConditionalLogitModel = {
    l2Lambda: input.l2Lambda,
    configToIndex,
    coefficients,
    unseenUtility: 0,
  };

  for (let epoch = 0; epoch < epochs; epoch++) {
    const { grad } = nllAndGradient(input.trainObservations, model);
    for (let i = 0; i < coefficients.length; i++) {
      coefficients[i]! -= learningRate * grad[i]!;
    }
  }

  return model;
}

export function serializeConditionalLogitModel(model: ConditionalLogitModel): {
  l2Lambda: number;
  unseenUtility: number;
  coefficients: Array<{ commanderConfigurationId: string; utility: number }>;
} {
  const coefficients: Array<{ commanderConfigurationId: string; utility: number }> = [];
  for (const [configId, idx] of model.configToIndex.entries()) {
    coefficients.push({
      commanderConfigurationId: configId,
      utility: model.coefficients[idx] ?? 0,
    });
  }
  coefficients.sort((a, b) => b.utility - a.utility);
  return {
    l2Lambda: model.l2Lambda,
    unseenUtility: model.unseenUtility,
    coefficients,
  };
}

export function impliedNeutralFourPodWinProbability(utility: number): number {
  const expU = Math.exp(utility);
  return expU / (expU + 3);
}
