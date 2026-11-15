import type { CustomerDeckListEntryV1 } from "./deck-list-v1";

/** "Balanced / Flexible — long description…" → "Balanced / Flexible" */
export function professorPlaystyleShortLabelV1(
  playstyle: string | null | undefined,
): string | null {
  if (!playstyle?.trim()) return null;
  const dash = playstyle.indexOf(" — ");
  return (dash >= 0 ? playstyle.slice(0, dash) : playstyle).trim() || null;
}

/**
 * Commander name for Professor builds; a custom deck name when the owner renamed it.
 */
export function deckListPrimaryNameV1(args: {
  deckName: string;
  commanderName: string;
}): string {
  const { deckName, commanderName } = args;
  const professorPrefix = `${commanderName} — `;
  if (deckName === commanderName || deckName.startsWith(professorPrefix)) {
    return commanderName;
  }
  return deckName.trim() || commanderName;
}

function playstyleLabelForEntryV1(deck: CustomerDeckListEntryV1): string | null {
  if (deck.playstyleLabel) return deck.playstyleLabel;
  const prefix = `${deck.commanderName} — `;
  if (deck.deckName.startsWith(prefix)) {
    return professorPlaystyleShortLabelV1(deck.deckName.slice(prefix.length));
  }
  return null;
}

/** Compact label for event registration — bracket first in the mind, not buried in prose. */
export function eventDeckPickerLabelV1(deck: CustomerDeckListEntryV1): string {
  const name = deckListPrimaryNameV1(deck);
  const bracket = deck.registrationBracket ?? deck.measuredBracket;
  const playstyle = playstyleLabelForEntryV1(deck);

  const parts = [name];
  if (bracket != null) parts.push(`B${bracket}`);
  if (playstyle) parts.push(playstyle);
  return parts.join(" · ");
}
