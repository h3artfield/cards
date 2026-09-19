import type { CollectionCard } from "../types";

/**
 * Lets the deck builder say "you already own this" instead of "buy this".
 * Printings differ between a binder scan and store stock, so a card matches
 * on oracle id or name as well as the exact Scryfall printing.
 */
export type OwnedCardIndex = {
  scryfallIds: Set<string>;
  oracleIds: Set<string>;
  names: Set<string>;
  qtyByOracleId: Map<string, number>;
  qtyByName: Map<string, number>;
  count: number;
};

export type OwnershipTag = "owned" | "shop" | "unavailable";

export type CopyOwnershipSplit = {
  owned: number;
  buyHere: number;
  needElsewhere: number;
};

export type OverlayTone = "owned" | "buy_here" | "need_elsewhere" | "mixed" | "none";

// Older printings spell cards like "Æther Vial"; NFKD leaves ligatures intact.
const LIGATURES: Array<[RegExp, string]> = [
  [/æ/g, "ae"],
  [/œ/g, "oe"],
  [/ø/g, "o"],
  [/ß/g, "ss"],
];

export function normalizeCardName(name: string | undefined): string {
  if (!name) return "";
  // Double-faced cards are stored under either face; match on the front.
  const front = name.split("//")[0] ?? name;
  let normalized = front
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  for (const [pattern, replacement] of LIGATURES) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/[^a-z0-9]+/g, " ").trim();
}

export function collectionCardQuantity(card: { quantity?: number }): number {
  const qty = Math.floor(card.quantity ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

export function emptyOwnedCardIndex(): OwnedCardIndex {
  return {
    scryfallIds: new Set(),
    oracleIds: new Set(),
    names: new Set(),
    qtyByOracleId: new Map(),
    qtyByName: new Map(),
    count: 0,
  };
}

function bump(map: Map<string, number>, key: string, qty: number) {
  map.set(key, (map.get(key) ?? 0) + qty);
}

/** Only cards still in the binder count — anything traded in is gone. */
export function buildOwnedCardIndex(
  cards: Array<
    Pick<
      CollectionCard,
      "scryfallId" | "oracleId" | "displayName" | "status" | "needsReview" | "quantity"
    >
  >,
): OwnedCardIndex {
  const index = emptyOwnedCardIndex();

  for (const card of cards) {
    if (card.status !== "owned") continue;
    // Import lines still waiting for a printing pick are not owned yet.
    if (card.needsReview) continue;
    const qty = collectionCardQuantity(card);
    index.count += qty;
    if (card.scryfallId) index.scryfallIds.add(card.scryfallId);
    if (card.oracleId) {
      index.oracleIds.add(card.oracleId);
      bump(index.qtyByOracleId, card.oracleId, qty);
    }
    const name = normalizeCardName(card.displayName);
    if (name) {
      index.names.add(name);
      bump(index.qtyByName, name, qty);
    }
  }

  return index;
}

export function ownedQuantityFor(
  card: { scryfallId?: string; oracleId?: string | null; name?: string },
  index: OwnedCardIndex,
): number {
  if (card.oracleId && index.qtyByOracleId.has(card.oracleId)) {
    return index.qtyByOracleId.get(card.oracleId)!;
  }
  const name = normalizeCardName(card.name);
  if (name && index.qtyByName.has(name)) return index.qtyByName.get(name)!;
  if (card.scryfallId && index.scryfallIds.has(card.scryfallId)) return 1;
  return 0;
}

export function isCardOwned(
  card: { scryfallId?: string; oracleId?: string; name?: string },
  index: OwnedCardIndex,
): boolean {
  return ownedQuantityFor(card, index) > 0;
}

/**
 * What the shopper should do about this card: nothing (already theirs), buy
 * it here, or source it elsewhere.
 */
export function cardOwnershipTag(
  card: { scryfallId?: string; oracleId?: string; name?: string; inStock?: boolean },
  index: OwnedCardIndex,
): OwnershipTag {
  if (isCardOwned(card, index)) return "owned";
  return card.inStock ? "shop" : "unavailable";
}

/**
 * Split a deck line across binder copies, then this shop's shelf.
 * Owned always wins: a binder Sol Ring covers the deck's Sol Ring.
 */
export function splitCopyOwnership(
  wanted: number,
  ownedQty: number,
  shopQty: number,
): CopyOwnershipSplit {
  const need = Number.isFinite(wanted) && wanted > 0 ? Math.floor(wanted) : 0;
  const owned = Math.min(need, Math.max(0, Math.floor(ownedQty) || 0));
  const remaining = need - owned;
  const buyHere = Math.min(remaining, Math.max(0, Math.floor(shopQty) || 0));
  return { owned, buyHere, needElsewhere: remaining - buyHere };
}

export function overlayTone(split: CopyOwnershipSplit): OverlayTone {
  const parts = [
    split.owned > 0,
    split.buyHere > 0,
    split.needElsewhere > 0,
  ].filter(Boolean).length;
  if (parts === 0) return "none";
  if (parts > 1) return "mixed";
  if (split.owned > 0) return "owned";
  if (split.buyHere > 0) return "buy_here";
  return "need_elsewhere";
}

export function tallyCopyOwnership(
  lines: Array<{ copies: number; split: CopyOwnershipSplit }>,
): CopyOwnershipSplit {
  return lines.reduce(
    (sum, line) => ({
      owned: sum.owned + line.split.owned,
      buyHere: sum.buyHere + line.split.buyHere,
      needElsewhere: sum.needElsewhere + line.split.needElsewhere,
    }),
    { owned: 0, buyHere: 0, needElsewhere: 0 },
  );
}
