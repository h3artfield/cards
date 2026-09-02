import type { DeckResolutionCatalog } from "../../../scripts/lib/load-deck-resolution-catalog";
import { normalizeOracleName } from "@/lib/deck-builder/golden-catalog/normalize-name";
import { normalizeDeckObjCardKey } from "./deck-obj-key-normalization-v1";
import type { NormalizedDeckInstance, ResolvedDeckCard } from "./types";

/** Sum of unresolved card quantities across mainboard entries. */
export type UnresolvedCardMetrics = {
  /** Sum of quantity fields on unresolved mainboard cards. */
  unresolvedCardQuantity: number;
  /** Distinct unresolved source names. */
  unresolvedUniqueNames: number;
  /** Count of unresolved mainboard line items (deck entries). */
  unresolvedDeckEntries: number;
  /** Distinct deckInstanceIds with at least one unresolved card. */
  decksAffected: number;
  /** Distinct pod seat references (deck instances appearing in pod participants). */
  podSeatsAffected: number;
  resolvedCardQuantity: number;
  totalCardQuantity: number;
  resolvedPct: { count: number; denominator: number; pct: number };
  topUnresolvedNames: Array<{ name: string; quantity: number }>;
};

export function recomputeDeckCardResolution(
  deck: NormalizedDeckInstance,
  catalog: DeckResolutionCatalog,
): ResolvedDeckCard[] {
  return deck.mainboard.map((entry) => {
    const { normalizedKey } = normalizeDeckObjCardKey(entry.sourceName);
    const lookup = resolveCatalogCardByName(normalizedKey, catalog);
    if (lookup.status === "resolved") {
      const card = lookup.card;
      const paper = catalog.paperByOracleId.get(card.oracleId);
      return {
        ...entry,
        normalizedName: normalizeOracleName(normalizedKey),
        oracleId: card.oracleId,
        canonicalOracleName: card.canonicalName,
        resolutionMethod: lookup.matchKind,
        rawCatalogIdentity: true,
        paperEligible: paper?.paperEligible ?? false,
        currentlyCommanderLegal: false,
        paperPopulationFrame: paper?.paperPopulationFrame ?? "UNKNOWN",
        resolutionStatus: "resolved" as const,
      };
    }
    if (entry.resolutionStatus === "resolved" && entry.oracleId) {
      return entry;
    }
    return { ...entry, resolutionStatus: "unresolved" as const };
  });
}

export function accumulateUnresolvedMetrics(input: {
  decks: NormalizedDeckInstance[];
  catalog: DeckResolutionCatalog;
  podSeatDeckIds?: Set<string>;
  useStoredResolution?: boolean;
}): UnresolvedCardMetrics {
  const nameQuantities = new Map<string, number>();
  const affectedDecks = new Set<string>();
  let unresolvedCardQuantity = 0;
  let unresolvedDeckEntries = 0;
  let resolvedCardQuantity = 0;
  let totalCardQuantity = 0;

  for (const deck of input.decks) {
    const mainboard = input.useStoredResolution
      ? deck.mainboard
      : recomputeDeckCardResolution(deck, input.catalog);

    for (const card of mainboard) {
      totalCardQuantity += card.quantity;
      if (card.resolutionStatus === "resolved") {
        resolvedCardQuantity += card.quantity;
        continue;
      }
      unresolvedCardQuantity += card.quantity;
      unresolvedDeckEntries += 1;
      affectedDecks.add(deck.deckInstanceId);
      nameQuantities.set(card.sourceName, (nameQuantities.get(card.sourceName) ?? 0) + card.quantity);
    }
  }

  let podSeatsAffected = 0;
  if (input.podSeatDeckIds) {
    for (const deckId of affectedDecks) {
      if (input.podSeatDeckIds.has(deckId)) podSeatsAffected += 1;
    }
  }

  return {
    unresolvedCardQuantity,
    unresolvedUniqueNames: nameQuantities.size,
    unresolvedDeckEntries,
    decksAffected: affectedDecks.size,
    podSeatsAffected,
    resolvedCardQuantity,
    totalCardQuantity,
    resolvedPct: {
      count: resolvedCardQuantity,
      denominator: totalCardQuantity,
      pct:
        totalCardQuantity > 0
          ? Number(((resolvedCardQuantity / totalCardQuantity) * 100).toFixed(2))
          : 0,
    },
    topUnresolvedNames: [...nameQuantities.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([name, quantity]) => ({ name, quantity })),
  };
}
