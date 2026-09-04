/**
 * Deck Swap Engine v1 — deterministic card substitution with a bracket preview.
 *
 * The engine never invents a card. It draws candidates from the precomputed
 * RC8 semantic neighbors, filters them against hard rules and store stock, and
 * reports what each swap would do to the deck's bracket before anything is
 * committed. An LLM can rank or explain the survivors, but it cannot widen the
 * set.
 */
import type { CommanderBracket } from "@/lib/commander-bracket-rubric/v1";
import type { SwapVerdict } from "./verdict";

export const DECK_SWAP_V1_VERSION = "deck-swap-v1";

/**
 * Where a candidate came from. Neighbors are functionally near but blind to
 * power; role-matched candidates are chosen for play rate and only guaranteed
 * to share a job.
 */
export type SwapCandidateSource = "semantic_neighbor" | "role_upgrade";

export type SwapCandidate = {
  oracleId: string;
  name: string;
  colorIdentity: string[];
  manaValue: number;
  typeLine: string;
  /** Primary card type, used to keep swaps structurally sane. */
  primaryType: string;
  isLand: boolean;
  derivedRoles: string[];
  source: SwapCandidateSource;
  /**
   * Cosine distance in the 117-d RC8 feature space, 0 being functionally
   * identical. Null for role-matched candidates: the feature vectors are not
   * persisted, so distance is only known for precomputed neighbor pairs.
   */
  semanticDistance: number | null;
};

export type SwapStock = {
  quantity: number;
  /** Lowest price across the store's copies, when one is listed. */
  priceUsd: number | null;
};

export type SwapConstraints = {
  commanderColorIdentity: string[];
  /** Reject swaps that would push the deck past this bracket. */
  maxBracket?: CommanderBracket | null;
  /** Only suggest cards the store can actually sell today. */
  requireInStock?: boolean;
  maxPriceUsd?: number | null;
};

export type SwapRejectionCode =
  | "OFF_COLOR"
  | "ALREADY_IN_DECK"
  | "SAME_CARD"
  | "OUT_OF_STOCK"
  | "OVER_BUDGET"
  | "TYPE_MISMATCH"
  | "RAISES_BRACKET"
  | "WEAKER_CARD";

export type RejectedSwap = {
  oracleId: string;
  name: string;
  code: SwapRejectionCode;
  detail: string;
};

export type SwapSuggestion = {
  out: { oracleId: string; name: string };
  in: { oracleId: string; name: string };
  source: SwapCandidateSource;
  semanticDistance: number | null;
  /** Derived roles the two cards have in common, i.e. the job being preserved. */
  sharedRoles: string[];
  bracketBefore: CommanderBracket;
  bracketAfter: CommanderBracket;
  stock: SwapStock | null;
  /** Tournament consensus reading, from eligibility-conditioned play rates. */
  verdict: SwapVerdict;
  playRateLift: number | null;
  incomingPlayRate: number | null;
  notes: string[];
};

/** What the caller is optimising for. */
export type SwapRankBy = "similarity" | "play_rate" | "price";

export type SwapSuggestionResult = {
  version: typeof DECK_SWAP_V1_VERSION;
  suggestions: SwapSuggestion[];
  /** Candidates that were considered and dropped, with the rule that dropped them. */
  rejected: RejectedSwap[];
};
