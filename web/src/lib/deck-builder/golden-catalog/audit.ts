import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "../../firebase/collections";
import { isMagicInventoryItem } from "../../inventory/magic-items";
import type { InventoryItem } from "../../types";
import { fetchAllBulkMetadata, downloadBulkToCache, fetchBulkMetadata } from "./bulk-metadata";
import { countCollection, sampleDoc } from "./firestore-batch-writer";
import type {
  BulkImportRun,
  CatalogPrinting,
  GoldenCatalogAuditReport,
  GoldenCatalogOracleCard,
  GoldenCatalogSyncState,
  InventoryListingGolden,
} from "./schemas";
import { CATALOG_PRINTINGS_COLLECTION } from "./schemas";
import { countJsonlLines, streamJsonlFile } from "./stream-bulk-jsonl";
import { isPaperPrinting } from "./parse-printing";

function pct(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

async function countOracleWithTags(db: Firestore): Promise<number> {
  try {
    const snap = await db
      .collection(COLLECTIONS.catalogOracleCards)
      .where("oracleTags", "!=", [])
      .count()
      .get();
    return snap.data().count;
  } catch {
    return 0;
  }
}

async function auditInventoryLinks(db: Firestore): Promise<{
  inventoryMagicListings: number;
  inventoryWithOracleId: number;
  inventoryWithScryfallId: number;
  sampleListing?: InventoryListingGolden;
}> {
  const snap = await db.collection(COLLECTIONS.inventory).get();
  let inventoryMagicListings = 0;
  let inventoryWithOracleId = 0;
  let inventoryWithScryfallId = 0;
  let sampleItem: InventoryItem | null = null;

  for (const doc of snap.docs) {
    const item = doc.data() as InventoryItem;
    if (!isMagicInventoryItem(item)) continue;
    inventoryMagicListings += 1;
    if (item.catalogOracleId?.trim()) inventoryWithOracleId += 1;
    if (item.catalogScryfallId?.trim()) inventoryWithScryfallId += 1;
    if (!sampleItem && item.catalogOracleId && item.catalogScryfallId) {
      sampleItem = item;
    }
  }

  let sampleListing: InventoryListingGolden | undefined;
  if (sampleItem) {
    sampleListing = {
      listingId: sampleItem.id,
      storeId: sampleItem.storeId,
      oracleId: sampleItem.catalogOracleId,
      scryfallId: sampleItem.catalogScryfallId,
      condition: sampleItem.tcgplayerCondition ?? sampleItem.condition,
      finish: undefined,
      quantityOnHand: sampleItem.quantityOnHand ?? sampleItem.quantity ?? 0,
      quantityReserved: sampleItem.quantityReserved ?? 0,
      quantityCommitted: sampleItem.quantityCommitted ?? 0,
      quantityAvailable:
        sampleItem.quantityAvailable ??
        Math.max(
          0,
          (sampleItem.quantityOnHand ?? sampleItem.quantity ?? 0) -
            (sampleItem.quantityReserved ?? 0) -
            (sampleItem.quantityCommitted ?? 0),
        ),
      listPrice: sampleItem.listPrice,
      tcgLowPrice: sampleItem.tcgLowPrice,
      source: sampleItem.source,
      updatedAt: sampleItem.lastTcgplayerImportAt ?? sampleItem.acquiredAt,
    };
  }

  return {
    inventoryMagicListings,
    inventoryWithOracleId,
    inventoryWithScryfallId,
    sampleListing,
  };
}

async function estimateBulkCounts(): Promise<{
  oracleCards?: number;
  defaultCardsPaper?: number;
  oracleTagsEntries?: number;
}> {
  try {
    const oracleMeta = await fetchBulkMetadata("oracle_cards");
    const defaultMeta = await fetchBulkMetadata("default_cards");
    const tagsMeta = await fetchBulkMetadata("oracle_tags");

    const out: GoldenCatalogAuditReport["bulkExpected"] = {};

    if (oracleMeta) {
      const { cachePath } = await downloadBulkToCache(oracleMeta);
      out.oracleCards = await countJsonlLines(cachePath);
    }
    if (defaultMeta) {
      const { cachePath } = await downloadBulkToCache(defaultMeta);
      let paper = 0;
      await streamJsonlFile({
        cachePath,
        filter: isPaperPrinting,
        onLine: async () => {
          paper += 1;
        },
      });
      out.defaultCardsPaper = paper;
    }
    if (tagsMeta) {
      out.oracleTagsEntries = tagsMeta.compressedSizeBytes;
    }
    return out;
  } catch {
    return {};
  }
}

export async function runGoldenCatalogAudit(input: {
  db: Firestore | null;
  skipBulkDownload?: boolean;
}): Promise<GoldenCatalogAuditReport> {
  const generatedAt = new Date().toISOString();
  const gaps: string[] = [];
  const bulkMetadata = await fetchAllBulkMetadata().catch(() => []);

  let firestoreAvailable = false;
  let counts = {
    catalogOracleCards: 0,
    catalogPrintings: 0,
    catalogCrosswalk: 0,
    inventoryMagicListings: 0,
    inventoryWithOracleId: 0,
    inventoryWithScryfallId: 0,
    oracleCardsNotInInventory: 0,
  };
  let syncState: GoldenCatalogSyncState | null = null;
  let lastImportRun: BulkImportRun | null = null;
  let samples: GoldenCatalogAuditReport["samples"] = {};
  let oracleWithTags = 0;

  if (input.db) {
    try {
      firestoreAvailable = true;
      counts.catalogOracleCards = await countCollection(
        input.db,
        COLLECTIONS.catalogOracleCards,
      );
      counts.catalogPrintings = await countCollection(
        input.db,
        CATALOG_PRINTINGS_COLLECTION,
      );
      counts.catalogCrosswalk = await countCollection(
        input.db,
        COLLECTIONS.cardCrosswalk,
      );
      oracleWithTags = await countOracleWithTags(input.db);

      const syncSnap = await input.db
        .collection(COLLECTIONS.catalogSyncState)
        .doc("global")
        .get();
      syncState = syncSnap.exists
        ? (syncSnap.data() as GoldenCatalogSyncState)
        : null;

      const runSnap = await input.db
        .collection(COLLECTIONS.goldenCatalogImportRuns)
        .orderBy("startedAt", "desc")
        .limit(1)
        .get();
      lastImportRun =
        (runSnap.docs[0]?.data() as BulkImportRun | undefined) ?? null;

      const inventoryAudit = await auditInventoryLinks(input.db);
      counts = { ...counts, ...inventoryAudit };
      if (inventoryAudit.sampleListing) {
        samples.inventoryListing = inventoryAudit.sampleListing;
      }

      const oracleSample = await sampleDoc<GoldenCatalogOracleCard>(
        input.db,
        COLLECTIONS.catalogOracleCards,
      );
      if (oracleSample) samples.oracleCard = oracleSample;

      const printingSample = await sampleDoc<CatalogPrinting>(
        input.db,
        CATALOG_PRINTINGS_COLLECTION,
      );
      if (printingSample) {
        samples.printing = printingSample;
      } else {
        const legacyPrinting = await sampleDoc(
          input.db,
          CATALOG_PRINTINGS_COLLECTION,
        );
        if (legacyPrinting) {
          samples.printing = legacyPrinting as CatalogPrinting;
        }
      }

      if (samples.inventoryListing?.oracleId) {
        const joinedOracle = await input.db
          .collection(COLLECTIONS.catalogOracleCards)
          .doc(samples.inventoryListing.oracleId)
          .get();
        if (joinedOracle.exists) {
          samples.oracleCard = joinedOracle.data() as GoldenCatalogOracleCard;
        }
      }
      if (samples.inventoryListing?.scryfallId) {
        const joinedPrinting = await input.db
          .collection(CATALOG_PRINTINGS_COLLECTION)
          .doc(samples.inventoryListing.scryfallId)
          .get();
        if (joinedPrinting.exists) {
          samples.printing = joinedPrinting.data() as CatalogPrinting;
        }
      }
    } catch (err) {
      firestoreAvailable = false;
      gaps.push(
        `Firestore audit failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    gaps.push("Firestore unavailable — counts reflect bulk metadata only.");
  }

  const bulkExpected = input.skipBulkDownload
    ? {}
    : await estimateBulkCounts();

  const expectedOracle = bulkExpected.oracleCards ?? 30_000;
  const expectedPrintings = bulkExpected.defaultCardsPaper ?? 110_000;

  if (counts.catalogOracleCards < expectedOracle * 0.9) {
    gaps.push(
      `Oracle catalog sparse: ${counts.catalogOracleCards} vs ~${expectedOracle} expected from Scryfall bulk.`,
    );
  }
  if (counts.catalogPrintings < expectedPrintings * 0.5) {
    gaps.push(
      `Printing catalog sparse: ${counts.catalogPrintings} vs ~${expectedPrintings} expected paper printings.`,
    );
  }
  if (oracleWithTags < counts.catalogOracleCards * 0.5 && counts.catalogOracleCards > 0) {
    gaps.push("Oracle tag coverage below 50% — run oracle_tags import.");
  }
  if (
    counts.inventoryMagicListings > 0 &&
    counts.inventoryWithOracleId / counts.inventoryMagicListings < 0.8
  ) {
    gaps.push(
      "Inventory oracle linkage below 80% — run inventory crosswalk enrichment.",
    );
  }

  counts.oracleCardsNotInInventory = Math.max(
    0,
    counts.catalogOracleCards - counts.inventoryWithOracleId,
  );

  const estimatedOracleBytes = counts.catalogOracleCards * 3_500;
  const estimatedPrintingBytes = counts.catalogPrintings * 1_800;
  const estimatedTotalMb =
    Math.round(
      ((estimatedOracleBytes + estimatedPrintingBytes) / (1024 * 1024)) * 100,
    ) / 100;

  return {
    generatedAt,
    firestoreAvailable,
    counts,
    bulkExpected,
  coverage: {
    oracleCardPct: pct(counts.catalogOracleCards, expectedOracle),
    oracleCardFormula: `${counts.catalogOracleCards}/${expectedOracle}`,
    printingPct: pct(counts.catalogPrintings, expectedPrintings),
    printingFormula: `${counts.catalogPrintings}/${expectedPrintings}`,
    oracleTagPct: pct(
      oracleWithTags,
      counts.catalogOracleCards || expectedOracle,
    ),
    oracleTagFormula: `${oracleWithTags}/${counts.catalogOracleCards || expectedOracle}`,
    inventoryOracleLinkPct: pct(
      counts.inventoryWithOracleId,
      counts.inventoryMagicListings,
    ),
    inventoryOracleLinkFormula: `${counts.inventoryWithOracleId}/${counts.inventoryMagicListings}`,
    inventoryPrintingLinkPct: pct(
      counts.inventoryWithScryfallId,
      counts.inventoryMagicListings,
    ),
    inventoryPrintingLinkFormula: `${counts.inventoryWithScryfallId}/${counts.inventoryMagicListings}`,
  },
    syncState,
    lastImportRun,
    bulkMetadata,
    samples,
    storageEstimate: {
      oracleDocs: counts.catalogOracleCards,
      printingDocs: counts.catalogPrintings,
      estimatedOracleBytes,
      estimatedPrintingBytes,
      estimatedTotalMb,
      estimatedWriteOpsFullImport:
        (bulkExpected.oracleCards ?? expectedOracle) +
        (bulkExpected.defaultCardsPaper ?? expectedPrintings),
    },
    gaps,
  };
}
