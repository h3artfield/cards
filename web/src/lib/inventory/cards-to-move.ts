import type { InventoryItem } from "../types";

export type CardToMoveV1 = {
  id: string;
  name: string;
  setName: string;
  condition: string;
  quantity: number;
  market: number | null;
  from: string;
  to: string;
  since: string;
};

/**
 * Cards whose price now puts them in a different cabinet, binder or bulk.
 * One definition for the Cards to move panel and the shop assistant.
 */
export function listCardsToMove(items: InventoryItem[]): CardToMoveV1[] {
  return items
    .filter((i) => i.suggestedLocation && i.suggestedLocation !== i.shelfLocation)
    .map((i) => ({
      id: i.id,
      name: i.productName ?? i.displayName,
      setName: i.setName ?? "",
      condition: i.tcgplayerCondition ?? "",
      quantity: i.quantityInStore ?? i.quantity ?? 0,
      market: i.tcgMarketPrice ?? null,
      from: i.shelfLocation ?? "",
      to: i.suggestedLocation!,
      since: i.suggestedLocationAt ?? "",
    }))
    .sort((a, b) => a.to.localeCompare(b.to) || a.name.localeCompare(b.name));
}
