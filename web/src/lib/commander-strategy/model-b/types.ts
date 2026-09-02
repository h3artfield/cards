import type { ModelAMetrics } from "../model-a/types";

export const MODEL_B_VERSION = "commander-model-b-v1";

export type ModelBMode = "commander_player" | "player_only";

export type ModelBHyperparameters = {
  lambdaCommander: number;
  lambdaPlayer: number;
  learningRate: number;
  epochs: number;
  selectedOnSplit: "validation";
  playerOnlyLambdaPlayer: number;
};

export type ModelBPredictionRow = {
  podId: string;
  tournamentId: string;
  tournamentDate: string;
  podSize: number;
  split: "validation" | "test";
  seats: Array<{
    seatIndex: number;
    playerHash: string;
    commanderConfigurationId: string;
    deckHash: string;
    winner: boolean;
  }>;
  actualWinnerSeat: number;
  uniformPredictedProbabilityBySeat: number[];
  frequencyBaselinePredictedProbabilityBySeat: number[];
  frozenModelAPredictedProbabilityBySeat: number[];
  playerOnlyPredictedProbabilityBySeat: number[];
  modelBPredictedProbabilityBySeat: number[];
  deckHashSeenInTrain: boolean;
  commanderConfigSeenInTrain: boolean;
  allPlayersSeenInTrain: boolean;
  anyPlayerUnseenInTrain: boolean;
  modelVersion: typeof MODEL_B_VERSION;
  frozenModelAVersion: string;
  datasetHash: string;
};

export type DeltaLogLossComparison = {
  comparison: string;
  deltaLogLoss: number;
  bootstrapMethod: string;
  bootstrapSeed: number;
  bootstrapReplicates: number;
  clusterUnit: "tournamentId";
  confidenceLevel: 0.95;
  ciLower: number;
  ciUpper: number;
};

export type ModelBEvaluationBundle = {
  uniform: ModelAMetrics;
  frequency: ModelAMetrics;
  frozenModelA: ModelAMetrics;
  playerOnly: ModelAMetrics;
  modelB: ModelAMetrics;
};
