/**
 * Bracket checkpoint council v4.10 — power-plan accountability; forbid silent HOLD_COURSE.
 */
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";
import { runCheckpointCouncilV46, type ProfessorCouncilStateV46 } from "./professor-council-assembly-v4-6-v1";
import type { BracketGapAnalysisV410 } from "./professor-bracket-gap-analysis-v4-10-v1";
import { powerLeverLabel, type PowerLeverKeyV410 } from "./professor-bracket-power-plan-v4-10-v1";

export const PROFESSOR_BRACKET_CHECKPOINT_V4_10_V1_VERSION = "professor-bracket-checkpoint-v4-10-v1";

export function augmentCheckpointDecisionV410(args: {
  state: ProfessorCouncilStateV47;
  threshold: number;
  gap: BracketGapAnalysisV410 | null;
  baseDecision: string;
}): { decision: string; councilMessage: string; forbidHoldCourse: boolean } {
  const gap = args.gap;
  if (!gap || gap.analysisStatus === "BRACKET_ANALYSIS_DEGRADED") {
    return {
      decision: `${args.baseDecision} [BRACKET_ANALYSIS_DEGRADED]`,
      councilMessage: "Gap analysis degraded — cannot verify bracket trajectory. Research must prioritize power-plan levers.",
      forbidHoldCourse: true,
    };
  }

  if (gap.holdCourseForbidden) {
    const deficit = gap.currentPowerDeficits[0] ?? gap.unresolvedHighDeficits.map((k) => powerLeverLabel(k as PowerLeverKeyV410)).join(", ");
    const msg =
      gap.compactnessStatus === "VERY_HIGH" && gap.tutorStatus === "NONE"
        ? `We're over-invested in finishers and under-invested in access and acceleration. Stop adding finishers; next slots on ${gap.recommendedPowerLevers.slice(0, 3).join(", ")}.`
        : `We're targeting B${gap.requestedBracket}, but this still develops like B${gap.predictedBracket}. ${deficit}. Next picks must address: ${gap.recommendedPowerLevers.slice(0, 3).join(", ")}.`;
    return {
      decision: `BRACKET_DEFICIT at ${args.threshold} cards — ${deficit}`,
      councilMessage: msg,
      forbidHoldCourse: true,
    };
  }

  return {
    decision: args.baseDecision,
    councilMessage: gap.checkpointMessage,
    forbidHoldCourse: false,
  };
}

export function runCheckpointCouncilV410(
  state: ProfessorCouncilStateV47,
  threshold: number,
  gap: BracketGapAnalysisV410 | null,
): ProfessorCouncilStateV47 {
  const base = runCheckpointCouncilV46(state as ProfessorCouncilStateV46, threshold) as ProfessorCouncilStateV47;
  const lastDecision = base.councilDecisions[base.councilDecisions.length - 1];
  if (!lastDecision || !gap) return base;

  const augmented = augmentCheckpointDecisionV410({
    state,
    threshold,
    gap,
    baseDecision: lastDecision.decision,
  });

  if (!augmented.forbidHoldCourse) return base;

  const conversation = [...base.conversation];
  let turnCounter = conversation.length;
  conversation.push({
    turnId: `t-${turnCounter++}`,
    phase: "CHECKPOINT",
    speaker: "RESEARCH",
    intent: "CHALLENGE",
    respondsToTurnIds: [],
    message: augmented.councilMessage,
    developerDetail: JSON.stringify({
      threshold,
      gap: {
        requested: gap.requestedBracket,
        predicted: gap.predictedBracket,
        unresolved: gap.unresolvedHighDeficits,
        levers: gap.recommendedPowerLevers,
      },
    }),
  });

  const decisions = [...base.councilDecisions];
  decisions[decisions.length - 1] = {
    ...lastDecision,
    decision: augmented.decision,
    reasoning: gap.checkpointMessage,
    designRulesAdded: [`No HOLD_COURSE — address ${gap.unresolvedHighDeficits.join(", ") || "bracket deficit"}`],
  };

  return { ...base, conversation, councilDecisions: decisions };
}
