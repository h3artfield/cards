import type { DeckCompetitiveAssessment } from "./types";

/** Design hooks only — official Wizards bracket criteria must be versioned when implemented. */
export const DECK_COMPETITIVE_ASSESSMENT_DESIGN_VERSION = "deck-competitive-assessment-v0-design";

export const COMMANDER_BRACKET_NAMES: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "Exhibition",
  2: "Core",
  3: "Upgraded",
  4: "Optimized",
  5: "cEDH",
};

export function createUnimplementedCompetitiveAssessment(): DeckCompetitiveAssessment {
  return {
    assessmentVersion: DECK_COMPETITIVE_ASSESSMENT_DESIGN_VERSION,
    status: "NOT_IMPLEMENTED",
  };
}

/** Reserved grade dimensions for future within-bracket scoring. */
export const WITHIN_BRACKET_GRADE_DIMENSIONS = [
  "strategy_coherence",
  "commander_synergy",
  "redundancy",
  "consistency",
  "mana_efficiency",
  "mana_stability",
  "interaction_coverage",
  "resilience",
  "recovery",
  "card_advantage",
  "tutor_selection_quality",
  "win_condition_quality",
  "speed",
  "vulnerability_concentration",
  "matchup_coverage",
  "internal_synergy_density",
  "dead_card_conflict_rate",
] as const;
