/**
 * Post-refinement gate — block grade/DRAFT_READY when critical structural problems remain.
 */
import type { ProfessorCouncilStateV47 } from "./professor-council-assembly-v4-7-v1";
import type { FinalDeckDoctorReviewV48 } from "./professor-final-deck-doctor-v4-8-v1";
import type { summarizeRefinement } from "./professor-final-refinement-v4-8-v1";
import { computeTargetLandCountV48 } from "./professor-final-refinement-v4-8-v1";

export const PROFESSOR_FINAL_REFINEMENT_GATE_V4_8_V1_VERSION = "professor-final-refinement-gate-v4-8-v1";

export const COMMANDER_MIN_LAND_COUNT_V48 = 30;

export type CriticalStructuralFindingV48 = {
  code: string;
  message: string;
  severity: "CRITICAL" | "WARNING";
};

export class FinalRefinementGateFailedError extends Error {
  constructor(
    message: string,
    public readonly findings: CriticalStructuralFindingV48[],
  ) {
    super(message);
    this.name = "FinalRefinementGateFailedError";
  }
}

export function evaluateCriticalStructuralFindingsV48(args: {
  councilState: ProfessorCouncilStateV47;
  review: FinalDeckDoctorReviewV48;
  summary: ReturnType<typeof summarizeRefinement>;
}): CriticalStructuralFindingV48[] {
  const findings: CriticalStructuralFindingV48[] = [];
  const landCount = args.councilState.selectedCards.filter((c) => c.category === "land").length;
  const targetLandCount = computeTargetLandCountV48(args.councilState.selectedCards);
  const snapshot = args.councilState.snapshots[args.councilState.snapshots.length - 1];

  if (landCount < COMMANDER_MIN_LAND_COUNT_V48) {
    findings.push({
      code: "LOW_LAND_COUNT",
      message: `Only ${landCount} lands in 99-card library (minimum ${COMMANDER_MIN_LAND_COUNT_V48})`,
      severity: "CRITICAL",
    });
  }

  if (args.review.requiresMajorRevision && landCount < COMMANDER_MIN_LAND_COUNT_V48) {
    findings.push({
      code: "MAJOR_REVISION_INCOMPLETE",
      message: `Head Professor requested major rebuild but only ${landCount} lands (minimum ${COMMANDER_MIN_LAND_COUNT_V48})`,
      severity: "CRITICAL",
    });
  } else if (args.review.requiresMajorRevision && landCount < targetLandCount) {
    findings.push({
      code: "MAJOR_REVISION_SOFT",
      message: `Land base ${landCount}/${targetLandCount} — below ideal target but above minimum`,
      severity: "WARNING",
    });
  }

  if (args.review.manaProblems.length > 0 && landCount < 32) {
    findings.push({
      code: "UNRESOLVED_MANA",
      message: args.review.manaProblems[0]!,
      severity: "CRITICAL",
    });
  }

  if (args.review.structuralProblems.length > 0 && landCount < COMMANDER_MIN_LAND_COUNT_V48) {
    findings.push({
      code: "UNRESOLVED_STRUCTURAL",
      message: args.review.structuralProblems[0]!,
      severity: "CRITICAL",
    });
  }

  const rejectedManaSwaps = args.summary.rejected > 0 && landCount < COMMANDER_MIN_LAND_COUNT_V48;
  if (rejectedManaSwaps && args.review.swaps.some((s) => isManaRelatedSwap(s.add, s.reason, s.expectedImprovement))) {
    findings.push({
      code: "REJECTED_MANA_SWAPS",
      message: "Mana/land swaps were rejected but low land count persists",
      severity: "CRITICAL",
    });
  }

  if (snapshot?.weaknesses?.some((w) => /land|mana|curve/i.test(w)) && landCount < 32) {
    findings.push({
      code: "SNAPSHOT_MANA_WEAKNESS",
      message: snapshot.weaknesses.find((w) => /land|mana|curve/i.test(w))!,
      severity: "CRITICAL",
    });
  }

  return findings;
}

export function isManaRelatedSwap(addName: string, reason: string, expectedImprovement: string[]): boolean {
  const text = `${addName} ${reason} ${expectedImprovement.join(" ")}`.toLowerCase();
  return /land|mana|fixing|curve|base|ramp source/.test(text);
}

export function assertFinalRefinementGateV48(args: {
  councilState: ProfessorCouncilStateV47;
  review: FinalDeckDoctorReviewV48;
  summary: ReturnType<typeof summarizeRefinement>;
}): void {
  const critical = evaluateCriticalStructuralFindingsV48(args).filter((f) => f.severity === "CRITICAL");
  if (critical.length === 0) return;
  throw new FinalRefinementGateFailedError(
    `Final refinement incomplete: ${critical.map((f) => f.message).join("; ")}`,
    critical,
  );
}

export function refinementGateNeedsSecondPassV48(args: {
  councilState: ProfessorCouncilStateV47;
  review: FinalDeckDoctorReviewV48;
  summary: ReturnType<typeof summarizeRefinement>;
  headProfessorPasses: number;
}): boolean {
  if (args.headProfessorPasses >= 2) return false;
  const critical = evaluateCriticalStructuralFindingsV48(args).filter((f) => f.severity === "CRITICAL");
  return critical.length > 0;
}
