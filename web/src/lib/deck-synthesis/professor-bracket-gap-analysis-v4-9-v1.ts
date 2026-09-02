/**
 * Bracket gap analysis v4.9 — track trajectory toward requested bracket power.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { DeckSnapshotV46 } from "./professor-council-assembly-v4-6-v1";
import type { BracketBuildPlanV49 } from "./professor-bracket-build-plan-v4-9-v1";
import { loadCommanderBracketPolicyV49 } from "./professor-bracket-policy-v4-9-v1";

export const PROFESSOR_BRACKET_GAP_ANALYSIS_V4_9_V1_VERSION = "professor-bracket-gap-analysis-v4-9-v1";

export type BracketGapAnalysisV49 = {
  version: typeof PROFESSOR_BRACKET_GAP_ANALYSIS_V4_9_V1_VERSION;
  targetBracket: CommanderBracket;
  currentlyEstimatedBracket: CommanderBracket;
  speedGap: "LOW" | "MEDIUM" | "HIGH";
  consistencyGap: "LOW" | "MEDIUM" | "HIGH";
  cardQualityGap: "LOW" | "MEDIUM" | "HIGH";
  manaGap: "LOW" | "MEDIUM" | "HIGH";
  tutorGap: "LOW" | "MEDIUM" | "HIGH";
  accelerationGap: "LOW" | "MEDIUM" | "HIGH";
  interactionGap: "LOW" | "MEDIUM" | "HIGH";
  protectionGap: "LOW" | "MEDIUM" | "HIGH";
  winConditionGap: "LOW" | "MEDIUM" | "HIGH";
  gameChangerUsage: number;
  reasonsCurrentDeckLooksLower: string[];
  reasonsCurrentDeckLooksHigher: string[];
  recommendedPowerLevers: string[];
  checkpointQuestion: string;
};

function gapLevel(actual: number, target: number): "LOW" | "MEDIUM" | "HIGH" {
  if (actual >= target) return "LOW";
  if (actual >= target * 0.6) return "MEDIUM";
  return "HIGH";
}

function estimateEffectiveBracket(args: {
  target: CommanderBracket;
  snapshot: DeckSnapshotV46;
  gameChangerCount: number;
}): CommanderBracket {
  const s = args.snapshot;
  let score = args.target;
  const ramp = s.rampCoverage ?? 0;
  const interaction = s.interactionCoverage ?? 0;
  const draw = s.cardAdvantageCoverage ?? 0;
  const protection = s.protectionCoverage ?? 0;

  if (args.target >= 4) {
    if (ramp < 8) score -= 1;
    if (interaction < 5) score -= 1;
    if (draw < 6) score -= 0.5;
    if (protection < 2 && args.target >= 4) score -= 0.5;
    if (args.gameChangerCount >= 2 && ramp >= 10 && interaction >= 6) score = Math.min(5, args.target + 0.5);
    if (ramp < 5 && interaction < 3) score -= 1.5;
  } else if (args.target === 3) {
    if (ramp < 5) score -= 0.5;
    if (args.gameChangerCount > 3) score += 0.5;
  }

  const rounded = Math.round(Math.max(1, Math.min(5, score))) as CommanderBracket;
  return rounded;
}

export function analyzeBracketGapV49(args: {
  plan: BracketBuildPlanV49 | null;
  snapshot: DeckSnapshotV46;
  gameChangerCount?: number;
}): BracketGapAnalysisV49 {
  const target = args.plan?.targetBracket ?? 3;
  const policy = loadCommanderBracketPolicyV49(target);
  const gc = args.gameChangerCount ?? 0;
  const s = args.snapshot;
  const estimated = estimateEffectiveBracket({ target, snapshot: s, gameChangerCount: gc });

  const reasonsLower: string[] = [];
  const reasonsHigher: string[] = [];
  const levers: string[] = [];

  if (s.rampCoverage < (target >= 4 ? 8 : 5)) {
    reasonsLower.push(`Ramp density (${s.rampCoverage}) below B${target} acceleration target`);
    levers.push("Premium acceleration");
  }
  if (s.interactionCoverage < (target >= 4 ? 5 : 2)) {
    reasonsLower.push(`Interaction suite (${s.interactionCoverage}) too thin for B${target}`);
    levers.push("Efficient interaction");
  }
  if (s.cardAdvantageCoverage < (target >= 4 ? 6 : 3)) {
    reasonsLower.push(`Card advantage (${s.cardAdvantageCoverage}) limits consistency at B${target}`);
    levers.push("Repeatable draw/velocity");
  }
  if (target >= 4 && s.protectionCoverage < 2) {
    reasonsLower.push("Protection for key turns is underdeveloped for Optimized");
    levers.push("Protection spells");
  }
  if (target >= 4 && gc < 2) {
    reasonsLower.push("Few intentional Game Changers for a B4 target");
    levers.push("Strategy-aligned Game Changers");
  }
  if (estimated > target) reasonsHigher.push(`High ramp/interaction suggests power above B${target}`);
  if (gc > (policy.gameChangerMax ?? 99)) reasonsHigher.push("Game Changer count exceeds bracket hard cap");

  return {
    version: PROFESSOR_BRACKET_GAP_ANALYSIS_V4_9_V1_VERSION,
    targetBracket: target,
    currentlyEstimatedBracket: estimated,
    speedGap: gapLevel(s.rampCoverage, target >= 4 ? 8 : 5),
    consistencyGap: gapLevel(s.cardAdvantageCoverage, target >= 4 ? 6 : 3),
    cardQualityGap: estimated < target ? "MEDIUM" : "LOW",
    manaGap: gapLevel(s.landCount, target >= 4 ? 34 : 32),
    tutorGap: target >= 4 && s.cardAdvantageCoverage < 5 ? "HIGH" : "MEDIUM",
    accelerationGap: gapLevel(s.rampCoverage, target >= 4 ? 8 : 5),
    interactionGap: gapLevel(s.interactionCoverage, target >= 4 ? 5 : 2),
    protectionGap: gapLevel(s.protectionCoverage, target >= 4 ? 2 : 1),
    winConditionGap: s.weaknesses.some((w) => /win|finisher|payoff/i.test(w)) ? "HIGH" : "LOW",
    gameChangerUsage: gc,
    reasonsCurrentDeckLooksLower: reasonsLower,
    reasonsCurrentDeckLooksHigher: reasonsHigher,
    recommendedPowerLevers: [...new Set(levers)].slice(0, 6),
    checkpointQuestion: `Are we actually becoming a B${target} deck? ${reasonsLower[0] ?? "Trajectory looks on target."}`,
  };
}

export function isMaterialBracketMissV49(args: {
  requested: CommanderBracket;
  effective: CommanderBracket;
}): boolean {
  return args.effective < args.requested;
}

export function bracketAlignmentLabelV49(args: {
  requested: CommanderBracket;
  effective: CommanderBracket;
}): "PASS" | "LOW" | "FAIL" {
  if (args.effective >= args.requested) return "PASS";
  if (args.requested - args.effective === 1) return "LOW";
  return "FAIL";
}
