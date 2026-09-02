/**
 * Product boundary after held-out TopDeck FAIL.
 *
 * Semantic Oracle remains usable in Professor / Clerk / Constructor.
 * Profiles v2 / K v3.0 / Pressure v4 are not validated as winner or matchup authority.
 *
 * Frozen labels:
 *   HELD_OUT_OUTCOME_BLIND_TOPDECK_VALIDATION_V1_FAIL
 *   YOUTUBE_MECHANISM_VALIDATION_V1_WEAK_INCONCLUSIVE
 *   FULL_EXTERNAL_STRATEGIC_VALIDATION_NOT_ESTABLISHED
 *   PROFILES_V2_K_V3_PRESSURE_V4_OUTCOME_PREDICTION_NOT_VALIDATED
 */
export const PROFESSOR_PREDICTIVE_LAYER_BOUNDARY_V1 = "professor-predictive-layer-boundary-v1";

export const PREDICTIVE_LAYER_NOT_AUTHORITATIVE = true;

/** Allowed: functional description. Forbidden: matchup/winner authority. */
export const PROFESSOR_PREDICTIVE_LAYER_PROMPT_CLAUSE = `
PREDICTIVE LAYER BOUNDARY — FROZEN

Semantic Oracle (what a card does, which functions it performs, how it can interact) is legitimate evidence for choosing and explaining the 99.

Do NOT treat Profiles v2, K v3.0, Pressure v4, or any derived matchup/RPS score as a reason to select, cut, or grade a card.

Allowed: "This card repeatedly exiles graveyards; this plan derives major value from graveyard recursion."
Forbidden: "Select this card because it improves matchup Pressure" or "Deck A is favored because K attacks Deck B."
Plausible mechanism is not winner prediction.
`.trim();
