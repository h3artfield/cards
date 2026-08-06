/**
 * Targeted backfill for reversible_card printings only — no per-doc existence scans.
 * Run: npx tsx scripts/backfill-reversible-printings.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { downloadBulkToCache, fetchBulkMetadata } from "../src/lib/deck-builder/golden-catalog/bulk-metadata";
import { streamJsonlFile } from "../src/lib/deck-builder/golden-catalog/stream-bulk-jsonl";
import { parsePrintingFromBulk } from "../src/lib/deck-builder/golden-catalog/parse-printing";
import { CATALOG_PRINTINGS_COLLECTION, toCatalogCard } from "../src/lib/deck-builder/golden-catalog/schemas";
import { FirestoreBatchWriter } from "../src/lib/deck-builder/golden-catalog/firestore-batch-writer";

loadEnvLocal();

async function main() {
  const started = Date.now();
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) process.exit(1);

  const db = await requireLocalFirestore("Firestore", () =>
    Promise.resolve(requireFirestore()),
  );

  const meta = await fetchBulkMetadata("default_cards");
  if (!meta) throw new Error("default_cards metadata unavailable");
  const { cachePath } = await downloadBulkToCache(meta);

  const expectedIds: string[] = [];
  const parsedIds: string[] = [];
  const writeFailures: Array<{ scryfallId: string; error: string }> = [];

  let recordsFound = 0;
  let recordsParsed = 0;

  await streamJsonlFile({
    cachePath,
    filter: (raw) => raw.layout === "reversible_card",
    onLine: async (raw) => {
      recordsFound += 1;
      const printing = parsePrintingFromBulk(raw, { bulkUpdatedAt: meta.updatedAt });
      if (!printing) return;
      recordsParsed += 1;
      expectedIds.push(printing.scryfallId);
      parsedIds.push(printing.scryfallId);
    },
  });

  const writer = new FirestoreBatchWriter(db, CATALOG_PRINTINGS_COLLECTION);
  let recordsWritten = 0;

  await streamJsonlFile({
    cachePath,
    filter: (raw) => raw.layout === "reversible_card",
    onLine: async (raw) => {
      const printing = parsePrintingFromBulk(raw, { bulkUpdatedAt: meta.updatedAt });
      if (!printing) return;
      try {
        await writer.enqueue(toCatalogCard(printing));
        recordsWritten += 1;
      } catch (err) {
        writeFailures.push({
          scryfallId: printing.scryfallId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
  });

  try {
    await writer.flush();
  } catch (err) {
    writeFailures.push({
      scryfallId: "(batch)",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const stats = writer.getStats();
  const finalMissing: string[] = [];
  for (const id of expectedIds) {
    const snap = await db.collection(CATALOG_PRINTINGS_COLLECTION).doc(id).get();
    if (!snap.exists) finalMissing.push(id);
  }

  const durationMs = Date.now() - started;
  const report = {
    generatedAt: new Date().toISOString(),
    recordsFound,
    recordsParsed,
    recordsWritten: stats.written,
    writeFailures,
    finalMissingIds: finalMissing,
    durationMs,
    durationSec: Math.round(durationMs / 1000),
    firestoreOps: {
      reads: finalMissing.length,
      writes: stats.written,
      batches: stats.batches,
      failedWrites: stats.failed,
    },
    expectedReversibleCount: expectedIds.length,
    coverageFormula: `${expectedIds.length - finalMissing.length}/${expectedIds.length} reversible_card IDs persisted`,
  };

  const outPath = resolve(process.cwd(), "reports", "reversible-card-backfill.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
