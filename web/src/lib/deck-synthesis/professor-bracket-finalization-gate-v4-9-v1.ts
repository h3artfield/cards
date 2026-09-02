/**
 * Bracket target miss gate — block DRAFT_READY when effective bracket < requested.
 */
import type { CommanderBracket } from "@/lib/bracket-policy/commander-bracket-snapshot-v1";
import type { FinalDeckDoctorReviewV48 } from "./professor-final-deck-doctor-v4-8-v1";
import {
  bracketAlignmentLabelV49,
  isMaterialBracketMissV49,
} from "./professor-bracket-gap-analysis-v4-9-v1";

export const PROFESSOR_BRACKET_FINALIZATION_GATE_V4_9_V1_VERSION = "professor-bracket-finalization-gate-v4-9-v1";

export class BracketTargetMissError extends Error {
  constructor(
    message: string,
    public readonly requestedBracket: CommanderBracket,
    public readonly effectiveBracket: CommanderBracket,
    public readonly alignment: "PASS" | "LOW" | "FAIL",
  ) {
    super(message);
    this.name = "BracketTargetMissError";
  }
}

export function assertBracketTargetMetV49(args: {
  requestedBracket: CommanderBracket;
  review: FinalDeckDoctorReviewV48;
}): void {
  const effective = args.review.predictedEffectiveBracket;
  if (!isMaterialBracketMissV49({ requested: args.requestedBracket, effective })) return;
  const alignment = bracketAlignmentLabelV49({ requested: args.requestedBracket, effective });
  throw new BracketTargetMissError(
    `Bracket target miss — requested B${args.requestedBracket}, Head Professor reads effective B${effective}. ${args.review.bracketAssessment || "Deck plays below requested power environment."}`,
    args.requestedBracket,
    effective,
    alignment,
  );
}

export function computeBracketAlignmentGradeV49(args: {
  requestedBracket: CommanderBracket;
  effectiveBracket: CommanderBracket;
}): { score: number; letter: string; alignment: "PASS" | "LOW" | "FAIL"; explanation: string } {
  const alignment = bracketAlignmentLabelV49(args);
  const gap = args.requestedBracket - args.effectiveBracket;
  const score = gap <= 0 ? 95 : gap === 1 ? 62 : gap >= 2 ? 35 : 50;
  const letter = gap <= 0 ? "A" : gap === 1 ? "C" : "F";
  return {
    score,
    letter,
    alignment,
    explanation:
      gap <= 0
        ? `Effective power (B${args.effectiveBracket}) meets or exceeds requested B${args.requestedBracket}.`
        : `Requested B${args.requestedBracket} but deck plays like B${args.effectiveBracket} — bracket intent not fully delivered.`,
  };
}
