import { fetchTcgplayerProductDetails } from "../card-flow-v2/tcgplayer-japan-catalog";
import { fetchTcgplayerLowestListingPrice } from "../card-flow-v2/market/tcgplayer-condition-lows";
import { deckBuilderStore } from "../deck-builder/deck-builder-store";
import {
  fetchScryfallCardById,
  fetchScryfallCardsByIds,
} from "../deck-builder/scryfall-catalog";
import { buildCardPriceHistoryResponse } from "../prices/price-history";
import { describePriceHistoryEmptyReason } from "../prices/price-identity-aliases";
import { priceWarehouseStore } from "../prices/price-warehouse-store";
import type { CollectionCard } from "../types";
import { collectionCardQuantity } from "./owned-index";
import {
  parseCollectionGame,
  type CollectionGame,
} from "./collection-game";
import {
  cardMatchesCollectionGame,
  isVerifiedBinderCard,
} from "./collection-binder";
import { fetchScryfallTcgMarketFallback } from "./collection-scryfall-tcg";
import {
  chooseTcgplayerUnitPrice,
  resolveTcgplayerProductIdBySearch,
} from "./collection-tcgplayer";
import {
  collectionCardFromPreview,
  resolveCollectionPriceLookup,
  type CollectionCardPricePayload,
  type CollectionCardTcgLow,
  type CollectionPriceCatalogHint,
  type CollectionPriceLookup,
  type CollectionPricePreviewInput,
  type CollectionValuePayload,
} from "./collection-price";

export type { CollectionCardPricePayload, CollectionCardTcgLow, CollectionValuePayload };

async function tcgLowForProduct(productId: string): Promise<CollectionCardTcgLow> {
  const [listing, details] = await Promise.all([
    fetchTcgplayerLowestListingPrice({
      productId,
      condition: "NM",
    }),
    fetchTcgplayerProductDetails(productId),
  ]);
  const productLow = details?.lowestPrice ?? details?.marketPrice;
  const price = chooseTcgplayerUnitPrice(listing, productLow ?? undefined);
  if (price != null) {
    return {
      price,
      fetchedAt: new Date().toISOString(),
      source:
        listing != null && listing > 0 && price === listing
          ? "tcgplayer_lowest_listing"
          : "tcgplayer_product",
      note: "Lowest Near Mint TCGPlayer listing today.",
    };
  }

  return {
    source: "unavailable",
    note: "No TCGPlayer listing price for this printing right now.",
  };
}

async function catalogHintForCard(
  card: CollectionCard,
): Promise<CollectionPriceCatalogHint | null> {
  if (!card.scryfallId) return null;
  const stored = await deckBuilderStore.getCatalogCard(card.scryfallId);
  if (stored) return stored;
  return fetchScryfallCardById(card.scryfallId);
}

function marketTcgLow(price: number): CollectionCardTcgLow {
  return {
    price,
    fetchedAt: new Date().toISOString(),
    source: "tcgplayer_market",
    note: "TCGPlayer market for this card. This printing has no listings yet.",
  };
}

async function tcgLowForCard(
  card: CollectionCard,
  productId?: string,
  oracleId?: string,
): Promise<CollectionCardTcgLow> {
  if (productId) {
    const live = await tcgLowForProduct(productId);
    if (live.price != null) return live;
  }

  const fallback = await fetchScryfallTcgMarketFallback({
    name: card.displayName,
    oracleId: oracleId ?? card.oracleId,
  });
  if (fallback) return marketTcgLow(fallback.price);

  return {
    source: "unavailable",
    note: "Could not find this card on TCGPlayer yet.",
  };
}

export type { CollectionPricePreviewInput };

export async function loadCollectionPricePreview(
  input: CollectionPricePreviewInput,
): Promise<Pick<CollectionCardPricePayload, "cardName" | "tcgLow">> {
  const priced = await loadCollectionCardPrice(collectionCardFromPreview(input));
  return { cardName: priced.cardName, tcgLow: priced.tcgLow };
}

