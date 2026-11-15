/**
 * Checks a Professor strategy against the deck that was actually built.
 * A named card that is missing, or a win the card text does not support, is a gap.
 * Gaps block the simulation. The claim is not a result.
 */
import type { PlanCardV1, WinPlanV1 } from "./plan-schema-v1";
import type { ProfessorStrategyV1 } from "./professor-strategy-v1";
import { isCreatureTutor, isInfectCreature, isLandRamp, keywordDeathtouch, poisonYield, toxicCount } from "./plan-poison-v1";

export type StrategyVerificationV1 = {
  accepted: boolean;
  gaps: string[];
  limits: string[];
  plan: WinPlanV1 | null;
};

const WIN_TYPES = new Set(["poison-combat", "combat-damage", "hasty-creatures", "loop-plus-outlet"]);

function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function lookup(name: string, cards: PlanCardV1[]): PlanCardV1 | null {
  const key = normalize(name);
  return cards.find((card) => normalize(card.name) === key) ?? cards.find((card) => normalize(card.name).includes(key) && key.length > 3) ?? null;
}

function supportsPoison(card: PlanCardV1): boolean {
  return (
    /deathtouch deals combat damage to a player, that player gets two poison/i.test(card.text) ||
    keywordDeathtouch(card) ||
    toxicCount(card) > 0 ||
    isInfectCreature(card)
  );
}

export function verifyProfessorStrategy(args: {
  strategy: ProfessorStrategyV1;
  commander: PlanCardV1;
  cards: PlanCardV1[];
  comboVerified?: boolean;
}): StrategyVerificationV1 {
  const library = [args.commander, ...args.cards];
  const gaps: string[] = [];
  const limits: string[] = [];
  const win = args.strategy.win;
  if (!WIN_TYPES.has(win.type)) {
    gaps.push(`The Professor named “${win.type}” as the win. The checker can test poison combat, combat damage, hasty creatures, or a loop plus an outlet.`);
  }
  const resolve = (names: string[], role: string) => {
    const found: PlanCardV1[] = [];
    for (const name of names) {
      const card = lookup(name, library);
      if (!card) {
        gaps.push(`${role} “${name}” is not in this deck.`);
        continue;
      }
      found.push(card);
    }
    return found;
  };
  const required = resolve(win.requiredCards, "Required card");
  const tutors = resolve(win.tutors, "Tutor");
  const enablers = resolve(win.enablers, "Enabler");
  if (win.type === "poison-combat") {
    const poisonCards = [args.commander, ...required].filter(supportsPoison);
    if (!poisonCards.length) {
      gaps.push("The strategy claims a poison win, and none of the named cards have a poison, toxic, infect, or deathtouch line the checker can apply.");
    }
    const powerless = poisonCards.filter((card) => card.power <= 0 && (keywordDeathtouch(card) || isInfectCreature(card) || /two poison/i.test(card.text)));
    if (powerless.length) {
      gaps.push(`These poison cards are stored with power 0, so they deal no combat damage: ${powerless.map((card) => card.name).join(", ")}.`);
    }
    for (const card of required) {
      if (card.oracleId === args.commander.oracleId || poisonYield(card) > 0) continue;
      gaps.push(`${card.name} is required for the poison win, and this checker does not apply that card. It casts named poison creatures, named mana, and creature tutors.`);
    }
  }
  if (win.type === "combat-damage") {
    const attackers = required.filter((card) => /\bcreature\b/i.test(card.typeLine) && card.power > 0);
    if (!attackers.length && args.commander.power <= 0) {
      gaps.push("The strategy claims a combat win, and none of the named creatures have power greater than 0.");
    }
  }
  if ((win.type === "hasty-creatures" || win.type === "loop-plus-outlet") && !args.comboVerified) {
    gaps.push("The strategy claims a combo win. The checker does not treat that claim as proof, and no combo database verified these cards.");
  }
  for (const tutor of tutors) {
    if (!isCreatureTutor(tutor) && !isLandRamp(tutor)) {
      limits.push(`${tutor.name} is named as a tutor, and this checker cannot resolve that search.`);
    }
  }
  for (const card of enablers) {
    const played =
      isLandRamp(card) ||
      /sol ring/i.test(card.name) ||
      /add \{2\}|adds two mana|add \{[WUBRGC]\}|add one mana|\{T\}: Add/i.test(card.text) ||
      /llanowar elves|elvish mystic|fyndhorn elves|birds of paradise|arbor elf/i.test(card.name);
    if (!played) {
      limits.push(`${card.name} is named as an enabler, and this checker does not cast it. It plays mana sources and land ramp from the enabler list.`);
    }
  }
  limits.push("Recovery is recorded and not played. A primary line that misses stays a miss.");
  limits.push("Play is one silent opponent. A win here removes that seat. It is not a four-player result.");
  if (gaps.length) return { accepted: false, gaps, limits, plan: null };
  const requiredIds = [...new Set([args.commander.oracleId, ...required.map((card) => card.oracleId)])];
  return {
    accepted: true,
    gaps,
    limits,
    plan: {
      schema: "plan-schema-1.0",
      primary: {
        type: win.type as WinPlanV1["primary"]["type"],
        requiredCards: requiredIds,
        tutors: tutors.filter(isCreatureTutor).map((card) => card.oracleId),
        enablers: enablers.filter((card) => card.oracleId !== args.commander.oracleId).map((card) => card.oracleId),
        outletCards: [],
        hasteSources: [],
      },
      secondary: null,
      recovery: [],
    },
  };
}
