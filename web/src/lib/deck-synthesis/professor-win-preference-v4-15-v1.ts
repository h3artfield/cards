/**
 * Win / combo preference v4.15 — informs B4 architecture synthesis.
 */
export const PROFESSOR_WIN_PREFERENCE_V4_15_V1_VERSION = "professor-win-preference-v4-15-v1";

export type WinPreferenceIdV415 =
  | "win-strongest"
  | "combos-fine"
  | "combat-board"
  | "surprise-me";

export type WinPreferenceChoiceV415 = {
  id: WinPreferenceIdV415;
  label: string;
  description: string;
  userIntentPatch: string;
  architectureGuidance: string;
};

export const WIN_PREFERENCE_CHOICES_V415: WinPreferenceChoiceV415[] = [
  {
    id: "win-strongest",
    label: "Win However Is Strongest",
    description: "Use the most decisive win architecture the bracket allows — combos, loops, or explosive finishes.",
    userIntentPatch: "Win however is strongest — WIN_STRONGEST",
    architectureGuidance:
      "Search for the most compact lethal line the bracket permits. Deterministic combos and near-loops are allowed when they fit policy.",
  },
  {
    id: "combos-fine",
    label: "Combos Are Fine, But Don't Center the Deck",
    description: "Include strong finishers and incidental combos, but the deck identity stays on the primary engine.",
    userIntentPatch: "Combos are fine but not the center — COMBOS_SECONDARY",
    architectureGuidance:
      "Primary engine remains the deck identity. Compact combo lines may exist as backup but should not consume core slots.",
  },
  {
    id: "combat-board",
    label: "Keep the Win Through Combat / Board",
    description: "Close through overwhelming board presence, combat, and premium finishers — not deterministic combos.",
    userIntentPatch: "Win through combat and board — COMBAT_BOARD",
    architectureGuidance:
      "Avoid deterministic infinite combos. Optimize threat window via acceleration, tutors, protection, and combat finishers.",
  },
  {
    id: "surprise-me",
    label: "Surprise Me",
    description: "Professors pick the most interesting win architecture that fits your bracket and commander.",
    userIntentPatch: "Surprise me with the win plan — SURPRISE_WIN",
    architectureGuidance: "Choose the win architecture that best expresses the commander and bracket within charter constraints.",
  },
];

export const DEFAULT_WIN_PREFERENCE_V415 = WIN_PREFERENCE_CHOICES_V415.find((c) => c.id === "combos-fine")!;

export function resolveWinPreferenceFromIntent(userIntent: string[]): WinPreferenceChoiceV415 {
  for (const choice of WIN_PREFERENCE_CHOICES_V415) {
    if (userIntent.some((i) => i.includes(choice.userIntentPatch) || i.includes(choice.label))) {
      return choice;
    }
  }
  if (userIntent.some((i) => /WIN_STRONGEST|strongest/i.test(i))) return WIN_PREFERENCE_CHOICES_V415[0]!;
  if (userIntent.some((i) => /COMBAT_BOARD|combat.*board/i.test(i))) return WIN_PREFERENCE_CHOICES_V415[2]!;
  if (userIntent.some((i) => /SURPRISE_WIN|surprise me/i.test(i))) return WIN_PREFERENCE_CHOICES_V415[3]!;
  return DEFAULT_WIN_PREFERENCE_V415;
}

export function winPreferenceLabel(id: WinPreferenceIdV415): string {
  return WIN_PREFERENCE_CHOICES_V415.find((c) => c.id === id)?.label ?? "Combos Are Fine, But Don't Center the Deck";
}