export async function loadCollectionCardPrice(
  card: CollectionCard,
): Promise<CollectionCardPricePayload> {
  const catalog = await catalogHintForCard(card);
  const lookup = resolveCollectionPriceLookup(card, catalog);
  const tcgplayerProductId =
    lookup.tcgplayerProductId ??
    (await resolveTcgplayerProductIdBySearch(card));

  if (!lookup.identityKey && lookup.lookupKeys.length === 0) {
    return {
      cardName: lookup.cardName,
      history: {
        identityKey: "",
        requestedIdentityKey: undefined,
        lookupKeys: [],
        matchedKeys: [],
        emptyReason: "no_identity",
        cardName: lookup.cardName,
        series: [],
        trend: { sampleCount: 0 },
        sourceNote: "Lock a printing (set and number) to see daily price history.",
        reason: "no_identity",
      },
      tcgLow: await tcgLowForCard(
        card,
        tcgplayerProductId,
        card.oracleId ?? catalog?.oracleId,
      ),
    };
  }

  const snapshots = await priceWarehouseStore.listSnapshotsByIdentityKeys(
    lookup.lookupKeys,
  );
  const matchedKeys = [...new Set(snapshots.map((row) => row.identityKey))];
  const displayKey =
    lookup.identityKey ?? lookup.lookupKeys[0] ?? matchedKeys[0] ?? "";
  const emptyReason =
    snapshots.length === 0
      ? describePriceHistoryEmptyReason({
          requestedIdentityKey: lookup.identityKey,
          lookupKeys: lookup.lookupKeys,
          matchedKeys,
        })
      : undefined;

  const history = buildCardPriceHistoryResponse({
    identityKey: displayKey,
    requestedIdentityKey: lookup.identityKey ?? undefined,
    lookupKeys: lookup.lookupKeys,
    matchedKeys,
    emptyReason,
    cardName: lookup.cardName,
    snapshots,
  });

  const tcgLow = await tcgLowForCard(
    card,
    tcgplayerProductId,
    card.oracleId ?? catalog?.oracleId,
  );

  return { cardName: lookup.cardName, history, tcgLow };
}

async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await fn(items[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) || 0 }, () => worker()),
  );
  return out;
}

