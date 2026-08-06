/**
 * Fully balanced rulings reconciliation + ID-set equality verification.
 * Run: npx tsx scripts/reconcile-golden-catalog-rulings-balanced.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import {
  acquireRulingsJobLock,
  RulingsJobLockError,
} from "../src/lib/deck-builder/golden-catalog/rulings-job-lock";
import { downloadBulkToCache, fetchBulkMetadata } from "../src/lib/deck-builder/golden-catalog/bulk-metadata";
import { runBalancedRulingsReconciliation } from "../src/lib/deck-builder/golden-catalog/rulings-reconciliation";

loadEnvLocal();

async function main() {
  const started = Date.now();

  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) process.exit(1);

  const db = await requireLocalFirestore("Firestore", () =>
    Promise.resolve(requireFirestore()),
  );

  let release: ((s: "completed" | "failed", m?: string) => Promise<void>) | undefined;
  try {
    const lock = await acquireRulingsJobLock(db, "reconcile");
    release = lock.release;
  } catch (err) {
    if (err instanceof RulingsJobLockError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }

  try {
    const meta = await fetchBulkMetadata("rulings");
    if (!meta) throw new Error("Scryfall rulings bulk metadata unavailable");
    const { cachePath, contentHash } = await downloadBulkToCache(meta);

    const report = {
      ...(await runBalancedRulingsReconciliation({
        db,
        cachePath,
        bulkUpdatedAt: meta.updatedAt,
        bulkContentHash: contentHash,
      })),
      durationMs: Date.now() - started,
      bulkUpdatedAt: meta.updatedAt,
      bulkContentHash: contentHash,
      concurrencyProtection: {
        distributedLockDoc: "catalogSyncState/rulingsJobLock",
        staleLockAuditDoc: "catalogSyncState/rulingsJobLockAudit",
        stagingCollection: "catalogRulingsStaging",
        importPromotesOnlyAfterReconciliation: true,
      },
    };

    const outPath = resolve(process.cwd(), "reports", "golden-catalog-rulings-reconciliation-balanced.json");
    mkdirSync(resolve(outPath, ".."), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

    const b = report.mutuallyExclusiveBreakdown;
    console.log("\nMutually exclusive breakdown (must sum to 77,998):");
    console.log(`  source rows:                  ${b.sourceRows}`);
    console.log(`  persisted unique documents:   ${b.persistedUniqueDocuments}`);
    console.log(`  exact duplicate rows:         ${b.exactDuplicateRows}`);
    console.log(`  whitespace/empty exclusions:  ${b.whitespaceEmptyExclusions}`);
    console.log(`  invalid records:              ${b.invalidRecords}`);
    console.log(`  orphaned oracle IDs:          ${b.orphanedOracleIds}`);
    console.log(`  other intentional exclusions: ${b.otherIntentionalExclusions}`);
    console.log(`  write failures:               ${b.writeFailures}`);
    console.log(`  sum:                          ${report.balanceCheck.sum}`);
    console.log(`  ID sets match exactly:        ${report.idSetEquality.idsMatchExactly}`);
    console.log(`  Oracle IDs match:             ${report.distinctOracleIds.matches}`);
    console.log(`  audit closed:                 ${report.auditClosed}`);
    console.log(`\nReport: ${outPath}`);

    if (release) await release("completed");
    if (!report.auditClosed) process.exit(1);
  } catch (err) {
    if (release) await release("failed", err instanceof Error ? err.message : String(err));
    throw err;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
