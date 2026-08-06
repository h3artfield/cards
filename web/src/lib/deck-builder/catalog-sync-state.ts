import { createHash } from "crypto";
import type { InventoryItem } from "../types";
import { MTG_RAG_INGESTION_VERSION } from "../mtg-rag/constants";
import {
  ORACLE_PROFILE_VERSION,
  RELATIONSHIP_GRAPH_VERSION,
} from "./version-constants";
import type { CatalogSyncState, ClerkDataVersions } from "./types";
import { deckBuilderStore } from "./deck-builder-store";

const SYNC_STATE_ID = "global" as const;

export async function getCatalogSyncState(): Promise<CatalogSyncState | null> {
  return deckBuilderStore.getCatalogSyncState();
}

export async function touchCatalogSyncState(
  patch: Partial<Omit<CatalogSyncState, "id" | "updatedAt">>,
): Promise<CatalogSyncState> {
  const existing = await deckBuilderStore.getCatalogSyncState();
  const next: CatalogSyncState = {
    id: SYNC_STATE_ID,
    scryfallBulkVersion: patch.scryfallBulkVersion ?? existing?.scryfallBulkVersion,
    oracleProfileVersion:
      patch.oracleProfileVersion ??
      existing?.oracleProfileVersion ??
      ORACLE_PROFILE_VERSION,
    catalogPrintingCount:
      patch.catalogPrintingCount ?? existing?.catalogPrintingCount,
    catalogOracleCardCount:
      patch.catalogOracleCardCount ?? existing?.catalogOracleCardCount,
    lastOracleCardSyncAt:
      patch.lastOracleCardSyncAt ?? existing?.lastOracleCardSyncAt,
    lastInventoryEnrichAt:
      patch.lastInventoryEnrichAt ?? existing?.lastInventoryEnrichAt,
    edhrecSyncVersion: patch.edhrecSyncVersion ?? existing?.edhrecSyncVersion,
    lastEdhrecSyncAt: patch.lastEdhrecSyncAt ?? existing?.lastEdhrecSyncAt,
    ragCorpusVersion:
      patch.ragCorpusVersion ?? existing?.ragCorpusVersion ?? MTG_RAG_INGESTION_VERSION,
    relationshipGraphVersion:
      patch.relationshipGraphVersion ??
      existing?.relationshipGraphVersion ??
      RELATIONSHIP_GRAPH_VERSION,
    updatedAt: new Date().toISOString(),
  };
  await deckBuilderStore.saveCatalogSyncState(next);
  return next;
}

/** Reproducible inventory snapshot id from item ids, qty, and catalog oracle ids. */
export function buildInventorySnapshotId(items: InventoryItem[]): string {
  const payload = items
    .map((item) => {
      const qty =
        item.quantityAvailable ??
        item.quantityOnHand ??
        item.quantity ??
        0;
      return [
        item.id,
        qty,
        item.catalogOracleId ?? "",
        item.catalogScryfallId ?? "",
        item.catalogSyncedAt ?? item.acquiredAt ?? "",
      ].join(":");
    })
    .sort()
    .join("|");
  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 16);
  return `inv-${items.length}-${hash}`;
}

export async function getClerkDataVersions(input?: {
  inventoryItems?: InventoryItem[];
  inventorySnapshotId?: string;
}): Promise<ClerkDataVersions> {
  const sync = await getCatalogSyncState();
  const inventorySnapshotId =
    input?.inventorySnapshotId ??
    (input?.inventoryItems
      ? buildInventorySnapshotId(input.inventoryItems)
      : undefined);
  return {
    scryfallBulkVersion: sync?.scryfallBulkVersion,
    oracleProfileVersion: sync?.oracleProfileVersion ?? ORACLE_PROFILE_VERSION,
    catalogOracleCardCount: sync?.catalogOracleCardCount,
    edhrecSyncVersion: sync?.edhrecSyncVersion,
    ragCorpusVersion: sync?.ragCorpusVersion ?? MTG_RAG_INGESTION_VERSION,
    relationshipGraphVersion:
      sync?.relationshipGraphVersion ?? RELATIONSHIP_GRAPH_VERSION,
    inventorySnapshotId,
    inventoryCheckedAt: new Date().toISOString(),
  };
}
