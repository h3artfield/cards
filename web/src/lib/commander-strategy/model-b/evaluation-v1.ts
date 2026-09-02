import { uniformProbabilities } from "../model-a/baselines-v1";
import { frequencyBaselineProbabilities, type FrequencyBaselineModel } from "../model-a/baselines-v1";
import type { ModelAMetrics, ModelAPodObservation } from "../model-a/types";
import { readFileSync } from "node:fs";
import type { ModelAPredictionRow } from "../model-a/types";
import { modelBPredictProbabilities, type ConditionalLogitCommanderPlayerModel } from "./conditional-logit-commander-player-v1";
import { playerSupportBucket } from "./player-support-v1";
import { evaluateObservationPredictorV1 } from "../evaluation-metrics-v1";

export type ObservationPredictor = (obs: ModelAPodObservation) => number[];

export function evaluateObservationPredictor(
  observations: ModelAPodObservation[],
  predict: ObservationPredictor,
): ModelAMetrics {
  return evaluateObservationPredictorV1(observations, predict);
}

export function loadFrozenModelAPredictions(path: string): Map<string, number[]> {
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  const map = new Map<string, number[]>();
  for (const line of lines) {
    const row = JSON.parse(line) as ModelAPredictionRow;
    map.set(row.podId, row.modelAPredictedProbabilityBySeat);
  }
  return map;
}

export type ModelBCohortFilter =
  | "all"
  | "deckHashNeverSeenInTrain"
  | "allPlayersSeenInTrain"
  | "anyPlayerUnseenInTrain"
  | "winnerPlayerHighSupport"
  | "winnerPlayerMediumSupport"
  | "winnerPlayerLowSupport"
  | "winnerPlayerUnseen"
  | "podSize3"
  | "podSize4";

export function filterByModelBCohort(
  observations: ModelAPodObservation[],
  cohort: ModelBCohortFilter,
  input: {
    trainDeckHashes: Set<string>;
    trainPlayers: Set<string>;
    trainPlayerAppearances: Map<string, number>;
  },
): ModelAPodObservation[] {
  return observations.filter((obs) => {
    const anyDeckUnseen = obs.seats.some(
      (s) => !s.deckHash.startsWith("unresolved:") && !input.trainDeckHashes.has(s.deckHash),
    );
    const allPlayersSeen = obs.seats.every((s) => input.trainPlayers.has(s.playerHash));
    const anyPlayerUnseen = obs.seats.some((s) => !input.trainPlayers.has(s.playerHash));
    const winnerPlayer = obs.seats[obs.winnerSeatIndex]?.playerHash ?? "";
    const winnerAppearances = input.trainPlayerAppearances.get(winnerPlayer) ?? 0;
    const winnerBucket = playerSupportBucket(winnerAppearances);

    switch (cohort) {
      case "all":
        return true;
      case "deckHashNeverSeenInTrain":
        return anyDeckUnseen;
      case "allPlayersSeenInTrain":
        return allPlayersSeen;
      case "anyPlayerUnseenInTrain":
        return anyPlayerUnseen;
      case "winnerPlayerHighSupport":
        return winnerBucket === "high";
      case "winnerPlayerMediumSupport":
        return winnerBucket === "medium";
      case "winnerPlayerLowSupport":
        return winnerBucket === "low";
      case "winnerPlayerUnseen":
        return winnerBucket === "unseen";
      case "podSize3":
        return obs.podSize === 3;
      case "podSize4":
        return obs.podSize === 4;
      default:
        return true;
    }
  });
}

export function buildPredictorBundle(input: {
  frequencyModel: FrequencyBaselineModel;
  frozenModelAByPodId: Map<string, number[]>;
  playerOnlyModel: ConditionalLogitCommanderPlayerModel;
  modelB: ConditionalLogitCommanderPlayerModel;
}): Record<string, ObservationPredictor> {
  return {
    uniform: (obs) => uniformProbabilities(obs.podSize),
    frequency: (obs) =>
      frequencyBaselineProbabilities(
        obs.seats.map((s) => s.commanderConfigurationId),
        input.frequencyModel,
      ),
    frozenModelA: (obs) => {
      const frozen = input.frozenModelAByPodId.get(obs.podId);
      if (!frozen || frozen.length !== obs.seats.length) {
        throw new Error(`Missing frozen Model A prediction for pod ${obs.podId}`);
      }
      return frozen;
    },
    playerOnly: (obs) => modelBPredictProbabilities(obs, input.playerOnlyModel),
    modelB: (obs) => modelBPredictProbabilities(obs, input.modelB),
  };
}
