/**
 * Reconcile catalogRulings against Scryfall rulings bulk source.
 * Run: npx tsx scripts/reconcile-golden-catalog-rulings.ts
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
import {
  INTENTIONAL_RULING_EXCLUSIONS,
  parseRulingFromBulk,
  rulingContentHash,
} from "../src/lib/deck-builder/golden-catalog/parse-ruling";
import { streamJsonlFile, countJsonlLines } from "../src/lib/deck-builder/golden-catalog/stream-bulk-jsonl";

loadEnvLocal();

async function main() {
  const started = Date.now();
  const importedAt = new Date().toISOString();

  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) process.exit(1);

  const db = await requireLocalFirestore("Firestore", () =>
    Promise.resolve(requireFirestore()),
  );

  const meta = await fetchBulkMetadata("rulings");
  if (!meta) throw new Error("Scryfall rulings bulk metadata unavailable");
  const { cachePath, contentHash } = await downloadBulkToCache(meta);
  const sourceRowCount = await countJsonlLines(cachePath);

  const sourceByHash = new Map<string, Record<string, unknown>>();
  const intentionalExclusions: Array<{
    lineNumber: number;
    oracleId?: string;
    publishedAt?: string;
    rulingText?: string;
    parseFailure: string;
    parserCorrectionOrExclusionReason: string;
  }> = [];
  let unexplainedFailures = 0;

  await streamJsonlFile({
    cachePath,
    onLine: async (raw, lineNumber) => {
      const result = parseRulingFromBulk(raw, meta.updatedAt, importedAt);
      if (!result.ruling) {
        const reason = result.exclusionReason ?? "unknown";
        const entry = {
          lineNumber,
          oracleId: String(raw.oracle_id ?? ""),
          publishedAt: String(raw.published_at ?? ""),
          rulingText: String(raw.comment ?? raw.text ?? "").trim(),
          parseFailure: reason,
          parserCorrectionOrExclusionReason: INTENTIONAL_RULING_EXCLUSIONS.has(reason)
            ? "Scryfall source row has empty ruling text — excluded intentionally"
            : "Unexpected parse failure",
        };
        intentionalExclusions.push(entry);
        if (!INTENTIONAL_RULING_EXCLUSIONS.has(reason)) unexplainedFailures += 1;
        return;
      }
      sourceByHash.set(result.ruling.contentHash, raw);
    },
  });

  const firestoreSnap = await db.collection(COLLECTIONS.catalogRulings).get();
  const persistedHashes = new Set<string>();
  const oracleIds = new Set<string>();
  let missingContentHash = 0;

  for (const doc of firestoreSnap.docs) {
    const data = doc.data() as { contentHash?: string; oracleId?: string };
    if (data.contentHash) persistedHashes.add(data.contentHash);
    else missingContentHash += 1;
    if (data.oracleId) oracleIds.add(data.oracleId);
  }

  const sourceHashes = new Set(sourceByHash.keys());
  const inSourceNotFirestore = [...sourceHashes].filter((h) => !persistedHashes.has(h));
  const inFirestoreNotSource = [...persistedHashes].filter((h) => !sourceHashes.has(h));

  const report = {
    generatedAt: importedAt,
    durationMs: Date.now() - started,
    bulkUpdatedAt: meta.updatedAt,
    contentHash,
    sourceRows: sourceRowCount,
    successfullyPersistedRows: firestoreSnap.size,
    intentionalExclusions: intentionalExclusions.length,
    unexplainedFailures,
    distinctOracleIds: oracleIds.size,
    duplicateRulingDetection: {
      sourceUniqueContentHashes: sourceHashes.size,
      firestoreUniqueContentHashes: persistedHashes.size,
      missingContentHashField: missingContentHash,
    },
    reconciliation: {
      inSourceNotFirestore: inSourceNotFirestore.length,
      inFirestoreNotSource: inFirestoreNotSource.length,
      coveragePct:
        sourceHashes.size > 0
          ? Math.round((persistedHashes.size / sourceHashes.size) * 10000) / 100
          : 100,
    },
    intentionalExclusionDetails: intentionalExclusions,
    targetZeroUnexplainedFailures: unexplainedFailures === 0,
  };

  const outPath = resolve(process.cwd(), "reports", "golden-catalog-rulings-reconciliation.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log("\nRulings reconciliation");
  console.log(`  source rows:              ${report.sourceRows}`);
  console.log(`  persisted:                ${report.successfullyPersistedRows}`);
  console.log(`  intentional exclusions:   ${report.intentionalExclusions}`);
  console.log(`  unexplained failures:     ${report.unexplainedFailures}`);
  console.log(`  distinct oracle IDs:      ${report.distinctOracleIds}`);
  console.log(`  zero unexplained:         ${report.targetZeroUnexplainedFailures}`);
  console.log(`\nReport: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
