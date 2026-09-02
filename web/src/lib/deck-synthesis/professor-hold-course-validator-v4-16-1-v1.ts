/**
 * Professor v4.16.1 — HOLD_COURSE validator (orchestrator-enforced, not prompt-only).
 */
import type { BracketGapAnalysisV410 } from "./professor-bracket-gap-analysis-v4-10-v1";
import type { BracketPowerPortfolioV416 } from "./professor-bracket-power-portfolio-v4-16-v1";
import type { CanonicalLegalityAssessmentV4161 } from "./professor-canonical-legality-v4-16-1-v1";
import type { BracketPowerUtilizationV4161 } from "./professor-bracket-power-utilization-v4-16-1-v1";
import type { B4WinReadinessV4161 } from "./professor-b4-win-readiness-v4-16-1-v1";

export const PROFESSOR_HOLD_COURSE_VALIDATOR_V4_16_1_V1_VERSION = "professor-hold-course-validator-v4-16-1-v1";

export type HoldCourseValidationV4161 =
  | { allowed: true; action: "HOLD_COURSE"; message: string }
  | { allowed: false; action: "RESEARCH_REQUIRED"; message: string; unresolvedNeeds: string[] };

export function validateHoldCourseV4161(args: {
  portfolio: BracketPowerPortfolioV416 | null;
  gap: BracketGapAnalysisV410 | null;
  legality: CanonicalLegalityAssessmentV4161 | null;
  utilization: BracketPowerUtilizationV4161 | null;
  winReadiness: B4WinReadinessV4161 | null;
  highDeficitCheckpointStreak?: number;
  primaryStrategy?: string;
}): HoldCourseValidationV4161 {
  const unresolved: string[] = [];

  if (args.legality && !args.legality.finalDeckLegal && args.legality.duplicateNonBasics.length > 0) {
    unresolved.push(`Legality: duplicate nonbasics (${args.legality.duplicateNonBasics.join(", ")})`);
  } else if (args.legality && !args.legality.gate.singletonPass) {
    unresolved.push("Legality: singleton violation in working deck");
  }

  if (args.portfolio?.criticalDeficits.length) {
    for (const d of args.portfolio.criticalDeficits) unresolved.push(`${d}: CRITICAL deficit`);
  }

  if (args.gap?.holdCourseForbidden) {
    unresolved.push(args.gap.currentPowerDeficits[0] ?? "Bracket power deficit");
  }

  if (args.utilization?.belowTargetDimensions.length) {
    for (const d of args.utilization.belowTargetDimensions.slice(0, 3)) {
      unresolved.push(`${d}: BELOW_TARGET`);
    }
  }

  if (args.winReadiness && !args.winReadiness.ready) {
    unresolved.push(`Win architecture: ${args.winReadiness.summary}`);
  }

  const highStreak = args.highDeficitCheckpointStreak ?? 0;
  if ((args.portfolio?.highDeficits.length ?? 0) > 0 && highStreak >= 2) {
    unresolved.push(
      `HIGH bracket-floor deficits persisted ${highStreak} checkpoints — ordinary synergy search suspended`,
    );
  }

  if (unresolved.length > 0) {
    return {
      allowed: false,
      action: "RESEARCH_REQUIRED",
      message: `Cannot hold course — ${unresolved[0]}. Next: dedicated bracket power search.`,
      unresolvedNeeds: unresolved,
    };
  }

  const strategy = args.primaryStrategy?.slice(0, 120) ?? "current charter strategy";
  return {
    allowed: true,
    action: "HOLD_COURSE",
    message: `Hold course — ${strategy}.`,
  };
}

export function resolveCreativeCheckpointMessageV4161(args: {
  weaknesses: string[];
  validation: HoldCourseValidationV4161;
  deckIdentity?: string;
}): string {
  if (!args.validation.allowed) {
    return args.validation.message;
  }
  if (args.weaknesses[0]) {
    return `Agreed — next adds should fix "${args.weaknesses[0].slice(0, 100)}" while staying on ${(args.deckIdentity ?? "charter").slice(0, 80)}.`;
  }
  return args.validation.message;
}
