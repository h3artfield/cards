/**
 * Orchestrates a swap suggestion: similar cards, hard-rule filtering, store
 * stock, and a deterministic before/after bracket for every surviving option.
 */
import { classifyCommanderBracketV1 } from "@/lib/commander-bracket-rubric/v1";
import { comboSummaryForDeck } from "@/lib/commander-bracket-rubric/v1/combos-server";
import { getInventoryOverlayMap } from "@/lib/semantic-visualization/semantic-map-service";
import { loadRc8OracleTextIndex } from "@/lib/card-oracle-text/rc8-oracle-text-index";
import type { BracketRubricCard, CommanderBracket } from "@/lib/commander-bracket-rubric/v1";
import { filterSwapCandidates, sharedRoles } from "./filter-candidates";
import { findSimilarCards, rolesForOracleId } from "./similar-cards-server";
import { findUpgradeCandidates, isLandType } from "./upgrade-candidates-server";
import { getSemanticMapPoint } from "@/lib/semantic-visualization/artifact-loader";
import { playRateFor } from "./play-rate-server";
import { describeVerdict, swapVerdict } from "./verdict";
import {
  DECK_SWAP_V1_VERSION,
  type RejectedSwap,
  type SwapCandidate,
  type SwapConstraints,
  type SwapRankBy,
  type SwapStock,
  type SwapSuggestion,
  type SwapSuggestionResult,
} from "./types";

/** Cheapest listed copy the store holds, preferring an explicit list price. */
function cheapestPrice(items: Array<{ listPrice?: number | null; tcgLowPrice?: number | null }>): number | null {
  const prices = items
    .map((item) => item.listPrice ?? item.tcgLowPrice ?? null)
    .filter((price): price is number => typeof price === "number" && price > 0);
  return prices.length ? Math.min(...prices) : null;
}

function rankCandidates(
  candidates: SwapCandidate[],
  rankBy: SwapRankBy,
  stock?: ReadonlyMap<string, SwapStock>,
): SwapCandidate[] {
  const ordered = [...candidates];
  if (rankBy === "similarity") {
    return ordered.sort(
      (a, b) =>
        (a.semanticDistance ?? Number.POSITIVE_INFINITY) -
        (b.semanticDistance ?? Number.POSITIVE_INFINITY),
    );
  }
  if (rankBy === "price") {
    // Unpriced cards sort last: we cannot promise they are cheap.
    const priceOf = (c: SwapCandidate) =>
      stock?.get(c.oracleId)?.priceUsd ?? Number.POSITIVE_INFINITY;
    return ordered.sort((a, b) => priceOf(a) - priceOf(b));
  }
  return ordered.sort(
    (a, b) => (playRateFor(b.oracleId)?.rate ?? 0) - (playRateFor(a.oracleId)?.rate ?? 0),
  );
}

export async function loadStoreStockIndex(args: {
  storeId: string;
  storeSlug: string;
}): Promise<Map<string, SwapStock>> {
  const overlay = await getInventoryOverlayMap(args.storeId, args.storeSlug);
  const stock = new Map<string, SwapStock>();
  for (const [oracleId, entry] of overlay) {
    stock.set(oracleId, { quantity: entry.totalQty, priceUsd: cheapestPrice(entry.items) });
  }
  return stock;
}

