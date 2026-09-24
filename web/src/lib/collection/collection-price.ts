import { buildIdentityKey } from "../prices/identity-key";
import { resolvePriceHistoryLookupKeys } from "../prices/price-identity-aliases";
import type {
  CardPriceHistoryResponse,
  CardPriceSnapshotCategory,
} from "../prices/types";
import type { CollectionCard } from "../types";
import { parseCollectionFinish } from "./collection-finish";

export type CollectionCardTcgLow = {
  price?: number;
  fetchedAt?: string;
  source:
    | "tcgplayer_lowest_listing"
    | "tcgplayer_product"
    | "tcgplayer_market"
    | "unavailable";
  note: string;
};

export type CollectionCardPricePayload = {
  cardName: string;
  history: CardPriceHistoryResponse;
  tcgLow: CollectionCardTcgLow;
};

export type CollectionValuePoint = {
  date: string;
  value: number;
};

export type CollectionValuePayload = {
  tcgLowTotal?: number;
  pricedCards: number;
  cardCount: number;
};

export type CollectionPriceCatalogHint = {
  set?: string;
  collectorNumber?: string;
  tcgplayerId?: string;
  name?: string;
  oracleId?: string;
};

export type CollectionPriceLookup = {
  category: CardPriceSnapshotCategory;
  setCode?: string;
  setName?: string;
  collectorNumber?: string;
  identityKey: string | null;
  lookupKeys: string[];
  tcgplayerProductId?: string;
  cardName: string;
};

export type CollectionPricePreviewInput = {
  category?: CollectionCard["category"];
  catalogSource?: CollectionCard["catalogSource"];
  catalogId?: string;
  displayName: string;
  setName?: string;
  cardNumber?: string;
  scryfallId?: string;
};

export function collectionCardFromPreview(
  input: CollectionPricePreviewInput,
): CollectionCard {
  const now = new Date().toISOString();
  const catalogId = input.catalogId?.trim() || undefined;
  const scryfallId =
    input.scryfallId?.trim() ||
    (input.catalogSource === "scryfall" ? catalogId : undefined);
  return {
    id: "preview",
    storeId: "preview",
    customerId: "preview",
    frontImageUrl: "",
    itemType: "raw",
    category: input.category,
    displayName: input.displayName.trim(),
    setName: input.setName,
    cardNumber: input.cardNumber,
    catalogSource: input.catalogSource,
    catalogId,
    scryfallId,
    status: "owned",
    createdAt: now,
    updatedAt: now,
  };
}

export function collectionPriceCategory(
  card: Pick<CollectionCard, "category">,
): CardPriceSnapshotCategory {
  const category = card.category ?? "magic";
  if (category === "magic") return "mtg";
  if (category === "pokemon") return "pokemon";
  if (category === "yugioh") return "yugioh";
  if (category === "sports") return "sports";
  return "unknown";
}

export function resolveCollectionPriceLookup(
  card: CollectionCard,
  catalog?: CollectionPriceCatalogHint | null,
): CollectionPriceLookup {
  const category = collectionPriceCategory(card);
  const setCode = catalog?.set?.trim() || undefined;
  const setName = card.setName?.trim() || undefined;
  const collectorNumber = (
    catalog?.collectorNumber ??
    card.cardNumber ??
    ""
  ).replace(/^#/, "").trim() || undefined;
  const cardName = catalog?.name?.trim() || card.displayName;
  const finish = parseCollectionFinish(card.finish);

  const identityKey = buildIdentityKey({
    category,
    setCode,
    setName,
    collectorNumber,
    finish,
    treatment: "normal",
    language: "en",
    cardName,
  });

  const lookupKeys = resolvePriceHistoryLookupKeys({
    identityKey,
    category,
    setCode,
    setName,
    collectorNumber,
    finish,
    treatment: "normal",
    language: "en",
  });

  return {
    category,
    setCode,
    setName,
    collectorNumber,
    identityKey,
    lookupKeys,
    tcgplayerProductId: catalog?.tcgplayerId?.trim() || undefined,
    cardName,
  };
}
