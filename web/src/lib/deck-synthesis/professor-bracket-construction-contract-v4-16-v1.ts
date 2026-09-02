/**
 * Bracket Construction Contract v4.16 — first-class optimization boundary before card selection.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketBuildPlanV49 } from "./professor-bracket-build-plan-v4-9-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";

export const PROFESSOR_BRACKET_CONSTRUCTION_CONTRACT_V4_16_V1_VERSION =
  "professor-bracket-construction-contract-v4-16-v1";

export const PROFESSOR_V4_16_BRACKET_NATIVE_MAXIMIZATION_V1 =
  "PROFESSOR_V4_16_BRACKET_NATIVE_MAXIMIZATION_AND_POWER_ENVELOPE_V1_AUTHORIZED";

export type BracketIntentV416 = "EXPLOIT_CEILING" | "UPPER_EDGE" | "THEMATIC_FLOOR" | "CASUAL_FLOOR";

export type PowerLeverKindV416 =
  | "ACCESS"
  | "ACCELERATION"
  | "INTERACTION"
  | "PROTECTION"
  | "ENGINES"
  | "CONSISTENCY"
  | "WIN_COMPACTNESS"
  | "GAME_CHANGERS"
  | "MANA_QUALITY"
  | "ROLE_COMPRESSION";

export type PowerLeverRuleV416 = {
  lever: PowerLeverKindV416;
  priority: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH" | "STRATEGY_DEPENDENT";
  floor: string;
  ceiling: string;
};

export type BracketConstructionContractV416 = {
  version: typeof PROFESSOR_BRACKET_CONSTRUCTION_CONTRACT_V4_16_V1_VERSION;
  requestedBracket: CommanderBracket;
  bracketIntent: BracketIntentV416;
  targetThreatWindow: string;
  targetConsistency: string;
  targetEfficiency: string;
  targetInteractionQuality: string;
  targetAccelerationQuality: string;
  targetAccessQuality: string;
  targetWinCompactness: string;
  availablePowerLevers: PowerLeverKindV416[];
  prohibitedPowerLevers: PowerLeverKindV416[];
  conditionalPowerLevers: PowerLeverKindV416[];
  ceilingRules: string[];
  floorExpectations: string[];
  powerLeverRules: PowerLeverRuleV416[];
  primaryWinArchitectureDueByCard: number;
  accessArchitectureRequired: boolean;
  gameChangerReviewRequired: boolean;
  optimizationObjective: string;
};

function bracketIntentFor(bracket: CommanderBracket): BracketIntentV416 {
  if (bracket >= 4) return "EXPLOIT_CEILING";
  if (bracket === 3) return "UPPER_EDGE";
  if (bracket === 2) return "THEMATIC_FLOOR";
  return "CASUAL_FLOOR";
}

function leverRulesFor(bracket: CommanderBracket, powerPlan: BracketPowerPlanV410): PowerLeverRuleV416[] {
  const pri = (key: keyof BracketPowerPlanV410["powerLevers"]) => powerPlan.powerLevers[key];
  const mapPri = (p: string): PowerLeverRuleV416["priority"] => {
    if (p === "STRATEGY_DEPENDENT") return "STRATEGY_DEPENDENT";
    if (p === "MEDIUM_HIGH") return "HIGH";
    return p as PowerLeverRuleV416["priority"];
  };

  const base: PowerLeverRuleV416[] = [
    {
      lever: "ACCESS",
      priority: mapPri(pri("tutors")),
      floor: bracket >= 4 ? "Reliable access to engine, win, protection, or recovery" : bracket === 3 ? "Redundancy or selective tutors" : "Thematic redundancy only",
      ceiling: bracket <= 2 ? "No heavy tutor packages" : bracket === 3 ? "Avoid cEDH tutor density" : "Optimize access architecture for this strategy",
    },
    {
      lever: "ACCELERATION",
      priority: mapPri(pri("acceleration")),
      floor: bracket >= 4 ? "Premium acceleration where colors permit" : bracket === 3 ? "Solid ramp curve" : "Accessible mana",
      ceiling: bracket <= 2 ? "No fast mana pile" : bracket === 3 ? "Limited fast mana" : "Strongest legal acceleration that fits charter",
    },
    {
      lever: "INTERACTION",
      priority: mapPri(pri("efficientInteraction")),
      floor: bracket >= 4 ? "Efficient instant-speed interaction" : bracket === 3 ? "Solid removal suite" : "Some interaction",
      ceiling: bracket <= 2 ? "Thematic interaction only" : "Free/cheap interaction without cEDH stax pile",
    },
    {
      lever: "PROTECTION",
      priority: mapPri(pri("protection")),
      floor: bracket >= 4 ? "Protection for key turns and pieces" : "LOW",
      ceiling: "No hard locks unless charter demands",
    },
    {
      lever: "WIN_COMPACTNESS",
      priority: mapPri(pri("compactFinishers")),
      floor: bracket >= 4 ? "Compact win architecture by card ~35" : bracket === 3 ? "Strong big-turn wins" : "Incremental wins",
      ceiling: bracket <= 3 ? "Avoid two-card deterministic combos unless allowed" : "Thematic compact lines preferred over unrelated combos",
    },
    {
      lever: "GAME_CHANGERS",
      priority: mapPri(pri("gameChangers")),
      floor: bracket >= 3 ? "Active review — zero can be correct if documented" : "NONE",
      ceiling: bracket <= 2 ? "No Game Changers" : "Policy cap applies",
    },
    {
      lever: "MANA_QUALITY",
      priority: bracket >= 4 ? "HIGH" : bracket === 3 ? "MEDIUM" : "LOW",
      floor: bracket >= 4 ? "Untapped sources; minimal dead taplands" : "Functional mana base",
      ceiling: "Reserve land slots during build — no pad-to-99 surprise",
    },
    {
      lever: "CONSISTENCY",
      priority: mapPri(pri("repeatableCardAdvantage")),
      floor: bracket >= 4 ? "High consistency through redundancy and access" : "MEDIUM",
      ceiling: "Must flow through charter identity",
    },
  ];
  return base;
}

export function buildBracketConstructionContractV416(args: {
  bracket: CommanderBracket;
  charter: DeckCharterV45;
  pass1: CreativeProfessorPass1V4;
  buildPlan: BracketBuildPlanV49;
  powerPlan: BracketPowerPlanV410;
}): BracketConstructionContractV416 {
  const bracket = args.bracket;
  const intent = bracketIntentFor(bracket);
  const powerLeverRules = leverRulesFor(bracket, args.powerPlan);

  const available: PowerLeverKindV416[] = [];
  const prohibited: PowerLeverKindV416[] = [];
  const conditional: PowerLeverKindV416[] = [];

  for (const rule of powerLeverRules) {
    if (rule.priority === "NONE") prohibited.push(rule.lever);
    else if (rule.priority === "STRATEGY_DEPENDENT") conditional.push(rule.lever);
    else available.push(rule.lever);
  }

  const ceilingRules = [
    ...args.buildPlan.officialHardConstraints,
    ...args.powerPlan.avoid.slice(0, 6),
    `Do not exceed B${bracket} play experience — strongest version INSIDE envelope`,
  ];

  const floorExpectations =
    bracket >= 4
      ? [
          "Weaponize charter identity with maximum permitted efficiency",
          "Every relevant power lever deliberately considered",
          "Win architecture chosen before card ~40",
          "Access plan covers engine, win, protection, recovery",
          "Game Changers actively reviewed",
        ]
      : bracket === 3
        ? [
            "Upper useful edge of Upgraded — recognizably B3",
            "Strong synergy and card quality without B4 speed/compactness",
            "Intentional Game Changers within policy",
          ]
        : bracket === 2
          ? ["Thematic cohesion over raw power", "Accessible mana and incremental advantage"]
          : ["Maximum theme, minimum power injection"];

  return {
    version: PROFESSOR_BRACKET_CONSTRUCTION_CONTRACT_V4_16_V1_VERSION,
    requestedBracket: bracket,
    bracketIntent: intent,
    targetThreatWindow: args.buildPlan.desiredSpeedProfile,
    targetConsistency: args.buildPlan.desiredConsistencyProfile,
    targetEfficiency: bracket >= 4 ? "Maximum charter-aligned efficiency" : args.buildPlan.desiredInteractionProfile,
    targetInteractionQuality: args.buildPlan.desiredInteractionProfile,
    targetAccelerationQuality: args.buildPlan.fastManaStrategy,
    targetAccessQuality: args.buildPlan.tutorStrategy,
    targetWinCompactness: args.buildPlan.finisherStrategy,
    availablePowerLevers: available,
    prohibitedPowerLevers: prohibited,
    conditionalPowerLevers: conditional,
    ceilingRules,
    floorExpectations,
    powerLeverRules,
    primaryWinArchitectureDueByCard: bracket >= 4 ? 35 : bracket === 3 ? 45 : 60,
    accessArchitectureRequired: bracket >= 4,
    gameChangerReviewRequired: bracket >= 3,
    optimizationObjective:
      "MAXIMIZE deck effectiveness SUBJECT TO commander, charter, player style, relationship, win/combo prefs, bracket constraints, legality",
  };
}
