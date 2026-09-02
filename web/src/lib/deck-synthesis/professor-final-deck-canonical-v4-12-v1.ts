/**
 * Canonical final deck v4.12 — adjudication prep WITHOUT pre-cut rebalance; rebalance AFTER strategic swaps.
 */
import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import {
  type ProfessorCouncilStateV47,
} from "./professor-council-assembly-v4-7-v1";
import { COMMANDER_DECK_LIBRARY_SIZE_V47 } from "./professor-deck-completion-v4-7-v1";
import { appendManaBaseV48 } from "./professor-mana-base-v4-8-v1";
import { computeFinalDeckFingerprintV411 } from "./professor-deck-fingerprint-v4-11-v1";
import {
  MIN_COMMANDER_LAND_COUNT_V411,
  recomputeFinalDeckSnapshotV411,
  rebalanceManaBaseV411,
} from "./professor-final-deck-canonical-v4-11-v1";

export const PROFESSOR_FINAL_DECK_CANONICAL_V4_12_V1_VERSION = "professor-final-deck-canonical-v4-12-v1";

/** Prepare deck for Sol bracket adjudication — fill to 99 if needed, recompute snapshot, NO filler pre-cut. */
export function prepareDeckForBracketAdjudicationV412(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  commanderName: string;
}): {
  state: ProfessorCouncilStateV47;
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
  filledTo99: boolean;
} {
  let state = args.state;
  let filledTo99 = false;

  if (state.selectedCards.length < COMMANDER_DECK_LIBRARY_SIZE_V47) {
    state = appendManaBaseV48({
      state,
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      commanderName: args.commanderName,
    });
    filledTo99 = true;
  }

  state = recomputeFinalDeckSnapshotV411({ state, catalog: args.catalog });
  state = { ...state, buildPhase: "PROVISIONAL_100" };

  const fingerprint = computeFinalDeckFingerprintV411({ state, catalog: args.catalog });
  return { state, fingerprint, filledTo99 };
}

/** Rebalance mana base only AFTER strategic swaps — never before drag analysis. */
export function rebalanceManaBaseAfterSwapsV412(args: {
  state: ProfessorCouncilStateV47;
  catalog: DeckResolutionCatalog;
  colorIdentity: string[];
  commanderName: string;
}): {
  state: ProfessorCouncilStateV47;
  fingerprint: ReturnType<typeof computeFinalDeckFingerprintV411>;
  manaBaseAdjusted: boolean;
} {
  let state = args.state;
  let manaBaseAdjusted = false;
  const landCount = state.selectedCards.filter((c) => c.category === "land").length;

  if (landCount < MIN_COMMANDER_LAND_COUNT_V411) {
    state = rebalanceManaBaseV411({
      state,
      catalog: args.catalog,
      colorIdentity: args.colorIdentity,
      commanderName: args.commanderName,
    });
    manaBaseAdjusted = true;
  }

  state = recomputeFinalDeckSnapshotV411({ state, catalog: args.catalog });
  const fingerprint = computeFinalDeckFingerprintV411({ state, catalog: args.catalog });
  return { state, fingerprint, manaBaseAdjusted };
}
