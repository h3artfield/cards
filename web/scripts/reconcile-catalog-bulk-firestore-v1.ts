/**
 * Deterministic bulk-cache vs Firestore identity reconciliation.
 *
 * Run: cd web && npx tsx scripts/reconcile-catalog-bulk-firestore-v1.ts
 */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { loadCatalogOracleRecordsFromBulkCache } from "./lib/load-catalog-oracle-records-v1";
import { loadEnvLocal } from "./lib/script-env";
import { loadFirestoreCatalogPopulationSnapshot } from "./lib/firestore-catalog-population-snapshot-v1";

loadEnvLocal();

const OUT_DIR = "data/milestones/catalog-shadow";
const BULK_MANIFEST = "data/milestones/catalog-shadow/catalog-shadow-parse-rc8-75ce13bb133f5fde-manifest.json";

type IdentityRow = {
  oracleId: string;
  oracleTextHash: string;
  canonicalName: string;
  layout?: string;
  sourceVersion?: string;
};

function indexById(rows: IdentityRow[]): Map<string, IdentityRow> {
  return new Map(rows.map((r) => [r.oracleId, r]));
}

import { loadEnvLocal } from "./lib/script-env";

loadEnvLocal();

async function main() {
  const bulk = await loadCatalogOracleRecordsFromBulkCache({});
  const { snapshot, eligibleRecords } = await loadFirestoreCatalogPopulationSnapshot();

  const bulkById = indexById(
    bulk.records.map((r) => ({
      oracleId: r.oracleId,
      oracleTextHash: r.oracleTextHash,
      canonicalName: r.canonicalName,
      layout: r.layout,
      sourceVersion: r.sourceVersion,
    })),
  );
  const firestoreById = indexById(
    eligibleRecords.map((r) => ({
      oracleId: r.oracleId,
      oracleTextHash: r.oracleTextHash,
      canonicalName: r.canonicalName,
      layout: r.layout,
      sourceVersion: r.sourceVersion,
    })),
  );

  const bulkIds = new Set(bulkById.keys());
  const firestoreIds = new Set(firestoreById.keys());
  const inBoth: string[] = [];
  const onlyBulk: string[] = [];
  const onlyFirestore: string[] = [];
  const textHashDiffs: Array<{
    oracleId: string;
    bulk: IdentityRow;
    firestore: IdentityRow;
    nameDiff: boolean;
    layoutDiff: boolean;
    sourceVersionDiff: boolean;
  }> = [];

  for (const id of [...bulkIds].sort()) {
    if (firestoreIds.has(id)) inBoth.push(id);
    else onlyBulk.push(id);
  }
  for (const id of [...firestoreIds].sort()) {
    if (!bulkIds.has(id)) onlyFirestore.push(id);
  }

  for (const id of inBoth) {
    const b = bulkById.get(id)!;
    const f = firestoreById.get(id)!;
    const textHashDiff = b.oracleTextHash !== f.oracleTextHash;
    const nameDiff = b.canonicalName !== f.canonicalName;
    const layoutDiff = b.layout !== f.layout;
    const sourceVersionDiff = b.sourceVersion !== f.sourceVersion;
    if (textHashDiff || nameDiff || layoutDiff || sourceVersionDiff) {
      if (textHashDiff || nameDiff || layoutDiff) {
        textHashDiffs.push({
          oracleId: id,
          bulk: b,
          firestore: f,
          nameDiff,
          layoutDiff,
          sourceVersionDiff,
        });
      }
    }
  }

  const sourceVersionOnlyDiffCount = inBoth.filter((id) => {
    const b = bulkById.get(id)!;
    const f = firestoreById.get(id)!;
    return (
      b.sourceVersion !== f.sourceVersion &&
      b.oracleTextHash === f.oracleTextHash &&
      b.canonicalName === f.canonicalName &&
      b.layout === f.layout
    );
  }).length;

  const report = {
    artifactType: "CatalogBulkFirestoreReconciliation",
    version: "catalog-bulk-firestore-reconciliation-v1",
    reconciledAt: new Date().toISOString(),
    bulkManifest: BULK_MANIFEST,
    bulkCachePath: bulk.sourceDetail,
    bulkRecordCount: bulk.records.length,
    firestorePopulationSnapshot: "data/milestones/catalog-shadow/catalog-population-snapshot-firestore-v1.json",
    firestoreTotalCatalogOracleCards: snapshot.firestoreTotalCatalogOracleCards,
    firestoreEligibleOracleIds: snapshot.eligibleOracleIds,
    firestoreExcludedNoOracleText: snapshot.recordsWithoutOracleText,
    firestoreDuplicateOracleIds: snapshot.duplicateOracleIds,
    counts: {
      inBoth: inBoth.length,
      onlyInBulkCache: onlyBulk.length,
      onlyInFirestore: onlyFirestore.length,
      sharedWithTextHashDiff: textHashDiffs.filter((d) => d.bulk.oracleTextHash !== d.firestore.oracleTextHash).length,
      sharedWithNameOrLayoutDiff: textHashDiffs.filter((d) => d.nameDiff || d.layoutDiff).length,
      sharedWithSourceVersionOnlyDiff: sourceVersionOnlyDiffCount,
    },
    onlyInBulkCache: onlyBulk,
    onlyInFirestore: onlyFirestore,
    sharedTextOrMetadataDiffs: textHashDiffs,
    populationHash: snapshot.populationHash,
    reconciliationHash: createHash("sha256")
      .update(JSON.stringify({ inBoth: inBoth.length, onlyBulk, onlyFirestore, textHashDiffs: textHashDiffs.length }))
      .digest("hex"),
    interpretationGuide: {
      onlyInBulkCache: "Likely stale Scryfall bulk cache and/or bulk rows filtered differently at import",
      onlyInFirestore: "Newer catalog imports not yet in local bulk cache",
      sharedTextHashDiff: "Same oracleId but oracle text changed between bulk snapshot and Firestore golden catalog",
      authoritativePopulationFrame: "Firestore eligibleOracleIds",
    },
  };

  mkdirSync(resolve(OUT_DIR), { recursive: true });
  const outPath = resolve(OUT_DIR, "catalog-bulk-firestore-reconciliation-v1.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ outPath, counts: report.counts, firestoreEligible: snapshot.eligibleOracleIds, bulkCount: bulk.records.length }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
