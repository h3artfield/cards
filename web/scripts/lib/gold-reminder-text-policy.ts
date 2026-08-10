/**
 * Strip mechanic/keyword reminder text before Layer 2 primitive derivation.
 * Reminder text has no independent game function — behavior comes from mechanic rules.
 */

/** Parenthetical Adventure reminder on spell side, e.g. "(Then exile this card. You may cast the creature later from exile.)" */
export const ADVENTURE_SPELL_REMINDER_PATTERN =
  /\(\s*Then exile this card\.\s*You may cast the creature later from exile\.\s*\)/gi;

/** Generic reminder parentheses at end of oracle line (conservative — only known patterns). */
const REMINDER_PATTERNS: RegExp[] = [
  ADVENTURE_SPELL_REMINDER_PATTERN,
  /\(\s*Then exile it\.\s*You may cast the creature later from exile\.\s*\)/gi,
];

export function stripMechanicReminderText(corpus: string): string {
  let out = corpus;
  for (const pattern of REMINDER_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, pattern.flags));
  }
  return out.trim();
}

export function isAdventureCastReminderSpan(evidence: string): boolean {
  return /\bYou may cast the creature later from exile\b/i.test(evidence);
}

export function isReminderTextOnlyPrimitive(evidence: string): boolean {
  return isAdventureCastReminderSpan(evidence);
}

export interface ExpectedMechanicContext {
  mechanic: "adventure" | "split" | "modal_dfc" | "saga" | "room" | "aftermath" | "ninjutsu" | string;
  componentType?: "adventure" | "creature" | "spell" | "land" | string;
  /** Structural execution context — reminder/mechanic definitions are not card-native Layer-2. */
  executionContext?: "mechanic_definition" | "reminder" | string;
  cardNativeLayer2Eligible?: boolean;
  /** Rules/mechanics layer — not Layer 2 parser output. */
  derivedMechanicBehaviors?: {
    adventureResolutionDestination?: "exile";
    laterCastPermissionFromExile?: boolean;
    activatedCostIncludes?: string[];
    resolutionZoneTransition?: {
      movementVerb: "put" | "return" | string;
      sourceZone: string;
      destinationZone: string;
      stateModifiers?: string[];
    };
  };
  /** Evidence spans excluded from Layer 2 primitive gold (reminder text). */
  excludedReminderSpans?: string[];
}
