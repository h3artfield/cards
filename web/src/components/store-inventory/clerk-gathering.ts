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
