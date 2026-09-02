/**
 * Win preference choices for Professor Sol-directed GUI.
 */
export const PROFESSOR_WIN_PREFERENCE_CHOICES_V1_1_1_VERSION = "professor-win-preference-choices-v1-1-1";

export type ProfessorWinPreferenceChoiceV111 = {
  id: string;
  label: string;
  description: string;
  userIntentPatch: string;
  /** Legacy v4.15 brew API id when applicable */
  legacyChoiceId?: "win-strongest" | "combos-fine" | "combat-board" | "surprise-me";
};

export const PROFESSOR_WIN_PREFERENCE_CHOICES_V111: ProfessorWinPreferenceChoiceV111[] = [
  {
    id: "win-strongest",
    label: "Use the strongest win plan",
    description: "Power takes priority — use the best legal/bracket-appropriate win architecture, including combos if strongest.",
    userIntentPatch: "Use the strongest win plan — prioritize decisive win architecture allowed at this bracket",
    legacyChoiceId: "win-strongest",
  },
  {
    id: "combos-secondary",
    label: "Combos allowed, but don't center the deck on them",
    description: "Include strong finishers and incidental combos, but the deck identity stays on the primary engine.",
    userIntentPatch: "Combos allowed but not centered — primary engine remains deck identity",
    legacyChoiceId: "combos-fine",
  },
  {
    id: "combat-board",
    label: "Prefer combat / board-based wins",
    description: "Close through overwhelming board presence, combat, and premium finishers.",
    userIntentPatch: "Prefer combat and board-based wins — avoid deterministic infinite combos",
    legacyChoiceId: "combat-board",
  },
  {
    id: "prefer-combo",
    label: "Prefer combo wins",
    description: "Lean into compact combo lines and synergistic win assemblies when bracket-legal.",
    userIntentPatch: "Prefer combo wins — assemble synergistic combo lines when bracket-legal",
  },
  {
    id: "alternative-wins",
    label: "Prefer alternative / unusual win conditions",
    description: "Seek novel, alternate, or unusual win routes that fit the commander.",
    userIntentPatch: "Prefer alternative or unusual win conditions",
    legacyChoiceId: "surprise-me",
  },
  {
    id: "avoid-combos",
    label: "Avoid combos",
    description: "Do not build around deterministic infinite combos or compact combo loops.",
    userIntentPatch: "Avoid combos — no deterministic infinite combo center",
  },
];

export function resolveProfessorWinPreferenceV111(winPreferenceId: string): ProfessorWinPreferenceChoiceV111 | null {
  if (!winPreferenceId) return null;
  return PROFESSOR_WIN_PREFERENCE_CHOICES_V111.find((c) => c.id === winPreferenceId) ?? null;
}
