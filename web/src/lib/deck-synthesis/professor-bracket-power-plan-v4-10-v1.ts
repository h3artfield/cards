/**
 * Bracket Power Plan v4.10 — concrete construction controller derived from bracket + commander identity.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketBuildPlanV49 } from "./professor-bracket-build-plan-v4-9-v1";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";

export const PROFESSOR_BRACKET_POWER_PLAN_V4_10_V1_VERSION = "professor-bracket-power-plan-v4-10-v1";
export const PROFESSOR_V4_10_BRACKET_POWER_PLANNER_DECISION_V1 =
  "PROFESSOR_V4_10_BRACKET_POWER_PLANNER_AND_SEARCH_ENFORCEMENT_V1_AUTHORIZED";

export type PowerLeverPriorityV410 = "NONE" | "LOW" | "MEDIUM" | "MEDIUM_HIGH" | "HIGH" | "STRATEGY_DEPENDENT";

export type PowerLeverKeyV410 =
  | "acceleration"
  | "tutors"
  | "efficientInteraction"
  | "protection"
  | "repeatableCardAdvantage"
  | "compactFinishers"
  | "gameChangers"
  | "fastMana";

export type BracketPowerPlanV410 = {
  version: typeof PROFESSOR_BRACKET_POWER_PLAN_V4_10_V1_VERSION;
  targetBracket: CommanderBracket;
  commanderName: string;
  primaryStrategy: string;
  playStyle: string;
  powerLevers: Record<PowerLeverKeyV410, PowerLeverPriorityV410>;
  primarySpend: string[];
  secondarySpend: string[];
  avoid: string[];
  spendSummary: string[];
};

function isSacrificeEngine(playStyle: string, pass1: CreativeProfessorPass1V4): boolean {
  const text = `${playStyle} ${pass1.strategicThesis} ${pass1.packages.map((p) => p.concept).join(" ")}`.toLowerCase();
  return /sacrifice|aristocrat|korvold|meren|token generation/.test(text);
}

export function buildBracketPowerPlanV410(args: {
  bracket: CommanderBracket;
  commanderName: string;
  playStyle: string;
  relationship: string;
  pass1: CreativeProfessorPass1V4;
  buildPlan: BracketBuildPlanV49;
}): BracketPowerPlanV410 {
  const sacrifice = isSacrificeEngine(args.playStyle, args.pass1);
  const primary = args.pass1.packages[0]?.concept ?? args.buildPlan.powerPlanSummary[1] ?? "primary engine";

  const levers: Record<PowerLeverKeyV410, PowerLeverPriorityV410> = {
    acceleration: args.bracket >= 4 ? "HIGH" : args.bracket === 3 ? "MEDIUM" : "LOW",
    tutors: args.bracket >= 4 ? "HIGH" : args.bracket === 3 ? "MEDIUM" : "NONE",
    efficientInteraction: args.bracket >= 4 ? "HIGH" : args.bracket === 3 ? "MEDIUM" : "LOW",
    protection: args.bracket >= 4 ? "MEDIUM_HIGH" : "LOW",
    repeatableCardAdvantage: args.bracket >= 4 ? "HIGH" : args.bracket === 3 ? "MEDIUM" : "LOW",
    compactFinishers: args.bracket >= 4 ? "HIGH" : args.bracket === 3 ? "MEDIUM" : "LOW",
    gameChangers: args.bracket <= 2 ? "NONE" : args.bracket === 3 ? "STRATEGY_DEPENDENT" : "STRATEGY_DEPENDENT",
    fastMana: args.bracket >= 4 ? "STRATEGY_DEPENDENT" : args.bracket === 3 ? "LOW" : "NONE",
  };

  const primarySpend: string[] = [];
  const secondarySpend: string[] = [];
  const avoid: string[] = [...args.buildPlan.bracketPowerLeversToAvoid];

  if (args.bracket >= 4) {
    if (sacrifice) {
      primarySpend.push(
        "Sacrifice engines and fuel",
        "Premium acceleration",
        "Repeatable resource generation",
        "Efficient tutors",
        "Compact sacrifice-based finishers",
      );
      secondarySpend.push("Cheap interaction", "Protection for key turns");
      avoid.push(
        "Random generic finishers unrelated to sacrifice",
        "High-cost filler",
        "Unrelated goodstuff",
        "Redundant slow finishers when access/acceleration are missing",
      );
      levers.compactFinishers = "HIGH";
      levers.tutors = "HIGH";
      levers.acceleration = "HIGH";
    } else {
      primarySpend.push("Premium acceleration", "Efficient tutors", "Repeatable card advantage", "Compact finishers");
      secondarySpend.push("Protection", "Efficient interaction");
    }
  } else if (args.bracket === 3) {
    primarySpend.push("Strong synergy", "Solid interaction", "Thematic engines", "Up to 3 strategy-aligned Game Changers");
    secondarySpend.push("Reasonable speed", "Role compression");
    avoid.push("Heavy tutoring", "Fast deterministic combos");
  } else {
    primarySpend.push("Thematic cohesion", "Accessible mana", "Incremental advantage");
    avoid.push("Game Changers", "Heavy tutors", "Fast combos");
  }

  const spendSummary = [
    `Target B${args.bracket} power budget for ${args.commanderName.split(",")[0]}`,
    `Primary: ${primarySpend.slice(0, 4).join("; ")}`,
    `Secondary: ${secondarySpend.slice(0, 3).join("; ") || "Support charter identity"}`,
    ...avoid.slice(0, 3).map((a) => `Avoid: ${a}`),
  ];

  return {
    version: PROFESSOR_BRACKET_POWER_PLAN_V4_10_V1_VERSION,
    targetBracket: args.bracket,
    commanderName: args.commanderName,
    primaryStrategy: primary,
    playStyle: args.playStyle,
    powerLevers: levers,
    primarySpend,
    secondarySpend,
    avoid,
    spendSummary,
  };
}

export function powerLeverLabel(key: PowerLeverKeyV410): string {
  const labels: Record<PowerLeverKeyV410, string> = {
    acceleration: "Acceleration",
    tutors: "Tutors",
    efficientInteraction: "Efficient interaction",
    protection: "Protection",
    repeatableCardAdvantage: "Repeatable card advantage",
    compactFinishers: "Compact finishers",
    gameChangers: "Game Changers",
    fastMana: "Fast mana",
  };
  return labels[key];
}

export function isHighPriority(p: PowerLeverPriorityV410): boolean {
  return p === "HIGH" || p === "MEDIUM_HIGH" || p === "STRATEGY_DEPENDENT";
}
