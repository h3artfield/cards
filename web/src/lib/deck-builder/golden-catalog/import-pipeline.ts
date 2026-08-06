import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "../../firebase/collections";
import { buildOracleTagsIndexFromEntries } from "../scryfall-oracle-tags";
import { deriveTagDerivedProfileV0 } from "../functional-profile";
import type { CatalogCard } from "../types";
import {
  downloadBulkToCache,
  fetchBulkMetadata,
  shouldSkipBulkImport,
} from "./bulk-metadata";
import { FirestoreBatchWriter } from "./firestore-batch-writer";
import { parseOracleCardFromBulk } from "./parse-oracle-card";
import { isPaperPrinting, parsePrintingFromBulk } from "./parse-printing";
import type {
  BulkImportDatasetReport,
  BulkImportRun,
  GoldenCatalogSyncState,
} from "./schemas";
import {
  CATALOG_PRINTINGS_COLLECTION,
  toCatalogCard,
} from "./schemas";
import {
  countJsonlLines,
  streamJsonlFile,
  streamOracleTagsFile,
} from "./stream-bulk-jsonl";

export interface GoldenCatalogImportOptions {
  db: Firestore;
  dryRun?: boolean;
  force?: boolean;
  limit?: number;
  datasets?: Array<"oracle_cards" | "default_cards" | "oracle_tags">;
  onProgress?: (message: string) => void;
}

