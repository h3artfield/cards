/**
 * Commander playstyle — how the game should feel while you're playing it.
 */
export const PROFESSOR_PLAYSTYLE_CHOICES_V1_1_1_VERSION = "professor-playstyle-choices-v1-1-1";

export type ProfessorPlaystyleChoiceV111 = {
  id: string;
  label: string;
  description: string;
  userIntentPatch: string;
};

export const DEFAULT_PROFESSOR_PLAYSTYLE_V111: ProfessorPlaystyleChoiceV111 = {
  id: "balanced-flexible",
  label: "Balanced / Flexible",
  description: "Strong all-around deck with synergy, interaction, resilience, and multiple paths.",
  userIntentPatch:
    "Balanced / Flexible — strong all-around deck with synergy, interaction, resilience, and multiple paths",
};

/** Non-default playstyles shown after the default option in the dropdown. */
export const PROFESSOR_PLAYSTYLE_CHOICES_V111: ProfessorPlaystyleChoiceV111[] = [
  {
    id: "aggressive-proactive",
    label: "Aggressive / Proactive",
    description: "Advance my own board quickly and pressure opponents.",
    userIntentPatch: "Aggressive / Proactive — advance my own board quickly and pressure opponents",
  },
  {
    id: "value-midrange",
    label: "Value / Midrange",
    description: "Accumulate efficient advantages and overpower the table over time.",
    userIntentPatch: "Value / Midrange — accumulate efficient advantages and overpower the table over time",
  },
  {
    id: "control-reactive",
    label: "Control / Reactive",
    description: "Answer threats, control pacing, then win from a stable position.",
    userIntentPatch: "Control / Reactive — answer threats, control pacing, then win from a stable position",
  },
  {
    id: "tempo-disruptive",
    label: "Tempo / Disruptive",
    description: "Advance my plan while efficiently disrupting opponents.",
    userIntentPatch: "Tempo / Disruptive — advance my plan while efficiently disrupting opponents",
  },
  {
    id: "engine-synergy",
    label: "Engine / Synergy-Focused",
    description: "Build interconnected engines where cards multiply each other's value.",
    userIntentPatch: "Engine / Synergy-Focused — interconnected engines where cards multiply each other's value",
  },
  {
    id: "toolbox-adaptive",
    label: "Toolbox / Adaptive",
    description: "Have answers and specialized tools for many situations.",
    userIntentPatch: "Toolbox / Adaptive — answers and specialized tools for many situations",
  },
  {
    id: "big-mana-battlecruiser",
    label: "Big Mana / Battlecruiser",
    description: "Generate huge mana and cast powerful threats and effects.",
    userIntentPatch: "Big Mana / Battlecruiser — generate huge mana and cast powerful threats and effects",
  },
  {
    id: "all-in-explosive",
    label: "All-In / Explosive",
    description: "Maximize explosive turns and ceiling even at the expense of resilience.",
    userIntentPatch: "All-In / Explosive — maximize explosive turns and ceiling even at the expense of resilience",
  },
  {
    id: "defensive-pillow-fort",
    label: "Defensive / Pillow-Fort",
    description: "Protect myself, discourage attacks, and win later.",
    userIntentPatch: "Defensive / Pillow-Fort — protect myself, discourage attacks, and win later",
  },
  {
    id: "political-diplomatic",
    label: "Political / Diplomatic",
    description: "Manipulate incentives, alliances, attacks, gifts, and table decisions.",
    userIntentPatch: "Political / Diplomatic — manipulate incentives, alliances, attacks, gifts, and table decisions",
  },
  {
    id: "stax-taxes",
    label: "Stax / Taxes",
    description: "Constrain opponents while developing an asymmetric advantage.",
    userIntentPatch: "Stax / Taxes — constrain opponents while developing an asymmetric advantage",
  },
  {
    id: "chaotic-variance",
    label: "Chaotic / High-Variance",
    description: "Unpredictable effects, randomness, unusual game states.",
    userIntentPatch: "Chaotic / High-Variance — unpredictable effects, randomness, unusual game states",
  },
];

export function resolveProfessorPlaystyleV111(playstyleId: string): ProfessorPlaystyleChoiceV111 {
  if (!playstyleId) return DEFAULT_PROFESSOR_PLAYSTYLE_V111;
  return PROFESSOR_PLAYSTYLE_CHOICES_V111.find((c) => c.id === playstyleId) ?? DEFAULT_PROFESSOR_PLAYSTYLE_V111;
}
