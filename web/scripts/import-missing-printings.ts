/**
 * Import printings present in bulk but missing from Firestore (post parser fix).
 * Run: npx --yes tsx scripts/import-missing-printings.ts
 */
import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { downloadBulkToCache, fetchBulkMetadata } from "../src/lib/deck-builder/golden-catalog/bulk-metadata";
import { streamJsonlFile } from "../src/lib/deck-builder/golden-catalog/stream-bulk-jsonl";
import { isPaperPrinting, parsePrintingFromBulk } from "../src/lib/deck-builder/golden-catalog/parse-printing";
import { CATALOG_PRINTINGS_COLLECTION, toCatalogCard } from "../src/lib/deck-builder/golden-catalog/schemas";
import { FirestoreBatchWriter } from "../src/lib/deck-builder/golden-catalog/firestore-batch-writer";

loadEnvLocal();

async function main() {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");
  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) process.exit(1);

  const db = await requireLocalFirestore("Firestore", () =>
    Promise.resolve(requireFirestore()),
  );
  const meta = await fetchBulkMetadata("default_cards");
  if (!meta) throw new Error("no bulk metadata");
  const { cachePath } = await downloadBulkToCache(meta);

  const writer = new FirestoreBatchWriter(db, CATALOG_PRINTINGS_COLLECTION);
  let scanned = 0;
  let imported = 0;
  let alreadyPresent = 0;

  await streamJsonlFile({
    cachePath,
    filter: isPaperPrinting,
    onLine: async (raw) => {
      scanned += 1;
      const printing = parsePrintingFromBulk(raw, { bulkUpdatedAt: meta.updatedAt });
      if (!printing) return;
      const ref = db.collection(CATALOG_PRINTINGS_COLLECTION).doc(printing.scryfallId);
      const snap = await ref.get();
      if (snap.exists) {
        alreadyPresent += 1;
        return;
      }
      await writer.enqueue(toCatalogCard(printing));
      imported += 1;
    },
  });
  await writer.flush();

  console.log({ scanned, alreadyPresent, imported, stats: writer.getStats() });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