function searchKey(card: CollectionCard): string {
  return [
    card.displayName.trim().toLowerCase(),
    (card.setName ?? "").trim().toLowerCase(),
    (card.cardNumber ?? "").replace(/^#/, "").trim().toLowerCase(),
    card.category ?? "magic",
  ].join("|");
}

async function resolveBinderTcgplayerIds(
  rows: Array<{ card: CollectionCard; lookup: CollectionPriceLookup }>,
): Promise<Map<string, string>> {
  const byCardId = new Map<string, string>();

  for (const row of rows) {
    const id = row.lookup.tcgplayerProductId?.trim();
    if (id) byCardId.set(row.card.id, id);
  }

  const missingScryfallIds = [
    ...new Set(
      rows
        .filter((row) => !byCardId.has(row.card.id) && row.card.scryfallId)
        .map((row) => row.card.scryfallId!.trim()),
    ),
  ];
  if (missingScryfallIds.length) {
    const live = await fetchScryfallCardsByIds(missingScryfallIds);
    const liveById = new Map(live.map((card) => [card.id, card]));
    for (const row of rows) {
      if (byCardId.has(row.card.id) || !row.card.scryfallId) continue;
      const tcg = liveById.get(row.card.scryfallId)?.tcgplayerId?.trim();
      if (tcg) byCardId.set(row.card.id, tcg);
    }
  }

  const missingCards = rows
    .map((row) => row.card)
    .filter((card) => !byCardId.has(card.id) && card.displayName.trim());
  if (!missingCards.length) return byCardId;

  const unique: CollectionCard[] = [];
  const seen = new Set<string>();
  for (const card of missingCards) {
    const key = searchKey(card);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(card);
  }

  const searched = await mapPool(unique, 4, resolveTcgplayerProductIdBySearch);
  const byKey = new Map<string, string>();
  unique.forEach((card, index) => {
    const id = searched[index];
    if (id) byKey.set(searchKey(card), id);
  });
  for (const card of missingCards) {
    const id = byKey.get(searchKey(card));
    if (id) byCardId.set(card.id, id);
  }

  return byCardId;
}

export async function loadCollectionValue(args: {
  cards: CollectionCard[];
  game?: CollectionGame;
}): Promise<CollectionValuePayload> {
  const game = parseCollectionGame(args.game);
  const cards = args.cards.filter(
    (card) => isVerifiedBinderCard(card) && cardMatchesCollectionGame(card, game),
  );

  const scryfallIds = [
    ...new Set(
      cards
        .map((card) => card.scryfallId?.trim())
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const catalogCards = scryfallIds.length
    ? await deckBuilderStore.getCatalogCards(scryfallIds)
    : [];
  const catalogById = new Map(catalogCards.map((card) => [card.id, card]));
  const missingCatalogIds = scryfallIds.filter((id) => !catalogById.has(id));
  if (missingCatalogIds.length) {
    const live = await fetchScryfallCardsByIds(missingCatalogIds);
    for (const card of live) catalogById.set(card.id, card);
  }

  const resolved = cards.map((card) => {
    const catalog = card.scryfallId
      ? catalogById.get(card.scryfallId)
      : undefined;
    return {
      card,
      qty: collectionCardQuantity(card),
      lookup: resolveCollectionPriceLookup(card, catalog),
    };
  });

  const tcgByCardId = await resolveBinderTcgplayerIds(resolved);
  const productIds = [...new Set(tcgByCardId.values())];
  const tcgByProduct = new Map<string, number>();
  if (productIds.length) {
    const prices = await mapPool(productIds, 6, tcgLowForProduct);
    productIds.forEach((id, index) => {
      const price = prices[index]?.price;
      if (price != null && price > 0) tcgByProduct.set(id, price);
    });
  }

  const unitByCardId = new Map<string, number>();
  for (const row of resolved) {
    const productId = tcgByCardId.get(row.card.id);
    const unit = productId ? tcgByProduct.get(productId) : undefined;
    if (unit != null) unitByCardId.set(row.card.id, unit);
  }

  const missing = resolved.filter((row) => !unitByCardId.has(row.card.id));
  if (missing.length) {
    const unique: CollectionCard[] = [];
    const seen = new Set<string>();
    for (const row of missing) {
      const key = `${row.card.oracleId ?? row.lookup.cardName}|${row.card.displayName}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(row.card);
    }
    const markets = await mapPool(unique, 4, (card) =>
      fetchScryfallTcgMarketFallback({
        name: card.displayName,
        oracleId:
          card.oracleId ??
          (card.scryfallId ? catalogById.get(card.scryfallId)?.oracleId : undefined),
      }),
    );
    const marketByKey = new Map<string, number>();
    unique.forEach((card, index) => {
      const price = markets[index]?.price;
      if (price != null) {
        marketByKey.set(
          `${card.oracleId ?? card.displayName}|${card.displayName}`.toLowerCase(),
          price,
        );
      }
    });
    for (const row of missing) {
      const price = marketByKey.get(
        `${row.card.oracleId ?? row.card.displayName}|${row.card.displayName}`.toLowerCase(),
      );
      if (price != null) unitByCardId.set(row.card.id, price);
    }
  }

  let tcgLowTotal = 0;
  let pricedCards = 0;
  for (const row of resolved) {
    const unit = unitByCardId.get(row.card.id);
    if (unit == null) continue;
    tcgLowTotal += unit * row.qty;
    pricedCards += 1;
  }

  return {
    tcgLowTotal: pricedCards > 0 ? tcgLowTotal : undefined,
    pricedCards,
    cardCount: cards.length,
  };
}
