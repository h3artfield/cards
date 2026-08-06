import type { InventoryItem } from "../types";
import {
  isEnrichableMagicSingle,
  isInventoryCatalogEnriched,
  isInventoryCatalogLinked,
  isInventoryCatalogUnresolved,
} from "../inventory/magic-items";

export type CatalogMatchQueueReason =
  | "unresolved"
  | "fuzzy_match"
  | "missing_printing_id"
  | "conflict"
  | "pending_enrichment";

export interface CatalogMatchQueueConflictPeer {
  inventoryItemId: string;
  displayName: string;
  catalogScryfallId?: string;
}

export interface CatalogMatchQueueRow {
  inventoryItemId: string;
  displayName: string;
  setName?: string;
  cardNumber?: string;
  tcgplayerProductId?: string;
  catalogScryfallId?: string;
  catalogOracleId?: string;
  catalogMatchMethod?: string;
  reason: CatalogMatchQueueReason;
  message: string;
  conflictPeers?: CatalogMatchQueueConflictPeer[];
}

export interface CatalogMatchQueueResult {
  rows: CatalogMatchQueueRow[];
  total: number;
  conflictGroups: number;
}

const QUEUE_REASON_RANK: Record<CatalogMatchQueueReason, number> = {
  conflict: 0,
  unresolved: 1,
  fuzzy_match: 2,
  missing_printing_id: 3,
  pending_enrichment: 4,
};

/** Same TCGplayer product mapped to more than one Scryfall printing within a store. */
export function detectTcgplayerScryfallConflicts(
  items: InventoryItem[],
): Map<string, Set<string>> {
  const byProduct = new Map<string, Set<string>>();

  for (const item of items) {
    if (!isEnrichableMagicSingle(item) || !isInventoryCatalogLinked(item)) continue;
    const productId = item.tcgplayerProductId?.trim();
    const scryfallId = item.catalogScryfallId?.trim();
    if (!productId || !scryfallId) continue;

    const ids = byProduct.get(productId) ?? new Set<string>();
    ids.add(scryfallId);
    byProduct.set(productId, ids);
  }

  const conflicts = new Map<string, Set<string>>();
  for (const [productId, scryfallIds] of byProduct) {
    if (scryfallIds.size > 1) conflicts.set(productId, scryfallIds);
  }
  return conflicts;
}

function conflictPeersForItem(
  item: InventoryItem,
  items: InventoryItem[],
  conflicts: Map<string, Set<string>>,
): CatalogMatchQueueConflictPeer[] | undefined {
  const productId = item.tcgplayerProductId?.trim();
  if (!productId || !conflicts.has(productId)) return undefined;

  return items
    .filter(
      (peer) =>
        peer.id !== item.id &&
        peer.tcgplayerProductId?.trim() === productId &&
        peer.catalogScryfallId?.trim(),
    )
    .map((peer) => ({
      inventoryItemId: peer.id,
      displayName: peer.displayName,
      catalogScryfallId: peer.catalogScryfallId,
    }));
}

function queueRowForItem(
  item: InventoryItem,
  items: InventoryItem[],
  conflicts: Map<string, Set<string>>,
): CatalogMatchQueueRow | null {
  const peers = conflictPeersForItem(item, items, conflicts);
  if (peers?.length) {
    const scryfallIds = [...(conflicts.get(item.tcgplayerProductId!.trim()) ?? [])];
    return {
      inventoryItemId: item.id,
      displayName: item.displayName,
      setName: item.setName,
      cardNumber: item.cardNumber,
      tcgplayerProductId: item.tcgplayerProductId,
      catalogScryfallId: item.catalogScryfallId,
      catalogOracleId: item.catalogOracleId,
      catalogMatchMethod: item.catalogMatchMethod,
      reason: "conflict",
      message: `TCGplayer ${item.tcgplayerProductId} maps to ${scryfallIds.length} different printings`,
      conflictPeers: peers,
    };
  }

  if (isInventoryCatalogUnresolved(item)) {
    return {
      inventoryItemId: item.id,
      displayName: item.displayName,
      setName: item.setName,
      cardNumber: item.cardNumber,
      tcgplayerProductId: item.tcgplayerProductId,
      catalogMatchMethod: "unresolved",
      reason: "unresolved",
      message: "Could not resolve to a Scryfall printing",
    };
  }

  if (item.catalogMatchMethod === "name_fuzzy" && isInventoryCatalogLinked(item)) {
    return {
      inventoryItemId: item.id,
      displayName: item.displayName,
      setName: item.setName,
      cardNumber: item.cardNumber,
      tcgplayerProductId: item.tcgplayerProductId,
      catalogScryfallId: item.catalogScryfallId,
      catalogOracleId: item.catalogOracleId,
      catalogMatchMethod: "name_fuzzy",
      reason: "fuzzy_match",
      message: "Linked by fuzzy name match — review recommended",
    };
  }

  if (
    isInventoryCatalogEnriched(item) &&
    !isInventoryCatalogLinked(item) &&
    item.catalogMatchMethod !== "skipped"
  ) {
    return {
      inventoryItemId: item.id,
      displayName: item.displayName,
      setName: item.setName,
      cardNumber: item.cardNumber,
      tcgplayerProductId: item.tcgplayerProductId,
      catalogMatchMethod: item.catalogMatchMethod,
      reason: "missing_printing_id",
      message: "Enriched but missing Scryfall printing ID",
    };
  }

  if (!isInventoryCatalogEnriched(item)) {
    return {
      inventoryItemId: item.id,
      displayName: item.displayName,
      setName: item.setName,
      cardNumber: item.cardNumber,
      tcgplayerProductId: item.tcgplayerProductId,
      reason: "pending_enrichment",
      message: "Not yet run through catalog enrichment",
    };
  }

  return null;
}

/** Build review queue for unresolved, fuzzy, conflicting, and pending catalog matches. */
export function buildCatalogMatchQueue(
  items: InventoryItem[],
  input?: {
    reasons?: CatalogMatchQueueReason[];
    limit?: number;
    offset?: number;
  },
): CatalogMatchQueueResult {
  const magic = items.filter(isEnrichableMagicSingle);
  const conflicts = detectTcgplayerScryfallConflicts(magic);
  const allowed = input?.reasons?.length
    ? new Set(input.reasons)
    : null;

  const allRows: CatalogMatchQueueRow[] = [];
  for (const item of magic) {
    const row = queueRowForItem(item, magic, conflicts);
    if (!row) continue;
    if (allowed && !allowed.has(row.reason)) continue;
    allRows.push(row);
  }

  allRows.sort((a, b) => {
    const rank = QUEUE_REASON_RANK[a.reason] - QUEUE_REASON_RANK[b.reason];
    if (rank !== 0) return rank;
    return a.displayName.localeCompare(b.displayName);
  });

  const offset = Math.max(0, input?.offset ?? 0);
  const limit = Math.min(500, Math.max(1, input?.limit ?? 100));

  return {
    rows: allRows.slice(offset, offset + limit),
    total: allRows.length,
    conflictGroups: conflicts.size,
  };
}

/** Count inventory rows participating in TCGplayer→Scryfall conflicts. */
export function countConflictInventoryRows(items: InventoryItem[]): number {
  const magic = items.filter(isEnrichableMagicSingle);
  const conflicts = detectTcgplayerScryfallConflicts(magic);
  if (conflicts.size === 0) return 0;

  let count = 0;
  for (const item of magic) {
    const productId = item.tcgplayerProductId?.trim();
    if (productId && conflicts.has(productId)) count += 1;
  }
  return count;
}
