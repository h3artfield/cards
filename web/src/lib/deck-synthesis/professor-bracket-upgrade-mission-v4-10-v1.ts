/**
 * Bracket upgrade mission v4.10 — Research missions when Head Professor detects bracket miss.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { FinalDeckDoctorReviewV48 } from "./professor-final-deck-doctor-v4-8-v1";
import type { BracketPowerPlanV410 } from "./professor-bracket-power-plan-v4-10-v1";

export const PROFESSOR_BRACKET_UPGRADE_MISSION_V4_10_V1_VERSION = "professor-bracket-upgrade-mission-v4-10-v1";

export type BracketUpgradeMissionV410 = {
  version: typeof PROFESSOR_BRACKET_UPGRADE_MISSION_V4_10_V1_VERSION;
  requestedBracket: CommanderBracket;
  currentEffectiveBracket: CommanderBracket;
  problems: string[];
  researchMissions: string[];
  preserveCharter: boolean;
  headProfessorReasons: string[];
  recommendedBracketChanges: string[];
};

export function buildBracketUpgradeMissionV410(args: {
  requestedBracket: CommanderBracket;
  review: FinalDeckDoctorReviewV48;
  powerPlan: BracketPowerPlanV410 | null;
}): BracketUpgradeMissionV410 {
  const effective = args.review.predictedEffectiveBracket;
  const problems = [
    ...args.review.structuralProblems.slice(0, 3),
    ...args.review.manaProblems.slice(0, 2),
    ...args.review.interactionProblems.slice(0, 2),
    ...args.review.winPathProblems.slice(0, 2),
  ].slice(0, 6);

  const missions: string[] = [];
  const assessment = args.review.bracketAssessment.toLowerCase();
  if (/tutor|search|find/i.test(assessment) || args.review.manaProblems.some((m) => /tutor/i.test(m))) {
    missions.push("Find strategy-specific tutor package (5–8 candidates)");
  }
  if (/acceler|ramp|fast|mana/i.test(assessment)) {
    missions.push("Find 5–8 higher-efficiency acceleration candidates");
  }
  if (/protection|resilien/i.test(assessment)) {
    missions.push("Find compact protection/interaction for key turns");
  }
  if (/filler|low-impact|quality|slow/i.test(assessment)) {
    missions.push("Remove B2/B3 filler — replace with bracket-appropriate efficiency");
  }
  if (/finisher|win|kill/i.test(assessment)) {
    missions.push("Find compact finisher aligned with charter — not random power");
  }
  if (missions.length === 0) {
    missions.push(
      `Close B${args.requestedBracket - effective} gap via ${args.powerPlan?.primarySpend.slice(0, 2).join(" + ") ?? "power levers"}`,
    );
  }

  return {
    version: PROFESSOR_BRACKET_UPGRADE_MISSION_V4_10_V1_VERSION,
    requestedBracket: args.requestedBracket,
    currentEffectiveBracket: effective,
    problems,
    researchMissions: missions.slice(0, 5),
    preserveCharter: true,
    headProfessorReasons: [
      args.review.bracketAssessment,
      ...args.review.strengths.slice(0, 2),
      ...args.review.structuralProblems.slice(0, 2),
    ].filter(Boolean),
    recommendedBracketChanges: args.review.keyImprovements.slice(0, 5),
  };
}

export type BracketAdjudicationV410 = {
  requestedBracket: CommanderBracket;
  predictedEffectiveBracket: CommanderBracket;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  reasons: string[];
  powerStrengths: string[];
  powerDeficits: string[];
  recommendedBracketChanges: string[];
  playsLikeBecause: string;
  toBecomeTargetWithoutAbandoningCharter: string;
};

export function extractBracketAdjudicationV410(args: {
  requestedBracket: CommanderBracket;
  review: FinalDeckDoctorReviewV48;
}): BracketAdjudicationV410 {
  const gap = args.requestedBracket - args.review.predictedEffectiveBracket;
  return {
    requestedBracket: args.requestedBracket,
    predictedEffectiveBracket: args.review.predictedEffectiveBracket,
    confidence: gap <= 0 ? "HIGH" : gap === 1 ? "MEDIUM" : "LOW",
    reasons: [
      args.review.bracketAssessment,
      ...args.review.structuralProblems.filter((p) => /bracket|power|speed|tutor|game changer/i.test(p)).slice(0, 3),
    ].filter(Boolean),
    powerStrengths: args.review.strengths.slice(0, 6),
    powerDeficits: [
      ...args.review.manaProblems,
      ...args.review.interactionProblems,
      ...args.review.winPathProblems,
    ].slice(0, 6),
    recommendedBracketChanges: args.review.keyImprovements.slice(0, 6),
    playsLikeBecause: args.review.bracketAssessment || args.review.overallAssessment.slice(0, 300),
    toBecomeTargetWithoutAbandoningCharter:
      args.review.keyImprovements.join("; ") || args.review.revisedGamePlan?.slice(0, 300) || "Apply bracket power levers without abandoning deck charter.",
  };
}
