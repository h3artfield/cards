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
  count: number;
};

export type OwnershipTag = "owned" | "shop" | "unavailable";

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

export function emptyOwnedCardIndex(): OwnedCardIndex {
  return {
    scryfallIds: new Set(),
    oracleIds: new Set(),
    names: new Set(),
    count: 0,
  };
}

/** Only cards still in the binder count — anything traded in is gone. */
export function buildOwnedCardIndex(
  cards: Array<Pick<CollectionCard, "scryfallId" | "oracleId" | "displayName" | "status">>,
): OwnedCardIndex {
  const index = emptyOwnedCardIndex();

  for (const card of cards) {
    if (card.status !== "owned") continue;
    index.count += 1;
    if (card.scryfallId) index.scryfallIds.add(card.scryfallId);
    if (card.oracleId) index.oracleIds.add(card.oracleId);
    const name = normalizeCardName(card.displayName);
    if (name) index.names.add(name);
  }

  return index;
}

export function isCardOwned(
  card: { scryfallId?: string; oracleId?: string; name?: string },
  index: OwnedCardIndex,
): boolean {
  if (index.count === 0) return false;
  if (card.scryfallId && index.scryfallIds.has(card.scryfallId)) return true;
  if (card.oracleId && index.oracleIds.has(card.oracleId)) return true;
  const name = normalizeCardName(card.name);
  return Boolean(name) && index.names.has(name);
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
