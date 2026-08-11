/**
 * Authoritative Firestore catalogOracleCards population snapshot.
 */
import { createHash } from "node:crypto";
import { COLLECTIONS } from "../../src/lib/firebase/collections";
import type { GoldenCatalogOracleCard, GoldenCatalogSyncState } from "../../src/lib/deck-builder/golden-catalog/schemas";
import {
  combinedGoldenOracleText,
  goldenOracleTextHash,
  normalizeOracleTextForCompare,
} from "./load-golden-catalog-index";
import { classifyCatalogCardComplexity } from "./catalog-complexity-bucket-v1";

export type CatalogPopulationIdentity = {
  oracleId: string;
  canonicalName: string;
  oracleTextHash: string;
  layout?: string;
  sourceVersion?: string;
  hasOracleText: boolean;
  exclusionReason?: string;
  complexityBucket?: string;
};

export type CatalogPopulationSnapshot = {
  artifactType: "CatalogPopulationSnapshot";
  version: "catalog-population-snapshot-v1";
  snapshotAt: string;
  source: "firestore";
  collection: "catalogOracleCards";
  syncState: GoldenCatalogSyncState | null;
  firestoreTotalCatalogOracleCards: number;
  recordsWithOracleText: number;
  recordsWithoutOracleText: number;
  duplicateOracleIds: number;
  eligibleOracleIds: number;
  excludedRecords: Array<{ oracleId: string; canonicalName: string; reason: string }>;
  catalogVersion: string;
  importVersion?: string;
  identities: CatalogPopulationIdentity[];
  populationHash: string;
};

export type CatalogPopulationLoadResult = {
  snapshot: CatalogPopulationSnapshot;
  eligibleRecords: Array<{
    oracleId: string;
    canonicalName: string;
    oracleText: string;
    layout?: string;
    cardFaces?: GoldenCatalogOracleCard["cardFaces"];
    sourceVersion?: string;
    oracleTextHash: string;
  }>;
};

function populationHash(identities: CatalogPopulationIdentity[]): string {
  const rows = identities
    .map((i) => `${i.oracleId}|${i.oracleTextHash}|${i.canonicalName}|${i.layout ?? ""}|${i.sourceVersion ?? ""}`)
    .sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

export async function loadFirestoreCatalogPopulationSnapshot(): Promise<CatalogPopulationLoadResult> {
  const { ensureFirebaseAdmin, requireFirestore, isAdminConfigured } =
    await import("../../src/lib/firebase/admin");

  if (!ensureFirebaseAdmin().initialized || !isAdminConfigured()) {
    throw new Error("Firestore required. Run npm run firestore:health.");
  }

  const { withFirestoreScriptTimeout } = await import("./firestore-fail-fast");
  const db = await withFirestoreScriptTimeout("requireFirestore", () =>
    Promise.resolve(requireFirestore()),
  );

  const syncSnap = await withFirestoreScriptTimeout(
    "catalogSyncState get",
    () => db.collection(COLLECTIONS.catalogSyncState).doc("global").get(),
    30_000,
  );
  const syncState = syncSnap.exists ? (syncSnap.data() as GoldenCatalogSyncState) : null;

  const countSnap = await withFirestoreScriptTimeout(
    "catalogOracleCards count",
    () => db.collection(COLLECTIONS.catalogOracleCards).count().get(),
    60_000,
  );
  const firestoreTotal = countSnap.data().count;

  const snap = await withFirestoreScriptTimeout(
    "catalogOracleCards get",
    () => db.collection(COLLECTIONS.catalogOracleCards).get(),
    180_000,
  );

  const byOracleId = new Map<string, GoldenCatalogOracleCard>();
  const duplicateDocIds: string[] = [];
  const excludedRecords: CatalogPopulationSnapshot["excludedRecords"] = [];
  let recordsWithOracleText = 0;
  let recordsWithoutOracleText = 0;

  for (const doc of snap.docs) {
    const card = doc.data() as GoldenCatalogOracleCard;
    const oracleId = card.oracleId ?? doc.id;
    if (byOracleId.has(oracleId)) {
      duplicateDocIds.push(oracleId);
      continue;
    }
    byOracleId.set(oracleId, { ...card, oracleId });

    const oracleText = combinedGoldenOracleText(card);
    const hasText = normalizeOracleTextForCompare(oracleText).length > 0;
    if (hasText) recordsWithOracleText += 1;
    else {
      recordsWithoutOracleText += 1;
      excludedRecords.push({
        oracleId,
        canonicalName: card.canonicalName ?? oracleId,
        reason: "no_oracle_text",
      });
    }
  }

  const identities: CatalogPopulationIdentity[] = [...byOracleId.values()]
    .map((card) => {
      const oracleText = combinedGoldenOracleText(card);
      const hasOracleText = normalizeOracleTextForCompare(oracleText).length > 0;
      const { bucket } = classifyCatalogCardComplexity({ oracleText, layout: card.layout });
      return {
        oracleId: card.oracleId,
        canonicalName: card.canonicalName,
        oracleTextHash: goldenOracleTextHash(oracleText),
        layout: card.layout,
        sourceVersion: card.sourceVersion,
        hasOracleText,
        exclusionReason: hasOracleText ? undefined : "no_oracle_text",
        complexityBucket: bucket,
      };
    })
    .sort((a, b) => a.oracleId.localeCompare(b.oracleId));

  const eligibleRecords = [...byOracleId.values()]
    .filter((card) => normalizeOracleTextForCompare(combinedGoldenOracleText(card)).length > 0)
    .sort((a, b) => a.oracleId.localeCompare(b.oracleId))
    .map((card) => {
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
    });

  const catalogVersion =
    syncState?.oracleCardsBulkUpdatedAt ??
    eligibleRecords.find((r) => r.sourceVersion)?.sourceVersion ??
    "unknown";

  const snapshot: CatalogPopulationSnapshot = {
    artifactType: "CatalogPopulationSnapshot",
    version: "catalog-population-snapshot-v1",
    snapshotAt: new Date().toISOString(),
    source: "firestore",
    collection: "catalogOracleCards",
    syncState,
    firestoreTotalCatalogOracleCards: firestoreTotal,
    recordsWithOracleText,
    recordsWithoutOracleText,
    duplicateOracleIds: duplicateDocIds.length,
    eligibleOracleIds: eligibleRecords.length,
    excludedRecords: excludedRecords.sort((a, b) => a.oracleId.localeCompare(b.oracleId)),
    catalogVersion,
    importVersion: syncState?.lastImportCompletedAt,
    identities,
    populationHash: populationHash(identities),
  };

  return { snapshot, eligibleRecords };
}
