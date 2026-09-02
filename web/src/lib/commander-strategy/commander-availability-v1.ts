import { buildCommanderConfiguration } from "./commander-configuration-v1";
import type { NormalizedDeckInstance, TopdeckPodGame } from "./types";
import type { PodOutcomeState } from "./pod-outcome-audit-v1";

export type CommanderAvailabilityAudit = {
  validWinnerHistoricalPods: number;
  allSeatsCommanderKnown: number;
  someSeatsCommanderKnown: number;
  noSeatsCommanderKnown: number;
  commanderSourceWhenDecklistAbsent: {
    seatsWithoutDecklist: number;
    seatsWithCommanderDespiteNoDecklist: number;
    seatsWithoutCommanderAndNoDecklist: number;
  };
  notes: string[];
};

export function auditCommanderAvailability(input: {
  pods: TopdeckPodGame[];
  deckById: Map<string, NormalizedDeckInstance>;
  podOutcomeById: Map<string, PodOutcomeState>;
  historical: (pod: TopdeckPodGame) => boolean;
}): CommanderAvailabilityAudit {
  let validWinnerHistoricalPods = 0;
  let allSeatsCommanderKnown = 0;
  let someSeatsCommanderKnown = 0;
  let noSeatsCommanderKnown = 0;
  let seatsWithoutDecklist = 0;
  let seatsWithCommanderDespiteNoDecklist = 0;
  let seatsWithoutCommanderAndNoDecklist = 0;

  for (const pod of input.pods) {
    if (pod.status !== "Completed" || pod.participants.length < 2) continue;
    if (!input.historical(pod)) continue;
    if (input.podOutcomeById.get(pod.podId) !== "validWinner") continue;

    validWinnerHistoricalPods += 1;
    let seatsWithCommander = 0;

    for (const participant of pod.participants) {
      const deck = input.deckById.get(participant.deckInstanceId);
      const hasDecklist = Boolean(deck?.decklistAvailable || deck?.deckObjAvailable);
      const config = deck
        ? buildCommanderConfiguration({
            commanderOracleIds: deck.commanderOracleIds,
            commanderNames: deck.commanders.map((c) => c.sourceName),
          })
        : null;

      if (config) seatsWithCommander += 1;

      if (!hasDecklist) {
        seatsWithoutDecklist += 1;
        if (config) seatsWithCommanderDespiteNoDecklist += 1;
        else seatsWithoutCommanderAndNoDecklist += 1;
      }
    }

    if (seatsWithCommander === pod.participants.length) allSeatsCommanderKnown += 1;
    else if (seatsWithCommander > 0) someSeatsCommanderKnown += 1;
    else noSeatsCommanderKnown += 1;
  }

  return {
    validWinnerHistoricalPods,
    allSeatsCommanderKnown,
    someSeatsCommanderKnown,
    noSeatsCommanderKnown,
    commanderSourceWhenDecklistAbsent: {
      seatsWithoutDecklist,
      seatsWithCommanderDespiteNoDecklist,
      seatsWithoutCommanderAndNoDecklist,
    },
    notes: [
      "Commander identity is derived from TopDeck deckObj/decklist parsing during normalization.",
      "When decklist and deckObj are both absent, commander configuration is generally unavailable (Tier X).",
      "Prior commander pod-appearance statistics used primary commanderOracleIds[0] from any resolved deck record, including seats with partial data.",
      "Tier C requires all seats to have commander configuration without usable decklists; if commanders are unavailable without decklists, Tier C remains structurally zero.",
    ],
  };
}
