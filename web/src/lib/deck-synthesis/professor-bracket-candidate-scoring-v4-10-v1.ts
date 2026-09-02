/**
 * Bracket-sensitive candidate scoring v4.10.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";
import type { FunctionalCardProfileV47 } from "./professor-functional-profile-v4-7-v1";
import type { DeckNeedV47 } from "./professor-deck-needs-v4-7-v1";
import { bracketPowerWeightV49 } from "./professor-bracket-policy-v4-9-v1";

export const PROFESSOR_BRACKET_CANDIDATE_SCORING_V4_10_V1_VERSION = "professor-bracket-candidate-scoring-v4-10-v1";

export type BracketCandidateScoreBreakdownV410 = {
  commanderFit: number;
  packageFit: number;
  roleCompression: number;
  bracketPowerFit: number;
  efficiencyScore: number;
  speedContribution: number;
  consistencyContribution: number;
  compactnessContribution: number;
  interactionEfficiency: number;
  setupCostPenalty: number;
  fillerPenalty: number;
  finalScore: number;
};

const TUTOR_RE = /tutor|diabolic|demonic|vampiric|imperial seal|gamble|worldly|enlightened|mystical|personal tutor|recruiter|survival of the fittest|finale of devastation|fabricate|merchant scroll|wishclaw|spellseeker|tribute mage|isochron scepter/i;
const FAST_MANA_RE = /sol ring|mana crypt|dockside|mana vault|grim monolith|chrome mox|mox diamond|jeweled lotus|lotus petal|ancient tomb|city of traitors|three visits|nature's lore|farseek|rampant growth|cultivate|kodama's reach|skyshroud claim/i;
const PREMIUM_INTERACTION_RE = /force of will|force of negation|fierce guardianship|deflecting swat|deadly rollick|cyclonic rift|counterspell|swan song|mystical dispute|abrupt decay|terminate|lightning bolt|path to exile|swords to plowshares|assassin's trophy/i;

export function bracketDesiredPropertiesV410(bracket: CommanderBracket): string[] {
  if (bracket >= 4) {
    return [
      "low setup cost",
      "immediate impact",
      "repeatability",
      "reduced setup",
      "role compression",
      "high resource efficiency",
      "compact engine participation",
      "strong interaction",
      "strong protection",
      "tutorability",
      "fast mana / acceleration",
    ];
  }
  if (bracket === 3) {
    return ["synergistic", "solid efficiency", "thematic fit", "reasonable speed"];
  }
  return ["thematic fit", "accessible mana", "incremental advantage"];
}

export function applyBracketToDeckNeedV410(need: DeckNeedV47, bracket: CommanderBracket): DeckNeedV47 {
  return {
    ...need,
    requiredFunctions: [...need.requiredFunctions, ...bracketDesiredPropertiesV410(bracket).slice(0, 4)],
    preferredFunctions: [...need.preferredFunctions, `bracket-target-B${bracket}`],
    conceptText: need.conceptText
      ? `${need.conceptText} (B${bracket}: ${bracketDesiredPropertiesV410(bracket).slice(0, 3).join(", ")})`
      : need.conceptText,
  };
}

export function scoreCandidateForBracketV410(args: {
  profile: FunctionalCardProfileV47;
  bracket: CommanderBracket;
  powerPlan: BracketPowerPlanV410 | null;
  need?: DeckNeedV47 | null;
  manaValue?: number;
}): BracketCandidateScoreBreakdownV410 {
  const p = args.profile;
  const mv = args.manaValue ?? p.manaValue ?? 3;
  const text = `${p.name} ${p.exactOracleText ?? ""}`.toLowerCase();
  const powerWeight = args.powerPlan ? bracketPowerWeightV49(args.bracket) : args.bracket >= 4 ? 1 : 0.5;

  const commanderFit = Math.min(4, p.roles.length);
  const packageFit = p.roleCompressionScore;
  const roleCompression = p.roleCompressionScore;

  let bracketPowerFit = 0;
  let efficiencyScore = mv <= 3 ? 2 : mv <= 5 ? 1 : 0;
  let speedContribution = 0;
  let consistencyContribution = 0;
  let compactnessContribution = 0;
  let interactionEfficiency = 0;
  let setupCostPenalty = mv >= 6 ? 2 : mv >= 5 ? 1 : 0;
  let fillerPenalty = 0;

  if (p.roles.includes("ramp") || FAST_MANA_RE.test(text)) {
    speedContribution += args.bracket >= 4 ? 4 : 2;
    bracketPowerFit += Math.round(3 * powerWeight);
  }
  if (TUTOR_RE.test(text) || p.roles.includes("tutor")) {
    consistencyContribution += args.bracket >= 4 ? 5 : 2;
    bracketPowerFit += args.bracket >= 4 ? 4 : 1;
  }
  if (p.roles.includes("interaction") || PREMIUM_INTERACTION_RE.test(text)) {
    interactionEfficiency += args.bracket >= 4 ? 3 : 1;
    bracketPowerFit += Math.round(2 * powerWeight);
  }
  if (p.roles.includes("protection")) bracketPowerFit += args.bracket >= 4 ? 2 : 1;
  if (p.roles.includes("card-advantage")) {
    consistencyContribution += args.bracket >= 4 ? 3 : 2;
    bracketPowerFit += Math.round(2 * powerWeight);
  }
  if (p.roles.includes("finisher")) {
    compactnessContribution += args.bracket >= 4 ? 2 : 1;
    if (args.bracket >= 4 && mv >= 6) fillerPenalty += 2;
  }

  if (args.bracket >= 4) {
    if (p.roles.length <= 1 && mv >= 4) fillerPenalty += 2;
    if (/vanilla|bear|keldon raider|doorman|puppet|pummeler|line breaker|vampire|wei strike/i.test(text)) fillerPenalty += 3;
    if (PREMIUM_INTERACTION_RE.test(text) || FAST_MANA_RE.test(text)) efficiencyScore += 2;
  }

  const finalScore =
    commanderFit +
    packageFit +
    roleCompression +
    bracketPowerFit +
    efficiencyScore +
    speedContribution +
    consistencyContribution +
    compactnessContribution +
    interactionEfficiency -
    setupCostPenalty -
    fillerPenalty;

  return {
    commanderFit,
    packageFit,
    roleCompression,
    bracketPowerFit,
    efficiencyScore,
    speedContribution,
    consistencyContribution,
    compactnessContribution,
    interactionEfficiency,
    setupCostPenalty,
    fillerPenalty,
    finalScore: Math.max(0, finalScore),
  };
}

export type BracketSearchComparisonV410 = {
  needId: string;
  needCategory: string;
  queryConcept: string;
  bracket: CommanderBracket;
  topCandidates: Array<{
    name: string;
    finalScore: number;
    bracketPowerFit: number;
    reason: string;
  }>;
};

export function buildSearchComparisonV410(args: {
  need: DeckNeedV47;
  bracket: CommanderBracket;
  results: Array<{ name: string; score: number; reason: string; profile: FunctionalCardProfileV47 }>;
  powerPlan: BracketPowerPlanV410 | null;
}): BracketSearchComparisonV410 {
  const rescored = args.results.map((r) => {
    const breakdown = scoreCandidateForBracketV410({
      profile: r.profile,
      bracket: args.bracket,
      powerPlan: args.powerPlan,
      need: args.need,
    });
    return {
      name: r.name,
      finalScore: breakdown.finalScore,
      bracketPowerFit: breakdown.bracketPowerFit,
      reason: r.reason,
    };
  });
  return {
    needId: args.need.needId,
    needCategory: args.need.category,
    queryConcept: args.need.conceptText ?? args.need.category,
    bracket: args.bracket,
    topCandidates: rescored.sort((a, b) => b.finalScore - a.finalScore).slice(0, 8),
  };
}
