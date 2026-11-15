/**
 * The thousands digit. The rubric reads the deck. The simulation does not move it.
 */
import { classifyCommanderBracketV1 } from "@/lib/commander-bracket-rubric/v1";
import { comboSummaryForDeck } from "@/lib/commander-bracket-rubric/v1/combos-server";
import type { CommanderBracket } from "@/lib/commander-bracket-rubric/v1";
import {
  gameChangerOracleIdSet,
  loadCommanderGameChangerSnapshot,
} from "@/lib/commander-strategy/model-c/game-changer-snapshot-v1";
import type { PlanCardV1 } from "./plan-schema-v1";

export async function measurePlanBracket(commanders: PlanCardV1[], cards: PlanCardV1[]): Promise<CommanderBracket> {
  const rubricCards = [
    ...commanders.map((card) => ({
      oracleId: card.oracleId,
      name: card.name,
      typeLine: card.typeLine,
      oracleText: card.text,
      quantity: 1,
      isCommander: true,
    })),
    ...cards.map((card) => ({
      oracleId: card.oracleId,
      name: card.name,
      typeLine: card.typeLine,
      oracleText: card.text,
      quantity: card.quantity,
      isCommander: false,
    })),
  ];
  const gameChangerOracleIds = gameChangerOracleIdSet(loadCommanderGameChangerSnapshot());
  const combos = await comboSummaryForDeck({ cards: rubricCards });
  return classifyCommanderBracketV1({ cards: rubricCards, gameChangerOracleIds, combos }).assignedBracket;
}
