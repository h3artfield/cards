import { inventoryItemMatchesSearch } from "../inventory/search";
import { inventoryEffectiveQuantity } from "../inventory/status";
import { inventoryImageProxyPath } from "../inventory/resolve-display-image";
import { isFirebaseStorageUrl } from "../inventory/image-url";
import { matchesInventoryBrowseGame } from "../inventory/inventory-browse-game-v1";
import type { InventoryItem } from "../types";
import { inventoryItemIsSoleCommanderCandidate } from "./commander-pool-eligibility";
import { getCachedStoreInventory } from "./store-inventory-cache";
import type {
  StoreInventoryCard,
  StoreInventoryGameFilter,
} from "./store-inventory-browse";

function itemDisplayName(item: InventoryItem): string {
  return (
    item.productName ??
    item.displayName.split(" — ")[0]?.trim() ??
    item.displayName
  );
}

function suggestRank(name: string, q: string): number {
  const n = name.toLowerCase();
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  if (n.includes(q)) return 2;
  return 3;
}

export function suggestFromInventoryItems(
  items: InventoryItem[],
  input: {
    q: string;
    game?: StoreInventoryGameFilter;
    storeSlug: string;
    limit?: number;
  },
): StoreInventoryCard[] {
  const q = input.q.trim().toLowerCase();
  if (q.length < 2) return [];

  const game = input.game ?? "all";
  const limit = Math.min(12, Math.max(1, input.limit ?? 10));
  const seen = new Map<string, StoreInventoryCard>();

  for (const item of items) {
    if (!matchesInventoryBrowseGame(item, game)) continue;
    if (!inventoryItemMatchesSearch(item, q)) continue;

    const name = itemDisplayName(item);
    const key = name.toLowerCase();
    if (seen.has(key)) continue;

    const qty = inventoryEffectiveQuantity(item);
    if (qty <= 0) continue;

    const directImage = item.frontImageUrl?.trim();
    seen.set(key, {
      inventoryItemId: item.id,
      scryfallId: item.catalogScryfallId,
      name,
      imageUrl:
        directImage && isFirebaseStorageUrl(directImage) ? directImage : undefined,
      imageProxyUrl: inventoryImageProxyPath(input.storeSlug, item.id),
      qty,
      listPrice: item.listPrice,
      tcgLowPrice: item.tcgLowPrice,
      setName: item.setName,
      cardNumber: item.cardNumber,
      category: inferGame(item),
      colorIdentity: item.catalogColorIdentity ?? [],
      isCommander: inventoryItemIsSoleCommanderCandidate(item),
    });
  }

  return [...seen.values()]
    .sort((a, b) => {
      const rank = suggestRank(a.name, q) - suggestRank(b.name, q);
      if (rank !== 0) return rank;
      return a.name.localeCompare(b.name);
    })
    .slice(0, limit);
}

export async function suggestStoreInventory(input: {
  storeId: string;
  storeSlug: string;
  q: string;
  game?: StoreInventoryGameFilter;
  limit?: number;
}): Promise<{ suggestions: StoreInventoryCard[]; total: number }> {
  const items = await getCachedStoreInventory(input.storeId);
  const suggestions = suggestFromInventoryItems(items, input);
  return { suggestions, total: suggestions.length };
}
