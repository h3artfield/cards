import type { ModelAPodObservation } from "../model-a/types";
import { softmaxProbabilities } from "../model-a/conditional-logit-v1";
import type { ModelBMode } from "./types";

export type ConditionalLogitCommanderPlayerModel = {
  mode: ModelBMode;
  lambdaCommander: number;
  lambdaPlayer: number;
  configToIndex: Map<string, number>;
  playerToIndex: Map<string, number>;
  commanderCoefficients: Float64Array;
  playerCoefficients: Float64Array;
  unseenUtility: number;
};

function buildPlayerIndex(trainObservations: ModelAPodObservation[]): Map<string, number> {
  const playerToIndex = new Map<string, number>();
  for (const obs of trainObservations) {
    for (const seat of obs.seats) {
      if (!playerToIndex.has(seat.playerHash)) {
        playerToIndex.set(seat.playerHash, playerToIndex.size);
      }
    }
  }
  return playerToIndex;
}

function buildConfigIndex(trainObservations: ModelAPodObservation[]): Map<string, number> {
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

function utilitiesForObservation(
  obs: ModelAPodObservation,
  model: ConditionalLogitCommanderPlayerModel,
): number[] {
  return obs.seats.map((seat) => {
    let utility = 0;
    if (model.mode === "commander_player") {
      const configIdx = model.configToIndex.get(seat.commanderConfigurationId);
      utility += configIdx !== undefined ? model.commanderCoefficients[configIdx] ?? 0 : model.unseenUtility;
    }
    const playerIdx = model.playerToIndex.get(seat.playerHash);
    utility += playerIdx !== undefined ? model.playerCoefficients[playerIdx] ?? 0 : model.unseenUtility;
    return utility;
  });
}

export function commanderPlayerUtilitiesForObservation(
  obs: ModelAPodObservation,
  model: ConditionalLogitCommanderPlayerModel,
): number[] {
  return utilitiesForObservation(obs, model);
}

export function modelBPredictProbabilities(
  obs: ModelAPodObservation,
  model: ConditionalLogitCommanderPlayerModel,
): number[] {
  return softmaxProbabilities(commanderPlayerUtilitiesForObservation(obs, model));
}

function nllAndGradient(
  observations: ModelAPodObservation[],
  model: ConditionalLogitCommanderPlayerModel,
): {
  nll: number;
  commanderGrad: Float64Array;
  playerGrad: Float64Array;
} {
  const commanderGrad = new Float64Array(model.commanderCoefficients.length);
  const playerGrad = new Float64Array(model.playerCoefficients.length);
  let nll = 0;

  for (const obs of observations) {
    const utilities = utilitiesForObservation(obs, model);
    const probs = softmaxProbabilities(utilities);
    nll -= Math.log(Math.max(probs[obs.winnerSeatIndex]!, 1e-15));

    for (let i = 0; i < obs.seats.length; i++) {
      const delta = probs[i]! - (i === obs.winnerSeatIndex ? 1 : 0);
      const seat = obs.seats[i]!;

      if (model.mode === "commander_player") {
        const configIdx = model.configToIndex.get(seat.commanderConfigurationId);
        if (configIdx !== undefined) commanderGrad[configIdx]! += delta;
      }

      const playerIdx = model.playerToIndex.get(seat.playerHash);
      if (playerIdx !== undefined) playerGrad[playerIdx]! += delta;
    }
  }

  nll /= observations.length;
  for (let i = 0; i < commanderGrad.length; i++) {
    commanderGrad[i]! /= observations.length;
    commanderGrad[i]! += 2 * model.lambdaCommander * model.commanderCoefficients[i]!;
  }
  for (let i = 0; i < playerGrad.length; i++) {
    playerGrad[i]! /= observations.length;
    playerGrad[i]! += 2 * model.lambdaPlayer * model.playerCoefficients[i]!;
  }

  return { nll, commanderGrad, playerGrad };
}

export function fitConditionalLogitCommanderPlayer(input: {
  trainObservations: ModelAPodObservation[];
  mode: ModelBMode;
  lambdaCommander: number;
  lambdaPlayer: number;
  learningRate?: number;
  epochs?: number;
}): ConditionalLogitCommanderPlayerModel {
  const configToIndex = input.mode === "commander_player" ? buildConfigIndex(input.trainObservations) : new Map();
  const playerToIndex = buildPlayerIndex(input.trainObservations);
  const commanderCoefficients = new Float64Array(configToIndex.size);
  const playerCoefficients = new Float64Array(playerToIndex.size);
  const learningRate = input.learningRate ?? 0.05;
  const epochs = input.epochs ?? 250;

  const model: ConditionalLogitCommanderPlayerModel = {
    mode: input.mode,
    lambdaCommander: input.lambdaCommander,
    lambdaPlayer: input.lambdaPlayer,
    configToIndex,
    playerToIndex,
    commanderCoefficients,
    playerCoefficients,
    unseenUtility: 0,
  };

  for (let epoch = 0; epoch < epochs; epoch++) {
    const { commanderGrad, playerGrad } = nllAndGradient(input.trainObservations, model);
    for (let i = 0; i < commanderCoefficients.length; i++) {
      commanderCoefficients[i]! -= learningRate * commanderGrad[i]!;
    }
    for (let i = 0; i < playerCoefficients.length; i++) {
      playerCoefficients[i]! -= learningRate * playerGrad[i]!;
    }
  }

  return model;
}

export function serializeCommanderPlayerModel(model: ConditionalLogitCommanderPlayerModel): Record<string, unknown> {
  const commanderCoefficients =
    model.mode === "commander_player"
      ? [...model.configToIndex.entries()]
          .map(([commanderConfigurationId, idx]) => ({
            commanderConfigurationId,
            utility: model.commanderCoefficients[idx] ?? 0,
          }))
          .sort((a, b) => b.utility - a.utility)
      : [];

  const playerCoefficients = [...model.playerToIndex.entries()]
    .map(([playerHash, idx]) => ({
      playerHash,
      utility: model.playerCoefficients[idx] ?? 0,
    }))
    .sort((a, b) => b.utility - a.utility);

  return {
    mode: model.mode,
    lambdaCommander: model.lambdaCommander,
    lambdaPlayer: model.lambdaPlayer,
    unseenUtility: model.unseenUtility,
    commanderCount: commanderCoefficients.length,
    playerCount: playerCoefficients.length,
    commanderCoefficients: commanderCoefficients.slice(0, 100),
    playerCoefficients: playerCoefficients.slice(0, 100),
  };
}
