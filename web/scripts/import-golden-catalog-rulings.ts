/**
 * Import Scryfall rulings bulk via staging collection + version promotion.
 * Only one rulings mutation job may run at a time (distributed Firestore lock).
 *
 * Run: npx tsx scripts/import-golden-catalog-rulings.ts [--dry-run] [--force] [--limit=N]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { COLLECTIONS } from "../src/lib/firebase/collections";
import {
  downloadBulkToCache,
  fetchBulkMetadata,
} from "../src/lib/deck-builder/golden-catalog/bulk-metadata";
import { FirestoreBatchWriter, countCollection } from "../src/lib/deck-builder/golden-catalog/firestore-batch-writer";
import {
  INTENTIONAL_RULING_EXCLUSIONS,
  parseRulingFromBulk,
} from "../src/lib/deck-builder/golden-catalog/parse-ruling";
import {
  acquireRulingsJobLock,
  RulingsJobLockError,
} from "../src/lib/deck-builder/golden-catalog/rulings-job-lock";
import {
  clearStagingRun,
  copyStagingRunToVersion,
  countActiveVersionRulings,
  promoteVersionToActive,
} from "../src/lib/deck-builder/golden-catalog/rulings-staging";
import { RULINGS_IMPORTER_VERSION } from "../src/lib/deck-builder/golden-catalog/rulings-importer-version";
import { streamJsonlFile, countJsonlLines } from "../src/lib/deck-builder/golden-catalog/stream-bulk-jsonl";
import { runBalancedRulingsReconciliation } from "../src/lib/deck-builder/golden-catalog/rulings-reconciliation";

loadEnvLocal();

function parseArgs() {
  return {
    dryRun: process.argv.includes("--dry-run"),
    force: process.argv.includes("--force"),
    limit: (() => {
      const arg = process.argv.find((a) => a.startsWith("--limit="));
      return arg ? Number(arg.slice("--limit=".length)) : undefined;
    })(),
  };
}

async function main() {
  const { dryRun, force, limit } = parseArgs();
  const started = Date.now();
  const importedAt = new Date().toISOString();

  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) process.exit(1);

  const db = await requireLocalFirestore("Firestore", () =>
    Promise.resolve(requireFirestore()),
  );

  let releaseLock: ((status: "completed" | "failed", message?: string) => Promise<void>) | undefined;
  let runId = "dry-run";

  if (!dryRun) {
    try {
      const lock = await acquireRulingsJobLock(db, "import");
      releaseLock = lock.release;
      runId = lock.runId;
    } catch (err) {
      if (err instanceof RulingsJobLockError) {
        console.error(err.message);
        if (err.activeLock) console.error("Active lock:", err.activeLock);
        process.exit(1);
      }
      throw err;
    }
  }

  try {
    const meta = await fetchBulkMetadata("rulings");
    if (!meta) throw new Error("Scryfall rulings bulk metadata unavailable");

    const { cachePath, contentHash } = await downloadBulkToCache(meta, { force });
    const sourceRowCount = await countJsonlLines(cachePath);

    const syncSnap = await db.collection(COLLECTIONS.catalogSyncState).doc("global").get();
    const sync = syncSnap.data() as { rulingsBulkUpdatedAt?: string; rulingsContentHash?: string } | undefined;

    if (
      !force &&
      !limit &&
      sync?.rulingsBulkUpdatedAt === meta.updatedAt &&
      sync?.rulingsContentHash === contentHash
    ) {
      console.log("Rulings bulk unchanged — skip import");
      if (releaseLock) await releaseLock("completed", "skipped unchanged bulk");
      return;
    }

    const stagingPath = COLLECTIONS.catalogRulingsStaging;
    const writer = new FirestoreBatchWriter(db, stagingPath, dryRun);
    let parsed = 0;
    let intentionalExclusions = 0;
    let unexplainedFailures = 0;
    const contentHashes = new Set<string>();
    const expectedDocIds = new Set<string>();
    const oracleIds = new Set<string>();

    await streamJsonlFile({
      cachePath,
      limit,
      onLine: async (raw, lineNumber) => {
        const result = parseRulingFromBulk(raw, meta.updatedAt, importedAt);
        if (!result.ruling) {
          const reason = result.exclusionReason ?? "unknown";
          if (INTENTIONAL_RULING_EXCLUSIONS.has(reason)) intentionalExclusions += 1;
          else unexplainedFailures += 1;
          return;
        }

        const ruling = result.ruling;
        if (contentHashes.has(ruling.contentHash)) {
          intentionalExclusions += 1;
          return;
        }

        contentHashes.add(ruling.contentHash);
        expectedDocIds.add(ruling.id);
        oracleIds.add(ruling.oracleId);
        await writer.enqueue({ ...ruling, importRunId: runId });
        parsed += 1;
      },
    });

    await writer.flush();
    const stats = writer.getStats();

    if (unexplainedFailures > 0) {
      throw new Error(`${unexplainedFailures} unexplained parse failures — aborting promotion`);
    }

    const reconciliation = await runBalancedRulingsReconciliation({
      db,
      cachePath,
      bulkUpdatedAt: meta.updatedAt,
      bulkContentHash: contentHash,
      collectionPath: dryRun ? undefined : stagingPath,
      importRunId: dryRun ? undefined : runId,
      expectedDocIds,
    });

    let promoted = 0;
    let activeVersionId: string | null = null;
    let previousVersionId: string | null = null;
    if (!dryRun) {
      if (!reconciliation.auditClosed) {
        throw new Error("Staging reconciliation failed — active version not modified");
      }

      const versionId = `rulings-${contentHash.slice(0, 16)}`;
      promoted = await copyStagingRunToVersion(db, runId, versionId, {
        bulkUpdatedAt: meta.updatedAt,
        bulkContentHash: contentHash,
      });

      const versionReconciliation = await runBalancedRulingsReconciliation({
        db,
        cachePath,
        bulkUpdatedAt: meta.updatedAt,
        bulkContentHash: contentHash,
        versionId,
        expectedDocIds,
      });

      if (!versionReconciliation.auditClosed) {
        throw new Error("Version reconciliation failed — active pointer not updated");
      }

      const activation = await promoteVersionToActive(db, versionId);
      activeVersionId = activation.activeVersionId;
      previousVersionId = activation.previousVersionId;
      await clearStagingRun(db, runId);

      Object.assign(reconciliation, { versionReconciliation, activation });
    }

    const report = {
      generatedAt: importedAt,
      durationMs: Date.now() - started,
      dryRun,
      runId,
      bulkUpdatedAt: meta.updatedAt,
      contentHash,
      sourceRowCount,
      parsed,
      intentionalExclusions,
      unexplainedFailures,
      distinctOracleIds: oracleIds.size,
      writeFailures: reconciliation.mutuallyExclusiveBreakdown.writeFailures,
      persistedCount: reconciliation.mutuallyExclusiveBreakdown.persistedUniqueDocuments,
      promoted,
      activeVersionId,
      previousVersionId,
      activeRulingCount: dryRun ? 0 : await countActiveVersionRulings(db),
      rulingsImporterVersion: RULINGS_IMPORTER_VERSION,
      reconciliation,
      firestore: stats,
    };

    const outPath = resolve(process.cwd(), "reports", "golden-catalog-rulings-import.json");
    mkdirSync(resolve(outPath, ".."), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

    console.log("\nRulings import complete");
    console.log(`  run ID:                ${runId}`);
    console.log(`  source rows:           ${sourceRowCount}`);
    console.log(`  parsed (unique):       ${parsed}`);
    console.log(`  intentional exclusions:${intentionalExclusions}`);
    console.log(`  persisted live:        ${report.persistedCount}`);
    console.log(`  write failures:        ${report.writeFailures}`);
    console.log(`  audit closed:          ${reconciliation.auditClosed}`);
    console.log(`\nReport: ${outPath}`);

    if (releaseLock) await releaseLock("completed");
  } catch (err) {
    if (releaseLock) {
      await releaseLock("failed", err instanceof Error ? err.message : String(err));
    }
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
