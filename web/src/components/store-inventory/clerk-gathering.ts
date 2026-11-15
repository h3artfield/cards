import type { CartLine } from "@/lib/store-inventory/cart";
import type { InventoryGridCard } from "./InventoryBrowseUI";

export type GatheringCard = InventoryGridCard & {
  reason?: string;
};

export const CLERK_DRAG_MIME = "application/x-clerk-gathering-card";

export function clerkDragPayload(card: GatheringCard): string {
  return JSON.stringify({
    inventoryItemId: card.inventoryItemId,
    name: card.name,
    scryfallId: card.scryfallId,
    imageProxyUrl: card.imageProxyUrl,
    imageUrl: card.imageUrl,
    listPrice: card.listPrice,
    tcgLowPrice: card.tcgLowPrice,
    qty: card.qty,
    colorIdentity: card.colorIdentity,
    setName: card.setName,
    gameKey: card.gameKey,
    isCommander: card.isCommander,
    typeLine: card.typeLine,
    reason: card.reason,
  } satisfies GatheringCard);
}

export function readClerkDragPayload(
  dataTransfer: DataTransfer,
): GatheringCard | null {
  const raw = dataTransfer.getData(CLERK_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as GatheringCard;
    if (!parsed.inventoryItemId || !parsed.name) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function cardDisplayImage(card: {
  imageProxyUrl?: string;
  imageUrl?: string;
}): string | undefined {
  return card.imageUrl ?? card.imageProxyUrl;
}

/** Shelf price shown in clerk UI — always "My Store Price" (listPrice), never market/low. */
export function cardDisplayPrice(card: {
  listPrice?: number;
}): number | undefined {
  return card.listPrice;
}

/** All printings are not on the shelf. A tap must not put them in the cart. */
export function cardIsForSale(card: {
  inventoryItemId: string;
  qty: number;
}): boolean {
  if (card.inventoryItemId.startsWith("catalog:")) return false;
  return card.qty > 0;
}

export function gatheringCardToCartLine(
  card: GatheringCard,
): Omit<CartLine, "quantity"> | null {
  if (!cardIsForSale(card)) return null;
  return {
    inventoryItemId: card.inventoryItemId,
    name: card.name,
    setName: card.setName,
    imageUrl: cardDisplayImage(card),
    unitPrice: cardDisplayPrice(card) ?? 0,
    maxQuantity: card.qty,
    onlineQty: card.onlineQty,
    gameKey: card.gameKey,
    typeLine: card.typeLine,
    isCommander: card.isCommander,
    colorIdentity: card.colorIdentity,
  };
}
