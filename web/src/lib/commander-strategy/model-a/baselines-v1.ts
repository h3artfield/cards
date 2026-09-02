import type { ModelAPodObservation } from "./types";

export function uniformProbabilities(podSize: number): number[] {
  const p = 1 / podSize;
  return Array.from({ length: podSize }, () => p);
}

export type FrequencyBaselineModel = {
  shrinkageAlpha: number;
  logStrengthByConfig: Map<string, number>;
  populationLogStrength: number;
};

export function fitFrequencyBaseline(input: {
  trainObservations: ModelAPodObservation[];
  shrinkageAlpha: number;
}): FrequencyBaselineModel {
  const wins = new Map<string, number>();
  const appearances = new Map<string, number>();
  let totalWins = 0;
  let totalAppearances = 0;

  for (const obs of input.trainObservations) {
    for (const seat of obs.seats) {
      appearances.set(seat.commanderConfigurationId, (appearances.get(seat.commanderConfigurationId) ?? 0) + 1);
      totalAppearances += 1;
      if (seat.winner) {
        wins.set(seat.commanderConfigurationId, (wins.get(seat.commanderConfigurationId) ?? 0) + 1);
        totalWins += 1;
      }
    }
  }

  const alpha = input.shrinkageAlpha;
  const populationRate = (totalWins + alpha) / (totalAppearances + 2 * alpha);
  const populationLogStrength = Math.log(Math.max(populationRate, 1e-6));

  const logStrengthByConfig = new Map<string, number>();
  for (const [configId, count] of appearances.entries()) {
    const w = wins.get(configId) ?? 0;
    const shrunkRate = (w + alpha) / (count + 2 * alpha);
    logStrengthByConfig.set(configId, Math.log(Math.max(shrunkRate, 1e-6)));
  }

  return {
    shrinkageAlpha: alpha,
    logStrengthByConfig,
    populationLogStrength,
  };
}

export function frequencyBaselineProbabilities(
  commanderConfigIds: string[],
  model: FrequencyBaselineModel,
): number[] {
  const strengths = commanderConfigIds.map(
    (id) => model.logStrengthByConfig.get(id) ?? model.populationLogStrength,
  );
  const maxS = Math.max(...strengths);
  const exps = strengths.map((s) => Math.exp(s - maxS));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}
