/**
 * Bracket Build Plan v4.9 — translate requested bracket into construction strategy.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckCharterV45 } from "./professor-council-state-v4-5-v1";
import type { CreativeProfessorPass1V4 } from "./professor-creative-pass1-contracts-v4";
import { loadCommanderBracketPolicyV49, type CommanderBracketPolicyV49 } from "./professor-bracket-policy-v4-9-v1";

export const PROFESSOR_BRACKET_BUILD_PLAN_V4_9_V1_VERSION = "professor-bracket-build-plan-v4-9-v1";

export type BracketBuildPlanV49 = {
  version: typeof PROFESSOR_BRACKET_BUILD_PLAN_V4_9_V1_VERSION;
  targetBracket: CommanderBracket;
  policyVersion: string;
  officialHardConstraints: string[];
  officialSoftExpectations: string[];
  desiredSpeedProfile: string;
  desiredConsistencyProfile: string;
  desiredInteractionProfile: string;
  desiredWinConditionProfile: string;
  gameChangerStrategy: string;
  fastManaStrategy: string;
  tutorStrategy: string;
  protectionStrategy: string;
  disruptionStrategy: string;
  cardAdvantageStrategy: string;
  finisherStrategy: string;
  comboPreference: string;
  extraTurnPreference: string;
  massLandDenialPreference: string;
  userStyleConstraints: string[];
  commanderRelationshipConstraints: string[];
  bracketPowerLeversToUse: string[];
  bracketPowerLeversToAvoid: string[];
  powerPlanSummary: string[];
  expectedExperience: string;
};

function comboPreferenceForBracket(bracket: CommanderBracket, playStyle: string): string {
  if (/no combo|without combo|no infinite/i.test(playStyle)) {
    return "No infinite combos — use other bracket power levers (speed, tutors, finishers, interaction).";
  }
  return loadCommanderBracketPolicyV49(bracket).comboPolicy;
}

export function buildBracketBuildPlanV49(args: {
  bracket: CommanderBracket;
  playStyle: string;
  relationship: string;
  commanderName: string;
  pass1: CreativeProfessorPass1V4;
  charter?: DeckCharterV45 | null;
}): BracketBuildPlanV49 {
  const policy = loadCommanderBracketPolicyV49(args.bracket);
  const identity = args.charter?.deckIdentity ?? args.pass1.strategicThesis.slice(0, 120);
  const primary = args.pass1.packages[0]?.concept ?? "primary engine";
  const hard: string[] = [
    policy.gameChangerPolicy,
    policy.comboPolicy,
    policy.extraTurnPolicy,
    policy.massLandDenialPolicy,
  ];
  if (policy.gameChangerMax === 3) hard.push("Maximum 3 Game Changers in final list");

  const soft: string[] = [
    policy.gameplayExpectation,
    policy.expectedTurnWindow,
    `Express ${primary} at ${policy.name} power, not merely ${args.bracket - 1 > 0 ? `B${args.bracket - 1}` : "casual"} with extra staples`,
  ];

  const leversToUse: string[] = [];
  const leversToAvoid: string[] = ["Slow seven-mana filler without multi-role payoff", "Cute packages unsupported by charter"];

  if (args.bracket >= 4) {
    leversToUse.push(
      "Premium acceleration",
      "Efficient tutors where colors permit",
      "High card quality and redundancy",
      "Compact finishers",
      "Strong instant-speed interaction",
      "Protection for high-value turns",
      "Intentional Game Changers that fit strategy",
    );
    leversToAvoid.push("Low-impact creatures that only incrementally improve board", "Inefficient removal");
  } else if (args.bracket === 3) {
    leversToUse.push("Strong synergy", "Up to 3 intentional Game Changers", "Solid interaction suite", "Reasonable speed");
  } else {
    leversToUse.push("Thematic cohesion", "Accessible mana", "Incremental advantage");
    leversToAvoid.push("Heavy tutoring", "Fast deterministic combos", "Game Changers");
  }

  const powerPlanSummary = [
    `Target: B${args.bracket} · ${policy.name}`,
    `Identity: ${identity}`,
    args.bracket >= 4 ? "Push every supporting system toward the B4 ceiling without abandoning user identity" : `Build strongest B${args.bracket} version of chosen identity`,
    ...leversToUse.slice(0, 5).map((l) => `✓ ${l}`),
  ];

  return {
    version: PROFESSOR_BRACKET_BUILD_PLAN_V4_9_V1_VERSION,
    targetBracket: args.bracket,
    policyVersion: policy.policyVersion,
    officialHardConstraints: hard,
    officialSoftExpectations: soft,
    desiredSpeedProfile: policy.expectedTurnWindow,
    desiredConsistencyProfile:
      args.bracket >= 4 ? "High redundancy and tutor access to key pieces" : args.bracket === 3 ? "Reliable engine execution by midgame" : "Steady development",
    desiredInteractionProfile: policy.gameplayExpectation.includes("fast") ? "Efficient free/cheap interaction" : policy.name,
    desiredWinConditionProfile: args.charter?.intendedWinPaths[0] ?? primary,
    gameChangerStrategy:
      policy.gameChangerMax === 0
        ? "No Game Changers"
        : `Select Game Changers that improve ${primary}, not generic power inserts`,
    fastManaStrategy: args.bracket >= 4 ? "Prioritize premium mana rocks and efficient ramp" : args.bracket === 3 ? "Solid ramp without cEDH fast mana density" : "Modest ramp only",
    tutorStrategy: args.bracket >= 4 ? "Efficient tutors to key engine/finisher pieces" : args.bracket === 3 ? "Limited tutors for missing roles" : "Minimal tutoring",
    protectionStrategy: args.bracket >= 3 ? "Protect high-value turns and commander when relevant" : "Light protection",
    disruptionStrategy: args.bracket >= 4 ? "Free/cheap interaction and stack interaction where colors allow" : "Role-appropriate interaction",
    cardAdvantageStrategy: "Repeatable velocity and engines that match charter",
    finisherStrategy: args.bracket >= 4 ? "Compact lethal finisher redundant with combat plan" : "Clear late-game payoff",
    comboPreference: comboPreferenceForBracket(args.bracket, args.playStyle),
    extraTurnPreference: policy.extraTurnPolicy,
    massLandDenialPreference: policy.massLandDenialPolicy,
    userStyleConstraints: [args.playStyle, identity],
    commanderRelationshipConstraints: [args.relationship],
    bracketPowerLeversToUse: leversToUse,
    bracketPowerLeversToAvoid: leversToAvoid,
    powerPlanSummary,
    expectedExperience:
      args.bracket >= 4
        ? "Threaten decisive games substantially earlier than B3; recover efficiently when stopped."
        : args.bracket === 3
          ? "Strong upgraded games — faster than casual but not optimized-speed."
          : "Casual-to-core pacing aligned with bracket philosophy.",
  };
}

export function buildBracketStrategyCouncilTurnsV49(args: {
  bracket: CommanderBracket;
  commanderName: string;
  playStyle: string;
  relationship: string;
  plan: BracketBuildPlanV49;
  primaryStrategy: string;
}): { creative: string; research: string; critic: string; decision: string } {
  const b = args.bracket;
  return {
    creative:
      b >= 4
        ? `The player asked for B${b} Optimized. ${args.primaryStrategy} alone isn't enough — we need this deck to convert development into a fast, decisive kill while keeping ${args.playStyle.toLowerCase()} identity.`
        : `We're building for B${b}. Keep ${args.primaryStrategy.toLowerCase()} as the spine, but every pick must respect ${args.plan.expectedExperience.toLowerCase()}`,
    research:
      b >= 4
        ? `B${b} gives us the full Game Changer pool. I'll search for premium acceleration, efficient tutors, snowballing engines, low-cost protection/interaction, and compact finishers that reinforce ${args.commanderName.split(",")[0]} — not generic cEDH soup.`
        : `I'll filter candidates by B${b} policy: ${args.plan.gameChangerStrategy}. Search targets ${args.plan.bracketPowerLeversToUse.slice(0, 3).join(", ")}.`,
    critic:
      `Our target is not merely legality — the finished deck must play like B${b}. I'll track speed, consistency, mana quality, tutor density, interaction efficiency, and kill compactness vs ${args.relationship}.`,
    decision: `B${b} power plan locked — ${args.plan.powerPlanSummary.slice(1, 3).join("; ")}`,
  };
}

export function bracketBuildPlanToPromptText(plan: BracketBuildPlanV49): string {
  return [
    `TARGET BRACKET: B${plan.targetBracket}`,
    `Policy: ${plan.policyVersion}`,
    "",
    "POWER PLAN",
    ...plan.powerPlanSummary.map((line) => (line.startsWith("✓") ? line : `• ${line}`)),
    "",
    "LEVERS TO USE",
    ...plan.bracketPowerLeversToUse.map((l) => `- ${l}`),
    "",
    "AVOID",
    ...plan.bracketPowerLeversToAvoid.map((l) => `- ${l}`),
    "",
    `EXPECTED EXPERIENCE: ${plan.expectedExperience}`,
  ].join("\n");
}
