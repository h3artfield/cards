/**
 * Commander dependence — how much the deck revolves around the commander.
 */
export const PROFESSOR_COMMANDER_STYLE_CHOICES_V1_1_1_VERSION = "professor-commander-style-choices-v1-1-1";

export type ProfessorCommanderStyleChoiceV111 = {
  id: string;
  label: string;
  description: string;
  userIntentPatch: string;
  legacyRelationshipId?: "dependent" | "harmony" | "independent";
  legacyLens?: "DEPENDENT_SYNERGY" | "HARMONY" | "INDEPENDENT_SYNERGY";
};

export const PROFESSOR_COMMANDER_STYLE_CHOICES_V111: ProfessorCommanderStyleChoiceV111[] = [
  {
    id: "commander-centric",
    label: "Build heavily around the commander",
    description: "Maximize commander-specific synergy and make the commander the central engine.",
    userIntentPatch:
      "Build heavily around the commander — maximize commander-specific synergy; the commander is the central engine",
    legacyRelationshipId: "dependent",
    legacyLens: "DEPENDENT_SYNERGY",
  },
  {
    id: "balanced-synergy",
    label: "Balanced commander synergy",
    description: "Strongly support the commander, but include independent engines and backup plans.",
    userIntentPatch:
      "Balanced commander synergy — strongly support the commander with independent engines and backup plans",
    legacyRelationshipId: "harmony",
    legacyLens: "HARMONY",
  },
  {
    id: "independent",
    label: "Strong even without the commander",
    description: "Use the commander as an advantage, but prioritize cards and engines that function independently.",
    userIntentPatch:
      "Strong even without the commander — prioritize engines and cards that function independently; commander enhances rather than holds the deck together",
    legacyRelationshipId: "independent",
    legacyLens: "INDEPENDENT_SYNERGY",
  },
];

export function resolveProfessorCommanderStyleV111(commanderStyleId: string): ProfessorCommanderStyleChoiceV111 | null {
  if (!commanderStyleId) return null;
  return PROFESSOR_COMMANDER_STYLE_CHOICES_V111.find((c) => c.id === commanderStyleId) ?? null;
}
