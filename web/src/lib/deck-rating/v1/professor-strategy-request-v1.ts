/**
 * Asks the Professor for the strategy of a deck that was already built.
 * This is not a Fynn rule and it does not rebuild the 99.
 */
import { callHeadProfessorJsonV48 } from "../../deck-synthesis/professor-head-professor-caller-v4-8-v1";
import type { PlanCardV1 } from "./plan-schema-v1";
import { PROFESSOR_STRATEGY_JSON_SCHEMA, type ProfessorStrategyV1 } from "./professor-strategy-v1";

type RawStrategy = {
  mulligans: string;
  earlySetup: string;
  sequencing: string;
  interactions: string;
  recovery: string;
  winType: ProfessorStrategyV1["win"]["type"];
  summary: string;
  howTheyWorkTogether: string;
  howTheyWin: string;
  requiredCards: string[];
  tutors: string[];
  enablers: string[];
};

const SYSTEM = `You are the Professor handing a finished Commander deck to a rules checker.
The deck is already built. Do not add or remove cards.
The prose and the card lists describe the same line. The checker plays the lists. It does not read the prose as instructions.
Use only full card names copied from the deck.
requiredCards: the cards that must resolve for the win. Do not put mana or tutors here.
tutors: cards that search for those required cards.
enablers: mana creatures, mana rocks, and land ramp the line casts before the win.
Put anything else in the prose, not in those lists.
Choose the win type from the cards, not from a default.
poison-combat: a named creature's own text deals poison, through infect, toxic, or a commander ability that gives poison when a deathtouch creature deals damage. Name only those creatures in requiredCards.
combat-damage: the win is an attack for life loss or commander damage. A spell that gives creatures infect, such as Triumph of the Hordes, is combat-damage. Name the attacking creatures, and mention that spell in the prose.
hasty-creatures: a verified combo of hasty creatures.
loop-plus-outlet: a verified loop plus a payoff.
unsupported: anything else.
Win type must be one of: poison-combat, combat-damage, hasty-creatures, loop-plus-outlet, unsupported.
Do not set life totals, poison totals, or commander-damage totals. The checker owns those numbers.
If the real win is not one of the four types, use unsupported.
Keep each prose field under 500 characters.
Return JSON only.`;

function cardLine(card: PlanCardV1): string {
  return `${card.name} | mv ${card.cmc} | power ${card.power} | ${card.typeLine} | ${card.text.replace(/\s+/g, " ").slice(0, 280)}`;
}

export async function requestProfessorStrategy(args: {
  commander: PlanCardV1;
  cards: PlanCardV1[];
  onProgress?: (message: string) => void;
}): Promise<{ strategy: ProfessorStrategyV1; model: string }> {
  const userContent = [
    `Commander: ${cardLine(args.commander)}`,
    "Library:",
    ...args.cards.map(cardLine),
  ].join("\n");
  const result = await callHeadProfessorJsonV48<RawStrategy>({
    system: SYSTEM,
    userContent,
    jsonSchema: PROFESSOR_STRATEGY_JSON_SCHEMA as unknown as Record<string, unknown>,
    schemaName: "professor_strategy_v1",
    useJsonSchema: true,
    liveFast: true,
    reasoningEffortOverride: "low",
    onProgress: args.onProgress,
  });
  const raw = result.parsed;
  return {
    model: result.model,
    strategy: {
      schema: "professor-strategy-1.0",
      explanation: {
        mulligans: raw.mulligans,
        earlySetup: raw.earlySetup,
        sequencing: raw.sequencing,
        interactions: raw.interactions,
        recovery: raw.recovery,
      },
      win: {
        type: raw.winType,
        summary: raw.summary,
        howTheyWorkTogether: raw.howTheyWorkTogether,
        howTheyWin: raw.howTheyWin,
        requiredCards: raw.requiredCards,
        tutors: raw.tutors,
        enablers: raw.enablers,
      },
    },
  };
}
