/**
 * Oracle tag join audit — distinguish tagged vs no source tags vs join failures.
 * Run: npx --yes tsx scripts/audit-oracle-tags.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnvLocal } from "./lib/script-env";
import { requireLocalFirestore } from "./lib/firestore-fail-fast";
import { downloadBulkToCache, fetchBulkMetadata } from "../src/lib/deck-builder/golden-catalog/bulk-metadata";
import { streamOracleTagsFile } from "../src/lib/deck-builder/golden-catalog/stream-bulk-jsonl";
import { buildOracleTagsIndexFromEntries } from "../src/lib/deck-builder/scryfall-oracle-tags";
import { COLLECTIONS } from "../src/lib/firebase/collections";

loadEnvLocal();

async function main() {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../src/lib/firebase/admin");

  const meta = await fetchBulkMetadata("oracle_tags");
  if (!meta) throw new Error("oracle_tags metadata unavailable");
  const { cachePath } = await downloadBulkToCache(meta);

  const entries: Record<string, unknown>[] = [];
  await streamOracleTagsFile({
    cachePath,
    onEntry: (entry) => entries.push(entry),
  });

  const index = buildOracleTagsIndexFromEntries(
    entries as Parameters<typeof buildOracleTagsIndexFromEntries>[0],
  );
  const tagSourceOracleIds = new Set(index.byOracleId.keys());

  let firestoreOracleCount = 0;
  let taggedInFirestore = 0;
  let noTagsInSource = 0;
  let joinFailed = 0;
  let notProcessed = 0;
  let tagRefsUnknownOracle = 0;

  if (ensureFirebaseAdmin().initialized && isAdminConfigured()) {
    const db = await requireLocalFirestore("Firestore", () =>
      Promise.resolve(requireFirestore()),
    );
    const knownOracleIds = new Set<string>();
    const snap = await db.collection(COLLECTIONS.catalogOracleCards).get();
    firestoreOracleCount = snap.size;

    for (const doc of snap.docs) {
      knownOracleIds.add(doc.id);
      const data = doc.data();
      const tags = (data.oracleTags as string[] | undefined) ?? [];
      const status = data.oracleTagStatus as string | undefined;

      if (tags.length > 0) {
        taggedInFirestore += 1;
      } else if (tagSourceOracleIds.has(doc.id)) {
        joinFailed += 1;
      } else if (status === "no_tags_in_source") {
        noTagsInSource += 1;
      } else if (status === "not_processed") {
        notProcessed += 1;
      } else {
        noTagsInSource += 1;
      }
    }

    for (const oracleId of tagSourceOracleIds) {
      if (!knownOracleIds.has(oracleId)) tagRefsUnknownOracle += 1;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    tagSourceEntryCount: entries.length,
    oracleIdsInTagDataset: tagSourceOracleIds.size,
    firestoreOracleCount,
    taggedInFirestore,
    noTagsInSource,
    joinFailed,
    notProcessed,
    tagRefsUnknownOracle,
    coverageFormula:
      firestoreOracleCount > 0
        ? `taggedInFirestore (${taggedInFirestore}) / firestoreOracleCount (${firestoreOracleCount}) = ${(
            (taggedInFirestore / firestoreOracleCount) *
            100
          ).toFixed(2)}%`
        : "Firestore unavailable",
    legitimatelyUntaggedEstimate: firestoreOracleCount - taggedInFirestore - joinFailed,
  };

  const outPath = resolve(process.cwd(), "reports", "oracle-tags-join-audit.json");
  mkdirSync(resolve(outPath, ".."), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport: ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
