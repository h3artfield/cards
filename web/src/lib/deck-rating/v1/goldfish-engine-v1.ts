/**
 * Shared goldfish engine contract for deck-rating.
 *
 * Phase A: one clock, one seed set, one meaning of "turn." The fixed plan pilot
 * in plan-checker-v1 is a mode of this engine, not a second simulator.
 *
 * Own-turn audit (2026-10): `oneTrial` advances `turn` once per pilot action
 * cycle with a single silent opponent for lethal checks only. Log lines like
 * `T11 win …` are the deck's own turns (1–PLAN_TURN_CAP), not multiplayer
 * game turns divided by seat count. Speed and named-line speed use that clock.
 */
import {
  PLAN_CHECKER_VERSION,
  PLAN_PILOT_VERSION,
  PLAN_SEED_COUNT,
  PLAN_SEED_SET,
  PLAN_SPEED_MIN_SUCCESSES,
  PLAN_TURN_CAP,
} from "./plan-schema-v1";

/** Narrow input so this module does not import plan-checker (avoids cycles). */
export type PlanConnectivityPartsV1 = {
  direct: number;
  access: number;
  enablers: number;
  redundancy: number;
  verifiedCombo: number | null;
  score: number;
  reason: string | null;
};

export const GOLDFISH_ENGINE_VERSION = "goldfish-engine-1.0.0" as const;

/** Last-three digits stay withheld until the threat-by-clock freeze is approved. */
export const CALCULATED_SCORE_DIGITS_PUBLISHED = false;

export const GOLDFISH_OWN_TURN_NOTES = [
  "Each goldfish turn is one turn for the scored deck (own turns).",
  "There is no seat rotation clock in checker 1.0.0; a silent opponent only defines lethal.",
  `Turn cap is ${PLAN_TURN_CAP} own turns.`,
  `Speed needs at least ${PLAN_SPEED_MIN_SUCCESSES} winning seeds among ${PLAN_SEED_COUNT}.`,
] as const;

export {
  PLAN_CHECKER_VERSION,
  PLAN_PILOT_VERSION,
  PLAN_SEED_COUNT,
  PLAN_SEED_SET,
  PLAN_SPEED_MIN_SUCCESSES,
  PLAN_TURN_CAP,
};

export type PlanCheckEvidenceV1 = {
  /** Named line can work with these cards (connectivity fail-closed). */
  planValid: boolean;
  /** Share of seeds where the named line reaches a rules win (any turn ≤ cap). */
  namedLineRate: number;
  /** Median own-turn among named-line wins; null when below the speed floor. */
  namedLineSpeed: number | null;
  /** Plan connectivity parts (UI: Plan check detail, not EDHREC Synergy). */
  connectivity: PlanConnectivityPartsV1;
};

export function formatWithheldScore(bracket: 1 | 2 | 3 | 4 | 5): string {
  return `${bracket}···`;
}

export function planCheckEvidenceFromParts(args: {
  connectivity: PlanConnectivityPartsV1;
  namedLineRate: number;
  namedLineSpeed: number | null;
}): PlanCheckEvidenceV1 {
  const invalid =
    args.connectivity.reason === "missing-required" ||
    args.connectivity.reason === "outlet-mismatch" ||
    args.connectivity.reason === "missing-outlet";
  return {
    planValid: !invalid && args.connectivity.direct >= 1,
    namedLineRate: args.namedLineRate,
    namedLineSpeed: args.namedLineSpeed,
    connectivity: args.connectivity,
  };
}

/** Compact Plan check label for the board (raw fields stay in detail). */
export function formatPlanCheckSummary(evidence: {
  planValid: boolean | null;
  namedLineRate: number | null;
  namedLineSpeed: number | null;
}): string {
  if (evidence.planValid === false) return "Invalid";
  if (evidence.namedLineRate == null) return "—";
  const rate = `${Math.round(evidence.namedLineRate * 100)}%`;
  if (evidence.namedLineSpeed == null) return rate;
  return `${rate} · T${evidence.namedLineSpeed}`;
}
