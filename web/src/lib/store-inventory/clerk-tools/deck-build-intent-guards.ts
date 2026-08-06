import type { DeckBuildIntentTranslation } from "./deck-build-intent-translator";

/** Customer asked for a particular card, theme, or set — not a generic "any commander" build. */
export function hasSpecificDeckBuildIntent(
  intent: DeckBuildIntentTranslation,
): boolean {
  if (intent.namedCommander?.trim()) return true;
  if (intent.featuredCard?.trim()) return true;
  if (intent.setOrProduct?.trim()) return true;
  if (intent.themeKeywords.length > 0) return true;
  return false;
}

export function primaryRequestedCardName(
  intent: DeckBuildIntentTranslation,
): string | undefined {
  return intent.namedCommander?.trim() || intent.featuredCard?.trim() || undefined;
}


export function offStockCommanderStrategyNote(commanderName: string): string {
  return `${commanderName} isn't in our inventory right now — building the list around it anyway and filling what we can from stock.`;
}

export function buildNoThematicMatchMessage(
  intent: DeckBuildIntentTranslation,
): string {
  const theme = [
    intent.featuredCard,
    intent.namedCommander,
    ...intent.themeKeywords,
    intent.setOrProduct,
  ]
    .filter(Boolean)
    .join(", ");
  const suggestions =
    intent.suggestedCommanders.length > 0
      ? ` Suggested commanders for this theme: ${intent.suggestedCommanders.slice(0, 4).join(", ")}.`
      : "";
  return `I couldn't figure out which commander you want for **${theme || intent.userGoal}**.${suggestions} Name the commander and I'll build the list — we fill from stock where we can, even if the commander isn't in stock yet.`;
}

/** Reject generic EDHREC picks (e.g. Animar) when they don't match the customer's intent. */
export function commanderPickFitsIntent(input: {
  commanderName: string;
  intent: DeckBuildIntentTranslation;
  themeScore: number;
}): boolean {
  if (!hasSpecificDeckBuildIntent(input.intent)) return true;
  if (input.themeScore > 0) return true;
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const pick = normalize(input.commanderName);
  const names = [
    input.intent.namedCommander,
    input.intent.featuredCard,
    ...input.intent.suggestedCommanders,
  ].filter(Boolean) as string[];
  return names.some((n) => {
    const nn = normalize(n);
    return pick.includes(nn) || nn.includes(pick);
  });
}
