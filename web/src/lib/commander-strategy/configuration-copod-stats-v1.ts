import type { TopdeckPodGame } from "./types";
import { buildCommanderConfiguration } from "./commander-configuration-v1";
import type { NormalizedDeckInstance } from "./types";

export type ConfigurationCoPodRow = {
  configurationAId: string;
  configurationBId: string;
  configurationA: string;
  configurationB: string;
  sharedPodCount: number;
  validOutcomePodCount: number;
  aWins: number;
  bWins: number;
  otherSeatWins: number;
  explicitDraws: number;
  missingInvalidOutcomes: number;
};

export function configurationPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function accumulateConfigurationCoPodStats(input: {
  pods: TopdeckPodGame[];
  deckById: Map<string, NormalizedDeckInstance>;
  labelByConfigId: Map<string, string>;
  historicalOnly?: boolean;
  validOutcomeOnly?: boolean;
}): Map<string, ConfigurationCoPodRow> {
  const pairStats = new Map<string, ConfigurationCoPodRow>();

  for (const pod of input.pods) {
    if (input.historicalOnly && pod.tournamentDate > "2026-08-11") continue;
    if (pod.status !== "Completed" || pod.participants.length < 2) continue;

    const configsByPlayer = new Map<string, string>();
    const configLabels = new Map<string, string>();

    for (const participant of pod.participants) {
      const deck = input.deckById.get(participant.deckInstanceId);
      if (!deck) continue;
      const config = buildCommanderConfiguration({
        commanderOracleIds: deck.commanderOracleIds,
        commanderNames: deck.commanders.map((c) => c.sourceName),
      });
      if (!config) continue;
      configsByPlayer.set(participant.playerIdHash, config.commanderConfigurationId);
      configLabels.set(
        config.commanderConfigurationId,
        input.labelByConfigId.get(config.commanderConfigurationId) ??
          config.commanderNames.join(" + "),
      );
    }

    const uniqueConfigs = [...new Set(configsByPlayer.values())];
    if (uniqueConfigs.length < 2) continue;

    const validOutcome = Boolean(pod.winnerPlayerIdHash || pod.draw);
    if (input.validOutcomeOnly && !validOutcome) continue;

    for (let i = 0; i < uniqueConfigs.length; i += 1) {
      for (let j = i + 1; j < uniqueConfigs.length; j += 1) {
        const aId = uniqueConfigs[i]!;
        const bId = uniqueConfigs[j]!;
        const key = configurationPairKey(aId, bId);
        const row = pairStats.get(key) ?? {
          configurationAId: aId < bId ? aId : bId,
          configurationBId: aId < bId ? bId : aId,
          configurationA: aId < bId ? configLabels.get(aId)! : configLabels.get(bId)!,
          configurationB: aId < bId ? configLabels.get(bId)! : configLabels.get(aId)!,
          sharedPodCount: 0,
          validOutcomePodCount: 0,
          aWins: 0,
          bWins: 0,
          otherSeatWins: 0,
          explicitDraws: 0,
          missingInvalidOutcomes: 0,
        };

        row.sharedPodCount += 1;
        if (validOutcome) row.validOutcomePodCount += 1;

        if (pod.draw) {
          row.explicitDraws += 1;
        } else if (pod.winnerPlayerIdHash) {
          const winnerConfig = configsByPlayer.get(pod.winnerPlayerIdHash);
          if (winnerConfig === row.configurationAId) row.aWins += 1;
          else if (winnerConfig === row.configurationBId) row.bWins += 1;
          else row.otherSeatWins += 1;
        } else {
          row.missingInvalidOutcomes += 1;
        }

        pairStats.set(key, row);
      }
    }
  }

  return pairStats;
}
