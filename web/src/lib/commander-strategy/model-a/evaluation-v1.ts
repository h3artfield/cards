import { uniformProbabilities } from "./baselines-v1";
import { frequencyBaselineProbabilities, type FrequencyBaselineModel } from "./baselines-v1";
import { modelAProbabilities, type ConditionalLogitModel } from "./conditional-logit-v1";
import type { ModelAMetrics, ModelAPodObservation } from "./types";
import { evaluateObservationPredictorV1 } from "../evaluation-metrics-v1";

export type ProbabilityPredictor = (commanderConfigIds: string[]) => number[];

function evaluatePredictor(
  observations: ModelAPodObservation[],
  predict: ProbabilityPredictor,
): ModelAMetrics {
  return evaluateObservationPredictorV1(observations, (obs) =>
    predict(obs.seats.map((s) => s.commanderConfigurationId)),
  );
}

export function evaluateUniformBaseline(observations: ModelAPodObservation[]): ModelAMetrics {
  return evaluatePredictor(observations, (configIds) => uniformProbabilities(configIds.length));
}

export function evaluateFrequencyBaseline(
  observations: ModelAPodObservation[],
  model: FrequencyBaselineModel,
): ModelAMetrics {
  return evaluatePredictor(observations, (configIds) => frequencyBaselineProbabilities(configIds, model));
}

export function evaluateModelA(
  observations: ModelAPodObservation[],
  model: ConditionalLogitModel,
): ModelAMetrics {
  return evaluatePredictor(observations, (configIds) => modelAProbabilities(configIds, model));
}

export type ModelACohortFilter =
  | "all"
  | "deckHashSeenInTrain"
  | "deckHashNeverSeenInTrain"
  | "commanderSeenInTrain"
  | "commanderUnseenInTrain"
  | "highSupportWinner"
  | "lowSupportWinner"
  | "podSize3"
  | "podSize4";

export function filterObservationsByCohort(
  observations: ModelAPodObservation[],
  cohort: ModelACohortFilter,
  input: {
    trainDeckHashes: Set<string>;
    trainCommanderConfigs: Set<string>;
    trainSeatAppearances: Map<string, number>;
  },
): ModelAPodObservation[] {
  return observations.filter((obs) => {
    const configIds = obs.seats.map((s) => s.commanderConfigurationId);
    const winnerConfig = configIds[obs.winnerSeatIndex] ?? "";
    const winnerAppearances = input.trainSeatAppearances.get(winnerConfig) ?? 0;
    const allDeckHashesSeen = obs.seats.every(
      (s) => !s.deckHash.startsWith("unresolved:") && input.trainDeckHashes.has(s.deckHash),
    );
    const anyDeckHashUnseen = obs.seats.some(
      (s) => !s.deckHash.startsWith("unresolved:") && !input.trainDeckHashes.has(s.deckHash),
    );
    const allCommandersSeen = configIds.every((id) => input.trainCommanderConfigs.has(id));
    const anyCommanderUnseen = configIds.some((id) => !input.trainCommanderConfigs.has(id));

    switch (cohort) {
      case "all":
        return true;
      case "deckHashSeenInTrain":
        return allDeckHashesSeen;
      case "deckHashNeverSeenInTrain":
        return anyDeckHashUnseen;
      case "commanderSeenInTrain":
        return allCommandersSeen;
      case "commanderUnseenInTrain":
        return anyCommanderUnseen;
      case "highSupportWinner":
        return winnerAppearances >= 100;
      case "lowSupportWinner":
        return winnerAppearances > 0 && winnerAppearances < 10;
      case "podSize3":
        return obs.podSize === 3;
      case "podSize4":
        return obs.podSize === 4;
      default:
        return true;
    }
  });
}

export function evaluateAllCohorts(input: {
  observations: ModelAPodObservation[];
  frequencyModel: FrequencyBaselineModel;
  modelA: ConditionalLogitModel;
  trainDeckHashes: Set<string>;
  trainCommanderConfigs: Set<string>;
  trainSeatAppearances: Map<string, number>;
}): Record<string, { uniform: ModelAMetrics; frequency: ModelAMetrics; modelA: ModelAMetrics }> {
  const cohorts: ModelACohortFilter[] = [
    "all",
    "deckHashSeenInTrain",
    "deckHashNeverSeenInTrain",
    "commanderSeenInTrain",
    "commanderUnseenInTrain",
    "highSupportWinner",
    "lowSupportWinner",
    "podSize3",
    "podSize4",
  ];

  const out: Record<string, { uniform: ModelAMetrics; frequency: ModelAMetrics; modelA: ModelAMetrics }> = {};
  for (const cohort of cohorts) {
    const filtered = filterObservationsByCohort(input.observations, cohort, {
      trainDeckHashes: input.trainDeckHashes,
      trainCommanderConfigs: input.trainCommanderConfigs,
      trainSeatAppearances: input.trainSeatAppearances,
    });
    out[cohort] = {
      uniform: evaluateUniformBaseline(filtered),
      frequency: evaluateFrequencyBaseline(filtered, input.frequencyModel),
      modelA: evaluateModelA(filtered, input.modelA),
    };
  }
  return out;
}
