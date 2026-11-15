/**
 * Locked win-plan contract. The Professor names a type and cards.
 * The checker owns the rules numbers: 10 poison, 40 life, 21 commander damage.
 *
 * deck + plan + pilot + checker + seed set = the same score every time.
 */

export const PLAN_SCHEMA_VERSION = "plan-schema-1.0" as const;
export const PLAN_CHECKER_VERSION = "plan-checker-1.0.0" as const;
export const PLAN_PILOT_VERSION = "goldfish-plan-1.3.0" as const;
export const PLAN_SEED_SET = "canonical-100-v1" as const;
export const PLAN_SEED_COUNT = 100;
export const PLAN_TURN_CAP = 15;
export const PLAN_SPEED_MIN_SUCCESSES = 10;
export const PLAN_OPPONENT_LIFE = 40;
export const PLAN_COMMANDER_DAMAGE = 21;
export const PLAN_POISON_LETHAL = 10;

export const PLAN_PILOT_NOTES = [
  "Mulligan matches goldfish mulligan v2: up to 3 mulligans, first keep puts nothing on the bottom.",
  "Library is sorted by oracle id, then name, then shuffled with mulberry32 for seeds 0–99.",
  "Mana is generic. Lands and mana rocks enter ready.",
  "The pilot plays the primary plan only. Recovery cards are never treated as the win.",
  "Poison combat casts named mana, then a named tutor when a required poison creature is missing, then the commander, then every affordable named poison creature. An X tutor spends the mana available. Land ramp fetches a basic land.",
  "Creature mana sources have summoning sickness. Bottomed mulligan cards are drawn last. Combat damage and poison require power greater than 0.",
  "Checker 1.0.0 does not run the resilience suite. The scenario table is locked and unused.",
] as const;

/** Frozen resilience scenarios. R0 is the undisrupted speed run, not part of the resilience average. */
export const PLAN_RESILIENCE_SCENARIOS = [
  { id: "R0", intervention: "No disruption" },
  { id: "R1", intervention: "Remove the required creature listed first, else highest power, else lowest oracle id, on turn 3" },
  { id: "R2", intervention: "Remove the commander the first turn it is on the battlefield" },
  { id: "R3", intervention: "Board wipe on turn 4" },
  { id: "R4", intervention: "Board wipe on turn 5" },
  { id: "R5", intervention: "Remove the first required permanent that is not a land" },
  { id: "R6", intervention: "Exile the graveyard at the end of turn 4" },
  { id: "R7", intervention: "Counter the first declared outlet or payoff spell" },
] as const;

export type WinPlanType = "poison-combat" | "hasty-creatures" | "loop-plus-outlet" | "combat-damage";
export type LoopProduct = "mana" | "enters" | "deaths" | "untaps";
export type OutletConversion = "damage" | "lifeloss" | "mill" | "draw" | "any";

export type WinPlanLineV1 = {
  type: WinPlanType;
  /** Oracle ids that must be in the deck for the plan to be real. */
  requiredCards: string[];
  tutors: string[];
  enablers: string[];
  outletCards: string[];
  hasteSources: string[];
  /** What a loop produces. Required for loop-plus-outlet. */
  produces?: LoopProduct;
  /** What the outlet turns that product into. Required for loop-plus-outlet. */
  converts?: OutletConversion;
};

export type WinPlanV1 = {
  schema: typeof PLAN_SCHEMA_VERSION;
  primary: WinPlanLineV1;
  secondary: WinPlanLineV1 | null;
  recovery: string[];
};

export type PlanCardV1 = {
  oracleId: string;
  name: string;
  cmc: number;
  power: number;
  typeLine: string;
  text: string;
  /** Copies in the library. Commanders are not copied into the library. */
  quantity: number;
};

export const LOOP_OUTLET_ACCEPTS: Record<LoopProduct, readonly OutletConversion[]> = {
  mana: ["damage", "lifeloss", "draw", "any"],
  enters: ["damage", "mill", "any"],
  deaths: ["lifeloss", "mill", "any"],
  untaps: ["damage", "any"],
};

export function outletAcceptsProduct(produces: LoopProduct, converts: OutletConversion): boolean {
  return LOOP_OUTLET_ACCEPTS[produces].includes(converts);
}
