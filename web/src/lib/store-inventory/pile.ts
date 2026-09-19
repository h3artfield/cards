/**
 * Shop pile — cards the shopper might buy here. Not the binder.
 * Held in the browser the same way as the cart.
 */
export type PileCard = {
  inventoryItemId: string;
  name: string;
  scryfallId?: string;
  imageUrl?: string;
  imageProxyUrl?: string;
  qty: number;
  listPrice?: number;
  tcgLowPrice?: number;
  setName?: string;
  gameLabel?: string;
  colorIdentity: string[];
  isCommander?: boolean;
  typeLine?: string;
  isFoil?: boolean;
  finishLabel?: string;
  reason?: string;
};

export const PILE_STORAGE_PREFIX = "cs9k-pile:";

export function pileStorageKey(slug: string): string {
  return `${PILE_STORAGE_PREFIX}${slug}`;
}

export function addPileCard(cards: PileCard[], card: PileCard): PileCard[] {
  if (cards.some((c) => c.inventoryItemId === card.inventoryItemId)) {
    return cards;
  }
  return [...cards, card];
}

export function addManyPileCards(cards: PileCard[], incoming: PileCard[]): PileCard[] {
  const seen = new Set(cards.map((c) => c.inventoryItemId));
  const next = [...cards];
  for (const card of incoming) {
    if (!card.inventoryItemId || seen.has(card.inventoryItemId)) continue;
    seen.add(card.inventoryItemId);
    next.push(card);
  }
  return next;
}

export function removePileCard(cards: PileCard[], inventoryItemId: string): PileCard[] {
  return cards.filter((c) => c.inventoryItemId !== inventoryItemId);
}

export function togglePileCard(cards: PileCard[], card: PileCard): PileCard[] {
  if (cards.some((c) => c.inventoryItemId === card.inventoryItemId)) {
    return removePileCard(cards, card.inventoryItemId);
  }
  return addPileCard(cards, card);
}

function isPileCard(value: unknown): value is PileCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<PileCard>;
  return (
    typeof card.inventoryItemId === "string" &&
    card.inventoryItemId.length > 0 &&
    typeof card.name === "string" &&
    card.name.length > 0
  );
}

export function parseStoredPile(raw: string | null): PileCard[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPileCard).map((card) => ({
      ...card,
      qty: Number.isFinite(card.qty) ? card.qty : 1,
      colorIdentity: Array.isArray(card.colorIdentity) ? card.colorIdentity : [],
    }));
  } catch {
    return [];
  }
}

export function readPile(slug: string): PileCard[] {
  if (typeof window === "undefined") return [];
  try {
    return parseStoredPile(window.localStorage.getItem(pileStorageKey(slug)));
  } catch {
    return [];
  }
}

export function writePile(slug: string, cards: PileCard[]): void {
  if (typeof window === "undefined") return;
  try {
    if (!cards.length) {
      window.localStorage.removeItem(pileStorageKey(slug));
      return;
    }
    window.localStorage.setItem(pileStorageKey(slug), JSON.stringify(cards));
  } catch {
    /* private mode or full storage — the pile just won't persist */
  }
}
