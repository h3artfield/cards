/**
 * Professor deck completion semantics v4.7 — format targets and build phases.
 */
export const PROFESSOR_DECK_COMPLETION_V4_7_V1_VERSION = "professor-deck-completion-v4-7-v1";
export const PROFESSOR_V4_7_DECISION_V1 =
  "PROFESSOR_V4_7_UNIVERSAL_DYNAMIC_CARD_DISCOVERY_AND_FULL_DECK_COMPLETION_V1_AUTHORIZED";

/** Standard single-commander Commander deck. */
export const COMMANDER_DECK_TOTAL_CARDS_V47 = 100;
export const COMMANDER_DECK_LIBRARY_SIZE_V47 = 99;
export const COMMANDER_DECK_COMMAND_ZONE_SIZE_V47 = 1;

export const ASSEMBLY_STRUCTURAL_TARGET_V47 = 85;
export const MINIMUM_CANDIDATE_BUFFER_V47 = 24;
export const INITIAL_BATCH_TARGET_V47 = 12;

export type DeckBuildPhaseV47 =
  | "CHARTER"
  | "RESEARCHING"
  | "BUILDING"
  | "CHECKPOINT"
  | "CUT_AND_BALANCE"
  | "MANA_BASE"
  | "PROVISIONAL_100"
  | "HEAD_PROFESSOR_REVIEW"
  | "FINAL_REFINEMENT"
  | "FINAL_LEGALITY"
  | "PROFESSOR_GRADE"
  | "FINAL_REVIEW"
  | "BRACKET_REFINEMENT"
  | "NEEDS_ATTENTION"
  | "STRUCTURALLY_INCOMPLETE"
  | "BUILD_FAILED_CANDIDATE_EXHAUSTION"
  | "DRAFT_READY";

export type LegalityGateResultV47 = {
  pass: boolean;
  totalCards: number;
  expectedTotal: number;
  libraryCards: number;
  expectedLibrary: number;
  commandZoneCards: number;
  colorIdentityPass: boolean;
  singletonPass: boolean;
  unresolvedIdentities: string[];
  failures: string[];
};

export function expectedDeckTotalsV47(commandZoneCount = COMMANDER_DECK_COMMAND_ZONE_SIZE_V47): {
  totalCards: number;
  libraryCards: number;
  commandZoneCards: number;
} {
  return {
    commandZoneCards: commandZoneCount,
    libraryCards: COMMANDER_DECK_TOTAL_CARDS_V47 - commandZoneCount,
    totalCards: COMMANDER_DECK_TOTAL_CARDS_V47,
  };
}

export function countCommittedDeckCardsV47(args: {
  selectedNonCommanderCount: number;
  commandZoneCount?: number;
  landCount?: number;
}): number {
  return (args.commandZoneCount ?? COMMANDER_DECK_COMMAND_ZONE_SIZE_V47) + args.selectedNonCommanderCount;
}

export function isDraftReadyV47(args: {
  buildPhase: DeckBuildPhaseV47;
  legalityGate: LegalityGateResultV47 | null;
}): boolean {
  return args.buildPhase === "DRAFT_READY" && Boolean(args.legalityGate?.pass);
}

export function buildProgressLabelV47(args: {
  committedCount: number;
  buildPhase: DeckBuildPhaseV47;
  draftReady: boolean;
}): { header: string; sublabel: string } {
  if (args.draftReady) {
    return {
      header: "Full deck",
      sublabel: `${COMMANDER_DECK_TOTAL_CARDS_V47} / ${COMMANDER_DECK_TOTAL_CARDS_V47}`,
    };
  }
  const phaseLabel: Record<DeckBuildPhaseV47, string> = {
    CHARTER: "Planning",
    RESEARCHING: "Researching",
    BUILDING: "Building deck",
    CHECKPOINT: "Council checkpoint",
    CUT_AND_BALANCE: "Cut & balance",
    MANA_BASE: "Building mana base",
    PROVISIONAL_100: "Provisional deck complete",
    HEAD_PROFESSOR_REVIEW: "Head Professor review",
    FINAL_REFINEMENT: "Final refinement",
    FINAL_LEGALITY: "Final legality check",
    PROFESSOR_GRADE: "Grading deck",
    FINAL_REVIEW: "Final review",
    BRACKET_REFINEMENT: "Bracket refinement",
    NEEDS_ATTENTION: "Needs attention",
    STRUCTURALLY_INCOMPLETE: "Structural slots incomplete",
    BUILD_FAILED_CANDIDATE_EXHAUSTION: "Candidate search exhausted",
    DRAFT_READY: "Draft ready",
  };
  return {
    header: phaseLabel[args.buildPhase] ?? "Building deck",
    sublabel: `${args.committedCount} / ${COMMANDER_DECK_TOTAL_CARDS_V47}`,
  };
}