function newRunId(): string {
  return `golden-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function loadSyncState(db: Firestore): Promise<GoldenCatalogSyncState | null> {
  const snap = await db.collection(COLLECTIONS.catalogSyncState).doc("global").get();
  if (!snap.exists) return null;
  return snap.data() as GoldenCatalogSyncState;
}

async function saveSyncState(
  db: Firestore,
  patch: Partial<GoldenCatalogSyncState>,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .collection(COLLECTIONS.catalogSyncState)
    .doc("global")
    .set({ id: "global", ...patch, updatedAt: now }, { merge: true });
}

async function saveImportRun(db: Firestore, run: BulkImportRun): Promise<void> {
  await db
    .collection(COLLECTIONS.goldenCatalogImportRuns)
    .doc(run.id)
    .set(run, { merge: true });
}

async function importOracleCards(
  db: Firestore,
  input: GoldenCatalogImportOptions & {
    syncState: GoldenCatalogSyncState | null;
  },
): Promise<BulkImportDatasetReport> {
  const meta = await fetchBulkMetadata("oracle_cards");
  if (!meta) throw new Error("oracle_cards bulk metadata unavailable");

  const { cachePath, contentHash } = await downloadBulkToCache(meta, {
    force: input.force,
  });
  const skip = shouldSkipBulkImport({
    dataset: "oracle_cards",
    bulkUpdatedAt: meta.updatedAt,
    contentHash,
    syncState: input.syncState,
  });

  const sourceRowCount = await countJsonlLines(cachePath);
  if (skip.skip && !input.force && !input.limit) {
    return {
      dataset: "oracle_cards",
      bulkUpdatedAt: meta.updatedAt,
      contentHash,
      cachePath,
      sourceRowCount,
      importedCount: 0,
      updatedCount: 0,
      unchangedCount: sourceRowCount,
      failedCount: 0,
      skipped: true,
      skipReason: skip.reason,
    };
  }

  const writer = new FirestoreBatchWriter(
    db,
    COLLECTIONS.catalogOracleCards,
    input.dryRun,
  );
  let importedCount = 0;
  let failedCount = 0;
  const bulkUpdatedAt = meta.updatedAt;

  await streamJsonlFile({
    cachePath,
    limit: input.limit,
    onLine: async (raw) => {
      const oracle = parseOracleCardFromBulk(raw, { bulkUpdatedAt });
      if (!oracle) {
        failedCount += 1;
        return;
      }
      await writer.enqueue(oracle);
      importedCount += 1;
    },
  });
  await writer.flush();

  if (!input.dryRun) {
    await saveSyncState(db, {
      oracleCardsBulkUpdatedAt: meta.updatedAt,
      oracleCardsContentHash: contentHash,
      catalogOracleCardCount: importedCount,
    });
  }

  return {
    dataset: "oracle_cards",
    bulkUpdatedAt: meta.updatedAt,
    contentHash,
    cachePath,
    sourceRowCount,
    importedCount,
    updatedCount: importedCount,
    unchangedCount: 0,
    failedCount,
    skipped: false,
  };
}

async function importDefaultCards(
  db: Firestore,
  input: GoldenCatalogImportOptions & {
    syncState: GoldenCatalogSyncState | null;
  },
): Promise<BulkImportDatasetReport> {
  const meta = await fetchBulkMetadata("default_cards");
  if (!meta) throw new Error("default_cards bulk metadata unavailable");

  const { cachePath, contentHash } = await downloadBulkToCache(meta, {
    force: input.force,
  });
  const skip = shouldSkipBulkImport({
    dataset: "default_cards",
    bulkUpdatedAt: meta.updatedAt,
    contentHash,
    syncState: input.syncState,
  });

  let sourceRowCount = 0;
  await streamJsonlFile({
    cachePath,
    filter: isPaperPrinting,
    onLine: async () => {
      sourceRowCount += 1;
    },
  });

  if (skip.skip && !input.force && !input.limit) {
    return {
      dataset: "default_cards",
      bulkUpdatedAt: meta.updatedAt,
      contentHash,
      cachePath,
      sourceRowCount,
      importedCount: 0,
      updatedCount: 0,
      unchangedCount: sourceRowCount,
      failedCount: 0,
      skipped: true,
      skipReason: skip.reason,
    };
  }

  const writer = new FirestoreBatchWriter<CatalogCard>(
    db,
    CATALOG_PRINTINGS_COLLECTION,
    input.dryRun,
  );
  let importedCount = 0;
  let failedCount = 0;
  const bulkUpdatedAt = meta.updatedAt;

  await streamJsonlFile({
    cachePath,
    limit: input.limit,
    filter: isPaperPrinting,
    onLine: async (raw) => {
      const printing = parsePrintingFromBulk(raw, { bulkUpdatedAt });
      if (!printing) {
        failedCount += 1;
        return;
      }
      const legacy = toCatalogCard(printing);
      await writer.enqueue(legacy);
      importedCount += 1;
    },
  });
  await writer.flush();

  if (!input.dryRun) {
    await saveSyncState(db, {
      defaultCardsBulkUpdatedAt: meta.updatedAt,
      defaultCardsContentHash: contentHash,
      catalogPrintingCount: importedCount,
    });
  }

  return {
    dataset: "default_cards",
    bulkUpdatedAt: meta.updatedAt,
    contentHash,
    cachePath,
    sourceRowCount,
    importedCount,
    updatedCount: importedCount,
    unchangedCount: 0,
    failedCount,
    skipped: false,
  };
}

async function importOracleTags(
  db: Firestore,
  input: GoldenCatalogImportOptions & {
    syncState: GoldenCatalogSyncState | null;
  },
): Promise<BulkImportDatasetReport> {
  const meta = await fetchBulkMetadata("oracle_tags");
  if (!meta) throw new Error("oracle_tags bulk metadata unavailable");

  const { cachePath, contentHash } = await downloadBulkToCache(meta, {
    force: input.force,
  });
  const skip = shouldSkipBulkImport({
    dataset: "oracle_tags",
    bulkUpdatedAt: meta.updatedAt,
    contentHash,
    syncState: input.syncState,
  });

  const entries: Record<string, unknown>[] = [];
  await streamOracleTagsFile({
    cachePath,
    onEntry: (entry) => {
      entries.push(entry);
    },
  });
  const index = buildOracleTagsIndexFromEntries(
    entries as Parameters<typeof buildOracleTagsIndexFromEntries>[0],
  );
  const sourceRowCount = index.byOracleId.size;

  if (skip.skip && !input.force && !input.limit) {
    return {
      dataset: "oracle_tags",
      bulkUpdatedAt: meta.updatedAt,
      contentHash,
      cachePath,
      sourceRowCount,
      importedCount: 0,
      updatedCount: 0,
      unchangedCount: sourceRowCount,
      failedCount: 0,
      skipped: true,
      skipReason: skip.reason,
    };
  }

  let updatedCount = 0;
  let failedCount = 0;
  const oracleIds = input.limit
    ? [...index.byOracleId.keys()].slice(0, input.limit)
    : [...index.byOracleId.keys()];

  for (let i = 0; i < oracleIds.length; i += 500) {
    const chunk = oracleIds.slice(i, i + 500);
    const batch = input.dryRun ? null : db.batch();
    for (const oracleId of chunk) {
      const oracleTags = index.byOracleId.get(oracleId) ?? [];
      const tagDerivedProfileV0 = deriveTagDerivedProfileV0({
        oracleTags,
        keywords: [],
      });
      if (input.dryRun) {
        updatedCount += 1;
        continue;
      }
      const ref = db.collection(COLLECTIONS.catalogOracleCards).doc(oracleId);
      batch!.set(
        ref,
        {
          oracleTags,
          oracleTagStatus: oracleTags.length > 0 ? "tagged" : "no_tags_in_source",
          tagDerivedProfileV0:
            Object.keys(tagDerivedProfileV0.roles).length > 0
              ? tagDerivedProfileV0
              : undefined,
          evidence: {
            source: "oracle_tags",
            bulkUpdatedAt: meta.updatedAt,
          },
          updatedAt: new Date().toISOString(),
        },
        { merge: true },
      );
      updatedCount += 1;
    }
    if (batch) {
      try {
        await batch.commit();
      } catch {
        failedCount += chunk.length;
      }
    }
  }

  if (!input.dryRun) {
    await saveSyncState(db, {
      oracleTagsBulkUpdatedAt: meta.updatedAt,
      oracleTagsContentHash: contentHash,
      profileVersion: "tag-derived-v0",
    });
  }

  return {
    dataset: "oracle_tags",
    bulkUpdatedAt: meta.updatedAt,
    contentHash,
    cachePath,
    sourceRowCount,
    importedCount: 0,
    updatedCount,
    unchangedCount: 0,
    failedCount,
    skipped: false,
  };
}

/** Full version-aware Scryfall bulk → Firestore golden catalog import. */
export async function runGoldenCatalogImport(
  input: GoldenCatalogImportOptions,
): Promise<BulkImportRun> {
  const runId = newRunId();
  const startedAt = new Date().toISOString();
  const datasetsRequested =
    input.datasets ?? (["oracle_cards", "default_cards", "oracle_tags"] as const);

  const run: BulkImportRun = {
    id: runId,
    status: "running",
    startedAt,
    datasets: [],
  };
  if (!input.dryRun) {
    await saveImportRun(input.db, run);
  }

  const syncState = await loadSyncState(input.db);
  const reports: BulkImportDatasetReport[] = [];

  try {
    if (datasetsRequested.includes("oracle_cards")) {
      input.onProgress?.("Importing oracle_cards…");
      reports.push(
        await importOracleCards(input.db, { ...input, syncState }),
      );
    }
    if (datasetsRequested.includes("default_cards")) {
      input.onProgress?.("Importing default_cards (printings)…");
      reports.push(
        await importDefaultCards(input.db, { ...input, syncState }),
      );
    }
    if (datasetsRequested.includes("oracle_tags")) {
      input.onProgress?.("Applying oracle_tags…");
      reports.push(await importOracleTags(input.db, { ...input, syncState }));
    }

    if (!input.dryRun) {
      await saveSyncState(input.db, {
        lastFullImportAt: new Date().toISOString(),
        lastFullImportRunId: runId,
      });
    }

    const completed: BulkImportRun = {
      ...run,
      status: reports.some((r) => r.failedCount > 0) ? "partial" : "completed",
      completedAt: new Date().toISOString(),
      datasets: reports,
    };
    if (!input.dryRun) {
      await saveImportRun(input.db, completed);
    }
    return completed;
  } catch (err) {
    const failed: BulkImportRun = {
      ...run,
      status: "failed",
      completedAt: new Date().toISOString(),
      datasets: reports,
      message: err instanceof Error ? err.message : String(err),
    };
    if (!input.dryRun) {
      await saveImportRun(input.db, failed);
    }
    throw err;
  }
}
