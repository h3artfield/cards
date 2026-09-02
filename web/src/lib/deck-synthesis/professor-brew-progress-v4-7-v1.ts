/**
 * Client-safe brew progress helpers — no server/catalog/firebase imports.
 */
import type { BrewSessionV42 } from "./professor-brew-session-types-v4-2-v1";
import {
  COMMANDER_DECK_LIBRARY_SIZE_V47,
  COMMANDER_DECK_TOTAL_CARDS_V47,
} from "./professor-deck-completion-v4-7-v1";
import { assessDeckSlotBudgetV4163 } from "./professor-deck-slot-budget-v4-16-3-v1";
import { resolveProfessorBuildControlFromSessionV41661 } from "./professor-build-control-v4-16-6-1-v1";
import { resolveProfessorNextActionFromSessionV41662 } from "./professor-next-action-dispatch-v4-16-6-2-v1";

export const PROFESSOR_BREW_PROGRESS_V4_7_V1_VERSION = "professor-brew-progress-v4-7-v1";

export function professorBrewCommittedCardCountV47(session: BrewSessionV42): number {
  if (session.councilState) {
    return 1 + session.councilState.selectedCards.length;
  }
  return session.deckList.length;
}

export function professorBrewIsDraftReadyV47(session: BrewSessionV42): boolean {
  if (session.fixtureCase) return session.autoBuildComplete;
  if (session.finalDeckDoctor?.status === "FAILED") return false;
  if (
    session.finalReport?.status === "COMPLETE" &&
    session.deckGrade &&
    session.finalDeckDoctor?.headProfessorCallCompleted
  ) {
    return true;
  }
  const committed = professorBrewCommittedCardCountV47(session);
  return (
    committed >= COMMANDER_DECK_TOTAL_CARDS_V47 &&
    session.councilState?.buildPhase === "DRAFT_READY" &&
    Boolean(session.deckGrade) &&
    Boolean(session.finalDeckDoctor?.headProfessorCallCompleted)
  );
}

export function professorBrewNeedsStructuralResearchV4166(session: BrewSessionV42): boolean {
  if (session.fixtureCase) return false;
  return resolveProfessorBuildControlFromSessionV41661(session).shouldRunStructuralResearch;
}

export function professorBrewNeedsStructuralResearchV4165(session: BrewSessionV42): boolean {
  return professorBrewNeedsStructuralResearchV4166(session);
}

/** @deprecated use professorBrewNeedsStructuralResearchV4166 — preserves v4.16.4 slot-incomplete semantics for regression */
export function professorBrewNeedsStructuralResearchV4164(session: BrewSessionV42): boolean {
  if (session.fixtureCase) return false;
  const libraryCount = session.councilState?.selectedCards.length ?? 0;
  if (libraryCount >= COMMANDER_DECK_LIBRARY_SIZE_V47) return false;
  const slotBudget = assessDeckSlotBudgetV4163({
    manaPlan: session.councilState?.manaPlanV416 ?? null,
    selectedCards: session.councilState?.selectedCards ?? [],
  });
  return !slotBudget.structurallyComplete;
}

export function professorBrewShouldContinueAutoBuildV47(session: BrewSessionV42): boolean {
  if (session.fixtureCase) {
    return !session.autoBuildComplete && session.deckListRevealCount < session.deckList.length;
  }
  const next = resolveProfessorNextActionFromSessionV41662(session);
  return next.action === "ADVANCE_TREE" || next.action === "RUN_STRUCTURAL_RESEARCH";
}

export function professorBrewNeedsManaBaseV48(session: BrewSessionV42): boolean {
  if (session.fixtureCase) return false;
  return resolveProfessorBuildControlFromSessionV41661(session).shouldRunMana;
}

export function professorBrewNeedsDeckCompletionV416(session: BrewSessionV42): boolean {
  if (session.fixtureCase) return false;
  return resolveProfessorNextActionFromSessionV41662(session).action === "RUN_MANA_BASE";
}

export function professorBrewCanEnterFinalizationV416(session: BrewSessionV42): boolean {
  const readiness = session.councilState?.bracketReadinessV416;
  if (!readiness) return true;
  return readiness.canEnterFinalization;
}

export function professorBrewNeedsBracketResearchV416(session: BrewSessionV42): boolean {
  if (session.fixtureCase) return false;
  const libraryCount = session.councilState?.selectedCards.length ?? 0;
  if (libraryCount < COMMANDER_DECK_LIBRARY_SIZE_V47) return false;
  const readiness = session.councilState?.bracketReadinessV416;
  if (!readiness || readiness.canEnterFinalization) return false;
  if (readiness.carryForwardFlag === "BUILD_BRACKET_TARGET_UNRESOLVED") return false;
  const exhausted = (session.councilState as { bracketResearchExhaustedV4162?: boolean })?.bracketResearchExhaustedV4162;
  return !exhausted;
}

export function professorBrewNeedsFinalReviewV48(session: BrewSessionV42): boolean {
  if (session.fixtureCase) return false;
  if (session.finalReport?.status === "COMPLETE" || session.finalReport?.status === "RUNNING") return false;
  if (session.finalDeckDoctor?.status === "COMPLETE" || session.finalDeckDoctor?.status === "RUNNING") {
    return false;
  }
  const libraryCount = session.councilState?.selectedCards.length ?? 0;
  if (libraryCount < COMMANDER_DECK_LIBRARY_SIZE_V47) return false;
  if (professorBrewNeedsBracketResearchV416(session)) return false;
  return professorBrewCanEnterFinalizationV416(session);
}

/** Informational only — surfaces readiness message in UI. Finalization is gated by professorBrewNeedsFinalReviewV48. */
export function professorBrewBracketReadinessNoteV416(session: BrewSessionV42): string | null {
  const readiness = session.councilState?.bracketReadinessV416;
  if (!readiness || readiness.canEnterFinalization) return null;
  return readiness.message;
}

export function professorBrewIsFinalReviewRunningV48(session: BrewSessionV42): boolean {
  return session.finalDeckDoctor?.status === "RUNNING";
}

export { resolveProfessorBuildControlFromSessionV41661 } from "./professor-build-control-v4-16-6-1-v1";
export { resolveProfessorNextActionFromSessionV41662 } from "./professor-next-action-dispatch-v4-16-6-2-v1";
