import type { GoldenCatalogOracleCard } from "@/lib/deck-builder/golden-catalog/schemas";
import type { ShadowSemanticIndex } from "../shadow-semantic-index";
import type { NormalizedDeckInstance, ResolvedDeckCard } from "../types";
import { commanderConfigurationFromDeck } from "../commander-configuration-v1";
import type { DeckResolutionCatalog } from "../../../../scripts/lib/load-deck-resolution-catalog";
import type {
  DeckSemanticCensus,
  EligibleMainboardCard,
  SemanticCardBucket,
} from "./types";

function isBackgroundCard(card: GoldenCatalogOracleCard | undefined): boolean {
  if (!card) return false;
  return (card.types ?? []).includes("Background") || (card.subtypes ?? []).includes("Background");
}

export function classifyCommandZoneConfiguration(
  deck: NormalizedDeckInstance,
  catalog: DeckResolutionCatalog,
): { configurationType: string; commanderZoneCardCount: number } {
  const config = commanderConfigurationFromDeck(deck, catalog);
  const count = deck.commanderOracleIds.length;
  if (count <= 1) {
    return { configurationType: "single", commanderZoneCardCount: count };
  }
  if (count === 2) {
    const ids = deck.commanderOracleIds;
    const hasBackground = ids.some((id) => isBackgroundCard(catalog.byOracleId.get(id)));
    return {
      configurationType: hasBackground ? "choose_a_background" : "partner",
      commanderZoneCardCount: count,
    };
  }
  return { configurationType: "other", commanderZoneCardCount: count };
}

export function getEligibleMainboardCards(deck: NormalizedDeckInstance): {
  cards: EligibleMainboardCard[];
  commanderInMainboardBeforeExclusion: number;
} {
  const commanderSet = new Set(deck.commanderOracleIds);
  const cards: EligibleMainboardCard[] = [];
  let commanderInMainboardBeforeExclusion = 0;

  for (const card of deck.mainboard) {
    if (!card.oracleId || card.resolutionStatus !== "resolved") continue;
    if (!card.paperEligible) continue;
    if (commanderSet.has(card.oracleId)) {
      commanderInMainboardBeforeExclusion += card.quantity;
      continue;
    }
    cards.push({ oracleId: card.oracleId, quantity: card.quantity, card });
  }

  return { cards, commanderInMainboardBeforeExclusion };
}

export function classifySemanticBucket(input: {
  card: ResolvedDeckCard;
  shadowIndex: ShadowSemanticIndex;
}): SemanticCardBucket {
  if (!input.card.oracleId || input.card.resolutionStatus !== "resolved") return "unresolved";
  const shadow = input.shadowIndex.byOracleId.get(input.card.oracleId);
  if (!shadow) return "absent";
  if (shadow.structuralInvalid || !shadow.publishable) return "structurally_invalid";
  if (shadow.needsReviewActions.length > 0) return "needs_review";
  return "usable";
}

export function buildDeckSemanticCensus(input: {
  deck: NormalizedDeckInstance;
  catalog: DeckResolutionCatalog;
  shadowIndex: ShadowSemanticIndex;
}): DeckSemanticCensus {
  const { cards, commanderInMainboardBeforeExclusion } = getEligibleMainboardCards(input.deck);
  const commanderConfig = classifyCommandZoneConfiguration(input.deck, input.catalog);

  const bucketsByQuantity: Record<SemanticCardBucket, number> = {
    usable: 0,
    needs_review: 0,
    structurally_invalid: 0,
    absent: 0,
    unresolved: 0,
  };
  const seenOracle = new Map<string, SemanticCardBucket>();

  let eligibleQuantity = 0;
  for (const row of cards) {
    eligibleQuantity += row.quantity;
    const bucket = classifySemanticBucket({ card: row.card, shadowIndex: input.shadowIndex });
    bucketsByQuantity[bucket] += row.quantity;
    seenOracle.set(row.oracleId, bucket);
  }

  const bucketsByUniqueOracleId: Record<SemanticCardBucket, number> = {
    usable: 0,
    needs_review: 0,
    structurally_invalid: 0,
    absent: 0,
    unresolved: 0,
  };
  for (const bucket of seenOracle.values()) {
    bucketsByUniqueOracleId[bucket] += 1;
  }

  let aggregatableQuantity = 0;
  for (const row of cards) {
    const shadow = input.shadowIndex.byOracleId.get(row.oracleId);
    const catalogCard = input.catalog.byOracleId.get(row.oracleId);
    if (shadow && catalogCard) aggregatableQuantity += row.quantity;
  }

  let digitalOnly = 0;
  for (const row of cards) {
    if (row.card.paperPopulationFrame === "DIGITAL_ONLY") digitalOnly += row.quantity;
  }

  const semanticRepresented = aggregatableQuantity;
  const semanticMissing = Math.max(0, eligibleQuantity - aggregatableQuantity);

  return {
    deckHash: input.deck.deckHash,
    commanderOracleIds: input.deck.commanderOracleIds,
    commanderZoneCardCount: commanderConfig.commanderZoneCardCount,
    commanderConfigurationType: commanderConfig.configurationType,
    eligibleMainboardCardQuantity: eligibleQuantity,
    eligibleMainboardUniqueOracleIds: seenOracle.size,
    bucketsByQuantity,
    bucketsByUniqueOracleId,
    cardsRepresentedSemantically: semanticRepresented,
    cardsMissingSemantics: semanticMissing,
    semanticCoverageByQuantity:
      eligibleQuantity > 0 ? (bucketsByQuantity.usable + bucketsByQuantity.needs_review) / eligibleQuantity : 0,
    semanticCoverageByUniqueOracleId:
      seenOracle.size > 0
        ? (bucketsByUniqueOracleId.usable + bucketsByUniqueOracleId.needs_review) / seenOracle.size
        : 0,
    aggregatableCoverageByQuantity: eligibleQuantity > 0 ? aggregatableQuantity / eligibleQuantity : 0,
    digitalOnlyOracleIdsInFeatures: digitalOnly,
    commanderExclusionFailures: 0,
    commanderInMainboardBeforeExclusion,
  };
}
