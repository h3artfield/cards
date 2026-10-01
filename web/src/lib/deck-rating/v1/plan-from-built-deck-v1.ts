/**
 * Names a plan from the deck the Professor actually built.
 * Poison combat is the only line this version can name.
 * Anything else is left unwritten so the factory does not invent a win.
 *
 * A poison plan requires the commander. The other poison creatures are backups,
 * not a checklist the pilot has to assemble.
 */
import type { PlanCardV1, WinPlanV1 } from "./plan-schema-v1";
import { isCreatureTutor, isLandRamp, poisonYield } from "./plan-poison-v1";

export type BuiltDeckPlanV1 =
  | { plan: WinPlanV1; reason: null }
  | { plan: null; reason: string };

function isPoisonDeathtouchCommander(card: PlanCardV1): boolean {
  return (
    /fynn, the fangbearer/i.test(card.name) ||
    /deathtouch deals combat damage to a player, that player gets two poison/i.test(card.text)
  );
}

function isSmallMana(card: PlanCardV1): boolean {
  if (/\bland\b/i.test(card.typeLine)) return false;
  if (card.cmc > 2) return false;
  if (poisonYield(card) > 0) return false;
  return /add \{[WUBRGC2]\}|\{T\}: Add|sol ring|llanowar elves|elvish mystic|fyndhorn elves|birds of paradise|arbor elf/i.test(
    `${card.name} ${card.text}`,
  );
}

const RECOVERY_NAMES = ["regrowth", "eternal witness", "timeless witness", "nature's spiral"];

export function planFromBuiltDeck(args: { commander: PlanCardV1; cards: PlanCardV1[] }): BuiltDeckPlanV1 {
  if (!isPoisonDeathtouchCommander(args.commander)) {
    return { plan: null, reason: "no mechanical plan for this commander yet" };
  }
  const tutors = args.cards.filter(isCreatureTutor).map((card) => card.oracleId);
  const enablers = args.cards
    .filter((card) => isSmallMana(card) || isLandRamp(card))
    .map((card) => card.oracleId);
  const recovery = args.cards
    .filter((card) => RECOVERY_NAMES.some((name) => card.name.toLowerCase() === name))
    .map((card) => card.oracleId);
  return {
    reason: null,
    plan: {
      schema: "plan-schema-1.0",
      primary: {
        type: "poison-combat",
        requiredCards: [args.commander.oracleId],
        tutors,
        enablers,
        outletCards: [],
        hasteSources: [],
      },
      secondary: null,
      recovery,
    },
  };
}
