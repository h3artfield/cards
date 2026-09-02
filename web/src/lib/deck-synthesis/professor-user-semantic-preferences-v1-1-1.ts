/**
 * Optional Advanced Card Preferences — soft semantic steering for Architect / retrieval.
 * Empty preferences mean Professor chooses the optimal functions.
 */
import type { SemanticOracleFactsV111 } from "./professor-semantic-oracle-facts-v1-1-1";

export const PROFESSOR_USER_SEMANTIC_PREFERENCES_V1_1_1_VERSION =
  "professor-user-semantic-preferences-v1-1-1";

export type SemanticPreferenceChoiceV111 = {
  id: string;
  label: string;
  actions?: string[];
  roles?: string[];
  zones?: string[];
  structures?: string[];
  typeLineIncludes?: string[];
  manaValueGte?: number;
};

export const PROFESSOR_SEMANTIC_PREFER_CHOICES_V111: SemanticPreferenceChoiceV111[] = [
  { id: "create_tokens", label: "Create Tokens", actions: ["create_token"], roles: ["token_generation"] },
  { id: "sacrifice", label: "Sacrifice", actions: ["sacrifice"], roles: ["sacrifice_outlet", "sacrifice_payoff"] },
  {
    id: "return_from_graveyard",
    label: "Return from Graveyard",
    actions: ["return_to_hand", "return_to_battlefield"],
    roles: ["recursion", "reanimation"],
    zones: ["graveyard"],
  },
  { id: "cast_from_exile", label: "Cast from Exile", roles: ["cast_from_exile"], zones: ["exile"] },
  { id: "triggered_abilities", label: "Triggered Abilities", structures: ["triggered"] },
  { id: "etb_effects", label: "ETB Effects", structures: ["triggered"] },
  { id: "activated_abilities", label: "Activated Abilities", structures: ["activated"] },
  { id: "card_draw", label: "Card Draw", actions: ["draw"], roles: ["card_draw", "card_advantage"] },
  { id: "untap", label: "Untap", actions: ["untap"] },
  { id: "counters", label: "Counters", actions: ["put_counter"], roles: ["counter_synergy"] },
];

export const PROFESSOR_SEMANTIC_AVOID_CHOICES_V111: SemanticPreferenceChoiceV111[] = [
  { id: "sacrifice", label: "Sacrifice", actions: ["sacrifice"], roles: ["sacrifice_outlet", "sacrifice_payoff"] },
  {
    id: "graveyard_dependence",
    label: "Graveyard dependence",
    roles: ["recursion", "reanimation", "graveyard_setup"],
    zones: ["graveyard"],
  },
  { id: "artifacts", label: "Artifacts", typeLineIncludes: ["artifact"] },
  { id: "exile", label: "Exile", actions: ["exile"], zones: ["exile"] },
  { id: "high_mana_value", label: "High mana value", manaValueGte: 6 },
  { id: "tap_abilities", label: "Tap abilities", actions: ["tap"] },
];

export type UserSemanticPreferencesV111 = {
  prefer: string[];
  avoid: string[];
};

export const EMPTY_USER_SEMANTIC_PREFERENCES_V111: UserSemanticPreferencesV111 = {
  prefer: [],
  avoid: [],
};

function normalizeId(id: string): string {
  return id.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function normalizeUserSemanticPreferencesV111(
  raw: unknown,
): UserSemanticPreferencesV111 {
  if (!raw || typeof raw !== "object") return { ...EMPTY_USER_SEMANTIC_PREFERENCES_V111 };
  const preferRaw = Array.isArray((raw as { prefer?: unknown }).prefer)
    ? ((raw as { prefer: unknown[] }).prefer)
    : [];
  const avoidRaw = Array.isArray((raw as { avoid?: unknown }).avoid)
    ? ((raw as { avoid: unknown[] }).avoid)
    : [];
  const preferAllowed = new Set(PROFESSOR_SEMANTIC_PREFER_CHOICES_V111.map((c) => c.id));
  const avoidAllowed = new Set(PROFESSOR_SEMANTIC_AVOID_CHOICES_V111.map((c) => c.id));
  return {
    prefer: [...new Set(preferRaw.filter((id): id is string => typeof id === "string").map(normalizeId))].filter(
      (id) => preferAllowed.has(id),
    ),
    avoid: [...new Set(avoidRaw.filter((id): id is string => typeof id === "string").map(normalizeId))].filter(
      (id) => avoidAllowed.has(id),
    ),
  };
}

export function isUserSemanticPreferencesNoneV111(
  prefs: UserSemanticPreferencesV111 | null | undefined,
): boolean {
  if (!prefs) return true;
  return prefs.prefer.length === 0 && prefs.avoid.length === 0;
}

export function userSemanticPreferencesForPromptV111(
  prefs: UserSemanticPreferencesV111 | null | undefined,
): "none" | UserSemanticPreferencesV111 {
  if (isUserSemanticPreferencesNoneV111(prefs)) return "none";
  return {
    prefer: prefs!.prefer,
    avoid: prefs!.avoid,
  };
}

function choiceById(
  id: string,
  catalog: readonly SemanticPreferenceChoiceV111[],
): SemanticPreferenceChoiceV111 | undefined {
  return catalog.find((choice) => choice.id === id);
}

function hasAny(haystack: readonly string[], needles: readonly string[] | undefined): boolean {
  if (!needles || needles.length === 0) return false;
  const set = new Set(haystack.map(normalizeId));
  return needles.some((needle) => set.has(normalizeId(needle)));
}

function cardMatchesPreferenceChoice(
  choice: SemanticPreferenceChoiceV111,
  facts: SemanticOracleFactsV111 | null,
  typeLine: string,
  manaValue: number | null,
): boolean {
  if (choice.manaValueGte != null && (manaValue ?? 0) >= choice.manaValueGte) return true;
  if (choice.typeLineIncludes?.some((token) => typeLine.toLowerCase().includes(token))) return true;
  if (!facts) return false;
  const actions = facts.semanticActions.length > 0 ? facts.semanticActions : facts.topActions;
  const roles = facts.semanticFunctions.length > 0 ? facts.semanticFunctions : facts.derivedRoles;
  const zones = facts.zoneInteractions.length > 0 ? facts.zoneInteractions : facts.zones;
  const structures = facts.abilityStructures.length > 0 ? facts.abilityStructures : facts.abilityTypes;
  return (
    hasAny(actions, choice.actions) ||
    hasAny(roles, choice.roles) ||
    hasAny(zones, choice.zones) ||
    hasAny(structures, choice.structures)
  );
}

/** Soft retrieval bias. Never a hard exclude unless a future caller treats it as such. */
export function scoreUserSemanticPreferencesV111(args: {
  facts: SemanticOracleFactsV111 | null;
  typeLine: string;
  manaValue: number | null;
  preferences: UserSemanticPreferencesV111 | null | undefined;
}): number {
  if (isUserSemanticPreferencesNoneV111(args.preferences)) return 0;
  let score = 0;
  for (const id of args.preferences!.prefer) {
    const choice = choiceById(id, PROFESSOR_SEMANTIC_PREFER_CHOICES_V111);
    if (choice && cardMatchesPreferenceChoice(choice, args.facts, args.typeLine, args.manaValue)) {
      score += 6;
    }
  }
  for (const id of args.preferences!.avoid) {
    const choice = choiceById(id, PROFESSOR_SEMANTIC_AVOID_CHOICES_V111);
    if (choice && cardMatchesPreferenceChoice(choice, args.facts, args.typeLine, args.manaValue)) {
      score -= 8;
    }
  }
  return score;
}
