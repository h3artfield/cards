/**
 * Modal bullet option body normalization — each option is its own semantic span.
 */
import type { SegmentedAbility } from "./oracle-action-schema";

export interface ModalOptionBody {
  bodyText: string;
  /** Offset of bodyText within the original paragraphText. */
  bodyLocalStart: number;
}

/** Strip leading bullet marker; return option body text and its offset in the paragraph. */
export function normalizeModalOptionBody(paragraphText: string): ModalOptionBody {
  const trimmed = paragraphText.trimStart();
  const leadingWhitespace = paragraphText.length - trimmed.length;
  const bullet = trimmed.match(/^[•●]\s*/);
  if (!bullet) {
    return { bodyText: paragraphText, bodyLocalStart: 0 };
  }
  const bodyLocalStart = leadingWhitespace + bullet[0].length;
  return {
    bodyText: trimmed.slice(bullet[0].length),
    bodyLocalStart,
  };
}

export function isModalOptionAbility(ability: Pick<SegmentedAbility, "modalOptionId" | "paragraphText">): boolean {
  return !!ability.modalOptionId || /^[•●]\s/.test(ability.paragraphText.trim());
}

/** Follow-up reminder after a tutor — not a primary search_library action. */
export function isConditionalLibraryShuffleReminder(clauseText: string): boolean {
  return /^If (?:they|you) search (?:your |their )?library this way/i.test(clauseText.trim());
}

/** Spurious search_library evidence from conditional shuffle reminders. */
export function isSpuriousConditionalSearchEvidence(evidenceText: string): boolean {
  return /\bsearch (?:your |their )?library this way\b/i.test(evidenceText);
}

export const SEARCH_LIBRARY_VERB =
  /[Ss]earch(?:es|ed|ing)? (?:your |their )?(?:library(?: and\/or graveyard)?)/;

export const SEARCH_LIBRARY_AND_OR_GRAVEYARD_FOR =
  /\b[Ss]earch(?:es|ed|ing)? (?:your |their )?library and\/or graveyard for\b/i;

export const SEARCH_LIBRARY_FOR =
  /\b[Ss]earch(?:es|ed|ing)? (?:your |their )?library for\b/i;

export const TUTOR_THEN_SHUFFLE =
  /\b[Ss]earch(?:es|ed|ing)? (?:your |their )?library for\b[\s\S]*\bthen shuffle\b/i;

/** Imperative modal-option effect that precedes an optional "may" clause in the same bullet. */
export function isImperativeBeforeOptionalMayInModalOption(input: {
  paragraphText: string;
  evidenceLocalStart: number;
}): boolean {
  const mayIdx = input.paragraphText.search(
    /\b(?:Its controller|You|Target player|That player|An opponent) may\b/i,
  );
  return mayIdx < 0 || input.evidenceLocalStart < mayIdx;
}
