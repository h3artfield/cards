/**
 * Load one oracleId record per card for full-catalog shadow studies.
 * Sources: Firestore catalogOracleCards (preferred) or cached Scryfall oracle_cards bulk.
 */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { getBulkCacheDir } from "../../src/lib/deck-builder/golden-catalog/bulk-metadata";
import { parseOracleCardFromBulk } from "../../src/lib/deck-builder/golden-catalog/parse-oracle-card";
import { streamJsonlFile } from "../../src/lib/deck-builder/golden-catalog/stream-bulk-jsonl";
import type { GoldenCatalogOracleCard } from "../../src/lib/deck-builder/golden-catalog/schemas";
import {
  combinedGoldenOracleText,
  goldenOracleTextHash,
  loadGoldenCatalogIndex,
} from "./load-golden-catalog-index";

export type CatalogOracleRecord = {
  oracleId: string;
  canonicalName: string;
  oracleText: string;
  layout?: string;
  cardFaces?: GoldenCatalogOracleCard["cardFaces"];
  sourceVersion?: string;
  oracleTextHash: string;
};

export type CatalogLoadResult = {
  source: "firestore" | "scryfall_bulk_cache";
  sourceDetail: string;
  catalogVersion: string;
  loadedAt: string;
  cardCount: number;
  records: CatalogOracleRecord[];
};

function toRecord(card: GoldenCatalogOracleCard): CatalogOracleRecord {
  const oracleText = combinedGoldenOracleText(card);
  return {
    oracleId: card.oracleId,
    canonicalName: card.canonicalName,
    oracleText,
    layout: card.layout,
    cardFaces: card.cardFaces,
    sourceVersion: card.sourceVersion,
    oracleTextHash: goldenOracleTextHash(oracleText),
  };
}

export function findLatestOracleCardsBulkCachePath(): string | null {
  const dir = getBulkCacheDir();
  if (!existsSync(dir)) return null;
  const candidates = readdirSync(dir)
    .filter((name) => name.startsWith("oracle_cards-") && name.endsWith(".jsonl.gz"))
    .sort();
  if (candidates.length === 0) return null;
  return resolve(dir, candidates[candidates.length - 1]!);
}

export async function loadCatalogOracleRecordsFromFirestore(input?: {
  limit?: number;
}): Promise<CatalogLoadResult> {
  const index = await loadGoldenCatalogIndex();
  const sorted = [...index.byOracleId.values()].sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  const slice = input?.limit != null ? sorted.slice(0, input.limit) : sorted;
  return {
    source: "firestore",
    sourceDetail: "catalogOracleCards",
    catalogVersion: index.catalogVersion,
    loadedAt: new Date().toISOString(),
    cardCount: slice.length,
    records: slice.map(toRecord),
  };
}

export async function loadCatalogOracleRecordsFromBulkCache(input: {
  cachePath?: string;
  limit?: number;
}): Promise<CatalogLoadResult> {
  const cachePath = input.cachePath ?? findLatestOracleCardsBulkCachePath();
  if (!cachePath) {
    throw new Error(
      "No cached oracle_cards bulk found. Set SCRYFALL_BULK_CACHE_DIR or import golden catalog first.",
    );
  }

  const byOracleId = new Map<string, CatalogOracleRecord>();
  let bulkUpdatedAt = "unknown";
  await streamJsonlFile({
    cachePath,
    onLine: (raw) => {
      bulkUpdatedAt = (raw.released_at as string | undefined) ?? bulkUpdatedAt;
      const card = parseOracleCardFromBulk(raw, { bulkUpdatedAt });
      if (!card.oracleText?.trim()) return;
      byOracleId.set(card.oracleId, toRecord(card));
    },
  });

  const sorted = [...byOracleId.values()].sort((a, b) => a.oracleId.localeCompare(b.oracleId));
  const slice = input?.limit != null ? sorted.slice(0, input.limit) : sorted;
  return {
    source: "scryfall_bulk_cache",
    sourceDetail: cachePath,
    catalogVersion: bulkUpdatedAt,
    loadedAt: new Date().toISOString(),
    cardCount: slice.length,
    records: slice,
  };
}

export async function loadCatalogOracleRecords(input?: {
  source?: "auto" | "firestore" | "bulk";
  cachePath?: string;
  limit?: number;
}): Promise<CatalogLoadResult> {
  const source = input?.source ?? "auto";
  if (source === "bulk") {
    return loadCatalogOracleRecordsFromBulkCache({ cachePath: input?.cachePath, limit: input?.limit });
  }
  if (source === "firestore") {
    return loadCatalogOracleRecordsFromFirestore({ limit: input?.limit });
  }

  try {
    const { ensureFirebaseAdmin, isAdminConfigured } = await import("../../src/lib/firebase/admin");
    if (ensureFirebaseAdmin().initialized && isAdminConfigured()) {
      return loadCatalogOracleRecordsFromFirestore({ limit: input?.limit });
    }
  } catch {
    // fall through to bulk cache
  }

  return loadCatalogOracleRecordsFromBulkCache({ cachePath: input?.cachePath, limit: input?.limit });
}