export async function suggestSwapsForCard(args: {
  deck: BracketRubricCard[];
  outgoingOracleId: string;
  gameChangerOracleIds: ReadonlySet<string>;
  constraints: SwapConstraints;
  stockByOracleId?: ReadonlyMap<string, SwapStock>;
  candidateLimit?: number;
  suggestionLimit?: number;
  /** Defaults to play rate, which is what "make this deck better" means. */
  rankBy?: SwapRankBy;
  /** Defaults to false for play-rate ranking, true for budget and similarity. */
  includeDowngrades?: boolean;
}): Promise<SwapSuggestionResult> {
  const outgoing = args.deck.find((card) => card.oracleId === args.outgoingOracleId);
  if (!outgoing) {
    throw new Error(`Card ${args.outgoingOracleId} is not in the supplied deck.`);
  }

  const baselineCombos = await comboSummaryForDeck({ cards: args.deck });
  const baseline = classifyCommanderBracketV1({
    cards: args.deck,
    gameChangerOracleIds: args.gameChangerOracleIds,
    combos: baselineCombos,
  });

  const limit = args.candidateLimit ?? 20;
  const neighbors = await findSimilarCards({ oracleId: args.outgoingOracleId, limit });
  // Neighbors are functionally close but power-blind, so upgrades have to come
  // from a source that reads tournament consensus instead of card text.
  const upgrades =
    args.rankBy === "similarity"
      ? []
      : findUpgradeCandidates({
          oracleId: args.outgoingOracleId,
          commanderColorIdentity: args.constraints.commanderColorIdentity,
          limit,
        });

  const merged = new Map<string, SwapCandidate>();
  for (const candidate of [...neighbors, ...upgrades]) {
    if (!merged.has(candidate.oracleId)) merged.set(candidate.oracleId, candidate);
  }
  const candidates = [...merged.values()];

  const outgoingPoint = getSemanticMapPoint(args.outgoingOracleId);
  const { kept, rejected } = filterSwapCandidates({
    outgoingOracleId: args.outgoingOracleId,
    outgoingIsLand: outgoingPoint ? isLandType(outgoingPoint.types) : undefined,
    deck: args.deck,
    candidates,
    constraints: args.constraints,
    stockByOracleId: args.stockByOracleId,
  });

  const outgoingRoles = rolesForOracleId(args.outgoingOracleId);
  const outgoingRate = playRateFor(args.outgoingOracleId)?.rate ?? null;
  const oracleText = await loadRc8OracleTextIndex();
  const remainder = args.deck.filter((card) => card.oracleId !== args.outgoingOracleId);
  const suggestions: SwapSuggestion[] = [];
  const bracketRejections: RejectedSwap[] = [];

  // Bracket scoring is the expensive step, so order candidates before it and
  // stop once enough have survived.
  const ordered = rankCandidates(kept, args.rankBy ?? "play_rate", args.stockByOracleId);

  for (const candidate of ordered) {
    const proposed: BracketRubricCard[] = [
      ...remainder,
      {
        oracleId: candidate.oracleId,
        name: candidate.name,
        typeLine: candidate.typeLine,
        // Without real text the rubric would miss a swapped-in Armageddon, so
        // the bracket preview would be wrong in exactly the case that matters.
        oracleText: oracleText.get(candidate.oracleId)?.oracleText ?? "",
        quantity: outgoing.quantity,
        isCommander: false,
      },
    ];

    const combos = await comboSummaryForDeck({ cards: proposed });
    const after = classifyCommanderBracketV1({
      cards: proposed,
      gameChangerOracleIds: args.gameChangerOracleIds,
      combos,
    });

    const ceiling = args.constraints.maxBracket ?? null;
    if (ceiling != null && after.assignedBracket > ceiling) {
      bracketRejections.push({
        oracleId: candidate.oracleId,
        name: candidate.name,
        code: "RAISES_BRACKET",
        detail: `Would move the deck to bracket ${after.assignedBracket}, past the ${ceiling} ceiling.`,
      });
      continue;
    }

    const incomingRate = playRateFor(candidate.oracleId)?.rate ?? null;
    const { verdict, lift } = swapVerdict({ outgoingRate, incomingRate });

    // When the ask is "make this better", offering cards nobody plays is worse
    // than returning nothing. Budget and similarity searches still want them.
    const includeDowngrades = args.includeDowngrades ?? (args.rankBy ?? "play_rate") !== "play_rate";
    if (!includeDowngrades && (verdict === "DOWNGRADE" || verdict === "UNKNOWN")) {
      bracketRejections.push({
        oracleId: candidate.oracleId,
        name: candidate.name,
        code: "WEAKER_CARD",
        detail:
          verdict === "UNKNOWN"
            ? "No tournament play data, so an improvement cannot be claimed."
            : "Played less often than the card it would replace.",
      });
      continue;
    }

    const notes: string[] = [describeVerdict({ verdict, lift, incomingRate })];
    if (after.assignedBracket !== baseline.assignedBracket) {
      notes.push(
        `Moves the deck from bracket ${baseline.assignedBracket} to ${after.assignedBracket}.`,
      );
    }
    if (candidate.source === "role_upgrade") {
      notes.push("Shares a role with the outgoing card rather than its exact text.");
    }

    suggestions.push({
      out: { oracleId: outgoing.oracleId, name: outgoing.name },
      in: { oracleId: candidate.oracleId, name: candidate.name },
      source: candidate.source,
      semanticDistance: candidate.semanticDistance,
      sharedRoles: sharedRoles(outgoingRoles, candidate.derivedRoles),
      bracketBefore: baseline.assignedBracket as CommanderBracket,
      bracketAfter: after.assignedBracket,
      stock: args.stockByOracleId?.get(candidate.oracleId) ?? null,
      verdict,
      playRateLift: lift,
      incomingPlayRate: incomingRate,
      notes,
    });

    if (suggestions.length >= (args.suggestionLimit ?? 10)) break;
  }

  return {
    version: DECK_SWAP_V1_VERSION,
    suggestions,
    rejected: [...rejected, ...bracketRejections],
  };
}
