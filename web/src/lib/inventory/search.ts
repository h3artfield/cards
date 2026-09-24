import {
  isFirebaseStorageUrl,
  isTcgplayerCdnUrl,
} from "./image-url";
import { inventoryEffectiveQuantity, isInventoryListed } from "./status";
import type { InventoryItem } from "../types";
import {
  inventoryItemMatchesFinishFilter,
  parseInventoryFinishFilter,
  type InventoryFinishFilter,
} from "./inventory-finish-v1";

export type InventoryStockFilter = "all" | "in_stock" | "catalog";
export type InventoryListedFilter = "all" | "listed" | "unlisted";
export type { InventoryFinishFilter };

export interface InventoryBrowseQuery {
  q?: string;
  stock?: InventoryStockFilter;
  listed?: InventoryListedFilter;
  finish?: InventoryFinishFilter;
  page?: number;
  limit?: number;
  /** Raise cap for store browse (default 100 for admin UI). */
  maxLimit?: number;
}

export interface InventoryBrowseResult {
  items: InventoryItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export function inventoryItemMatchesSearch(
  item: InventoryItem,
  q: string,
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack = [
    item.displayName,
    item.setName,
    item.catalogSetCode,
    item.cardNumber,
    item.productName,
    item.title,
    item.productLine,
    item.tcgplayerProductId,
    item.tcgplayerCondition,
    item.rarity,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function matchesSearch(item: InventoryItem, q: string): boolean {
  return inventoryItemMatchesSearch(item, q);
}

function matchesStock(item: InventoryItem, stock: InventoryStockFilter): boolean {
  const qty = inventoryEffectiveQuantity(item);
  if (stock === "in_stock") return qty > 0;
  if (stock === "catalog") return qty <= 0 && item.status !== "sold";
  return item.status !== "sold";
}

function matchesListed(item: InventoryItem, listed: InventoryListedFilter): boolean {
  if (listed === "all") return true;
  const onChannel = isInventoryListed(item);
  return listed === "listed" ? onChannel : !onChannel;
}

export function browseInventoryItems(
  items: InventoryItem[],
  query: InventoryBrowseQuery,
): InventoryBrowseResult {
  const page = Math.max(1, query.page ?? 1);
  const cap = query.maxLimit ?? 100;
  const limit = Math.min(cap, Math.max(1, query.limit ?? 48));
  const stock = query.stock ?? "all";
  const listed = query.listed ?? "all";
  const finish = parseInventoryFinishFilter(query.finish);

  const filtered = items
    .filter((item) => matchesStock(item, stock))
    .filter((item) => matchesListed(item, listed))
    .filter((item) => matchesSearch(item, query.q ?? ""))
    .filter((item) => inventoryItemMatchesFinishFilter(item, finish));

  filtered.sort((a, b) => {
    const qtyDiff = inventoryEffectiveQuantity(b) - inventoryEffectiveQuantity(a);
    if (qtyDiff !== 0) return qtyDiff;
    return a.displayName.localeCompare(b.displayName);
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;

  return {
    items: filtered.slice(start, start + limit),
    total,
    page: safePage,
    limit,
    totalPages,
  };
}

export function countItemsNeedingImageCache(items: InventoryItem[]): number {
  return items.filter(
    (item) =>
      !item.imageCacheFailedAt &&
      item.frontImageUrl &&
      isTcgplayerCdnUrl(item.frontImageUrl) &&
      !isFirebaseStorageUrl(item.frontImageUrl),
  ).length;
}
