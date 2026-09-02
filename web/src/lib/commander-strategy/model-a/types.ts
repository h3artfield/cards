export const MODEL_A_VERSION = "commander-model-a-v1";

export const PRIMARY_POD_SIZES = new Set([3, 4]);

export type CommanderSupportBucket = "high" | "medium" | "low" | "unseen";

export type ModelASeat = {
  seatIndex: number;
  playerHash: string;
  commanderConfigurationId: string;
  deckHash: string;
  winner: boolean;
};

export type ModelAPodObservation = {
  podId: string;
  tournamentId: string;
  tournamentDate: string;
  podSize: number;
  seats: ModelASeat[];
  winnerSeatIndex: number;
  split: "train" | "validation" | "test";
  primaryPodSize: boolean;
};

export type ModelAPredictionRow = {
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
  predictedProbabilityBySeat: number[];
  uniformPredictedProbabilityBySeat: number[];
  frequencyBaselinePredictedProbabilityBySeat: number[];
  modelAPredictedProbabilityBySeat: number[];
  commanderSupportBucket: CommanderSupportBucket;
  deckHashSeenInTrain: boolean;
  commanderConfigSeenInTrain: boolean;
  modelVersion: typeof MODEL_A_VERSION;
  datasetHash: string;
};

export type ModelAMetrics = {
  podCount: number;
  logLoss: number;
  brierScore: number;
  topPredictedSeatAccuracy: number;
  expectedCalibrationError: number;
  logLikelihoodImprovementOverUniform: number;
  calibrationBins: Array<{
    binLabel: string;
    predictedMean: number;
    actualWinRate: number;
    count: number;
  }>;
};

export type ModelAHyperparameters = {
  l2Lambda: number;
  learningRate: number;
  epochs: number;
  frequencyBaselineShrinkageAlpha: number;
  supportBuckets: {
    highMinTrainAppearances: number;
    mediumMinTrainAppearances: number;
  };
  primaryPodSizes: number[];
  selectedOnSplit: "validation";
};

export type CommanderStrengthRow = {
  commanderConfigurationId: string;
  trainingSeatAppearances: number;
  trainingPodAppearances: number;
  trainingWins: number;
  observedTrainWinRate: number;
  modelEstimatedUtility: number;
  impliedNeutralFourPodWinProbability: number | null;
  supportBucket: CommanderSupportBucket;
  seenInTrain: boolean;
};
