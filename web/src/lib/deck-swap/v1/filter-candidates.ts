/**
 * Pure candidate filtering. Everything here is a hard rule that can be checked
 * without a model, so the surviving set is already legal and buyable before any
 * ranking happens.
 */
import { commanderLegalInIdentity } from "@/lib/semantic-visualization/filters-v1";
import type { BracketRubricCard } from "@/lib/commander-bracket-rubric/v1";
import type {
  RejectedSwap,
  SwapCandidate,
  SwapConstraints,
  SwapStock,
} from "./types";

export type FilteredCandidates = {
  kept: SwapCandidate[];
  rejected: RejectedSwap[];
};

export function filterSwapCandidates(args: {
  /** The card being replaced. */
  outgoingOracleId: string;
  /** Trading a land for a spell silently breaks the mana base, so it is barred. */
  outgoingIsLand?: boolean;
  deck: BracketRubricCard[];
  candidates: SwapCandidate[];
  constraints: SwapConstraints;
  stockByOracleId?: ReadonlyMap<string, SwapStock>;
}): FilteredCandidates {
  const inDeck = new Set(args.deck.map((card) => card.oracleId));
  const kept: SwapCandidate[] = [];
  const rejected: RejectedSwap[] = [];

  for (const candidate of args.candidates) {
    const reject = (code: RejectedSwap["code"], detail: string) => {
      rejected.push({ oracleId: candidate.oracleId, name: candidate.name, code, detail });
    };

    if (candidate.oracleId === args.outgoingOracleId) {
      reject("SAME_CARD", "Candidate is the card being replaced.");
      continue;
    }
    if (inDeck.has(candidate.oracleId)) {
      reject("ALREADY_IN_DECK", "Commander is singleton; this card is already in the deck.");
      continue;
    }
    if (args.outgoingIsLand != null && candidate.isLand !== args.outgoingIsLand) {
      reject(
        "TYPE_MISMATCH",
        args.outgoingIsLand
          ? "Replacing a land with a spell would shrink the mana base."
          : "Replacing a spell with a land would change the mana base.",
      );
      continue;
    }
    if (!commanderLegalInIdentity(candidate.colorIdentity, args.constraints.commanderColorIdentity)) {
      reject(
        "OFF_COLOR",
        `Color identity ${candidate.colorIdentity.join("") || "C"} is outside the commander's ${args.constraints.commanderColorIdentity.join("") || "C"}.`,
      );
      continue;
    }

    const stock = args.stockByOracleId?.get(candidate.oracleId) ?? null;
    if (args.constraints.requireInStock && (!stock || stock.quantity <= 0)) {
      reject("OUT_OF_STOCK", "Not currently on the shelf.");
      continue;
    }
    const budget = args.constraints.maxPriceUsd;
    if (budget != null && stock?.priceUsd != null && stock.priceUsd > budget) {
      reject("OVER_BUDGET", `${stock.priceUsd.toFixed(2)} exceeds the ${budget.toFixed(2)} limit.`);
      continue;
    }

    kept.push(candidate);
  }

  kept.sort(byClosest);
  return { kept, rejected };
}

/** Closest first, with unmeasured candidates last rather than treated as identical. */
function byClosest(a: SwapCandidate, b: SwapCandidate): number {
  const left = a.semanticDistance ?? Number.POSITIVE_INFINITY;
  const right = b.semanticDistance ?? Number.POSITIVE_INFINITY;
  return left - right || a.name.localeCompare(b.name);
}

/** Roles the replacement shares with the outgoing card, i.e. the job preserved. */
export function sharedRoles(outgoing: string[], incoming: string[]): string[] {
  const set = new Set(outgoing);
  return incoming.filter((role) => set.has(role)).sort();
}
