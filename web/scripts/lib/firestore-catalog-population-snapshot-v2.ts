/**
 * Card-structure-aware Firestore population snapshot (v2).
 *
 * Study denominator = legitimate Magic-card Oracle identities (A + B + C),
 * not merely records with non-empty top-level oracle_text.
 */
import { createHash } from "node:crypto";
import { COLLECTIONS } from "../../src/lib/firebase/collections";
import type { GoldenCatalogOracleCard, GoldenCatalogSyncState } from "../../src/lib/deck-builder/golden-catalog/schemas";
import {
  combinedGoldenOracleText,
  goldenOracleTextHash,
  normalizeOracleTextForCompare,
} from "./load-golden-catalog-index";
import {
  buildCanonicalOracleInput,
  classifyCatalogPopulationRecord,
  type CatalogPopulationCategory,
} from "./catalog-population-classifier-v1";
import { classifyCatalogCardComplexity } from "./catalog-complexity-bucket-v1";

export type CatalogPopulationIdentityV2 = {
  oracleId: string;
  canonicalName: string;
  oracleTextHash: string;
  cardStructureHash: string;
  layout?: string;
  sourceVersion?: string;
  populationCategory: CatalogPopulationCategory;
  classificationReason: string;
  hasCombinedOracleText: boolean;
  parserEligible: boolean;
  studyPopulationEligible: boolean;
  complexityBucket?: string;
  exclusionReason?: string;
};

export type CatalogPopulationSnapshotV2 = {
  artifactType: "CatalogPopulationSnapshot";
  version: "catalog-population-snapshot-v2";
  snapshotAt: string;
  source: "firestore";
  collection: "catalogOracleCards";
  syncState: GoldenCatalogSyncState | null;
  firestoreTotalCatalogOracleCards: number;
  categoryCounts: Record<CatalogPopulationCategory, number>;
  legacyFrame: {
    version: "catalog-population-snapshot-v1";
    rule: "combinedGoldenOracleText non-empty";
    eligibleOracleIds: number;
    excludedOracleIds: number;
    note: "Preserved as top-level-text population shadow snapshot frame — not final eligibility model.",
  };
  correctedFrame: {
    rule: "card-structure-aware: categories A + B + C (legitimate Magic-card Oracle identities)";
    eligibleOracleIds: number;
    excludedOracleIds: number;
    outOfScopeCategoryD: number;
    malformedCategoryE: number;
  };
  duplicateOracleIds: number;
  eligibleOracleIds: number;
  excludedRecords: Array<{
    oracleId: string;
    canonicalName: string;
    category: CatalogPopulationCategory;
    reason: string;
  }>;
  catalogVersion: string;
  importVersion?: string;
  identities: CatalogPopulationIdentityV2[];
  populationHash: string;
  cardStructurePopulationHash: string;
  auditArtifact: "data/milestones/catalog-shadow/catalog-population-structure-audit-v1.json";
};

export type CatalogPopulationLoadResultV2 = {
  snapshot: CatalogPopulationSnapshotV2;
  eligibleRecords: Array<{
    oracleId: string;
    canonicalName: string;
    oracleText: string;
    layout?: string;
    cardFaces?: GoldenCatalogOracleCard["cardFaces"];
    sourceVersion?: string;
    oracleTextHash: string;
    cardStructureHash: string;
    populationCategory: CatalogPopulationCategory;
  }>;
  classifications: ReturnType<typeof classifyCatalogPopulationRecord>[];
};

function populationHash(identities: CatalogPopulationIdentityV2[]): string {
  const rows = identities
    .map(
      (i) =>
        `${i.oracleId}|${i.oracleTextHash}|${i.cardStructureHash}|${i.canonicalName}|${i.layout ?? ""}|${i.populationCategory}|${i.sourceVersion ?? ""}`,
    )
    .sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

function cardStructurePopulationHash(identities: CatalogPopulationIdentityV2[]): string {
  const rows = identities
    .filter((i) => i.studyPopulationEligible)
    .map((i) => `${i.oracleId}|${i.cardStructureHash}`)
    .sort();
  return createHash("sha256").update(rows.join("\n")).digest("hex");
}

export async function loadFirestoreCatalogPopulationSnapshotV2(): Promise<CatalogPopulationLoadResultV2> {
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

  for (const doc of snap.docs) {
    const card = doc.data() as GoldenCatalogOracleCard;
    const oracleId = card.oracleId ?? doc.id;
    if (byOracleId.has(oracleId)) {
      duplicateDocIds.push(oracleId);
      continue;
    }
    byOracleId.set(oracleId, { ...card, oracleId });
  }

  const classifications = [...byOracleId.values()]
    .sort((a, b) => a.oracleId.localeCompare(b.oracleId))
    .map((card) => classifyCatalogPopulationRecord(card));

  const categoryCounts: Record<CatalogPopulationCategory, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    E: 0,
  };
  for (const row of classifications) categoryCounts[row.category] += 1;

  let legacyEligible = 0;
  const excludedRecords: CatalogPopulationSnapshotV2["excludedRecords"] = [];

  const identities: CatalogPopulationIdentityV2[] = classifications.map((row) => {
    const card = byOracleId.get(row.oracleId)!;
    const oracleText = combinedGoldenOracleText(card);
    const hasCombinedOracleText = normalizeOracleTextForCompare(oracleText).length > 0;
    if (hasCombinedOracleText) legacyEligible += 1;

    const canonical = buildCanonicalOracleInput(card);
    const { bucket } = classifyCatalogCardComplexity({ oracleText, layout: card.layout });

    if (!row.studyPopulationEligible) {
      excludedRecords.push({
        oracleId: row.oracleId,
        canonicalName: row.canonicalName,
        category: row.category,
        reason: row.reason,
      });
    }

    return {
      oracleId: row.oracleId,
      canonicalName: row.canonicalName,
      oracleTextHash: goldenOracleTextHash(oracleText),
      cardStructureHash: canonical.cardStructureHash,
      layout: row.layout,
      sourceVersion: card.sourceVersion,
      populationCategory: row.category,
      classificationReason: row.reason,
      hasCombinedOracleText,
      parserEligible: row.parserEligible,
      studyPopulationEligible: row.studyPopulationEligible,
      complexityBucket: bucket,
      exclusionReason: row.studyPopulationEligible ? undefined : row.reason,
    };
  });

  const eligibleRecords = classifications
    .filter((row) => row.studyPopulationEligible)
    .map((row) => {
      const card = byOracleId.get(row.oracleId)!;
      const oracleText = combinedGoldenOracleText(card);
      const canonical = buildCanonicalOracleInput(card);
      return {
        oracleId: row.oracleId,
        canonicalName: row.canonicalName,
        oracleText,
        layout: row.layout,
        cardFaces: card.cardFaces,
        sourceVersion: card.sourceVersion,
        oracleTextHash: goldenOracleTextHash(oracleText),
        cardStructureHash: canonical.cardStructureHash,
        populationCategory: row.category,
      };
    });

  const catalogVersion =
    syncState?.oracleCardsBulkUpdatedAt ??
    eligibleRecords.find((r) => r.sourceVersion)?.sourceVersion ??
    "unknown";

  const snapshot: CatalogPopulationSnapshotV2 = {
    artifactType: "CatalogPopulationSnapshot",
    version: "catalog-population-snapshot-v2",
    snapshotAt: new Date().toISOString(),
    source: "firestore",
    collection: "catalogOracleCards",
    syncState,
    firestoreTotalCatalogOracleCards: firestoreTotal,
    categoryCounts,
    legacyFrame: {
      version: "catalog-population-snapshot-v1",
      rule: "combinedGoldenOracleText non-empty",
      eligibleOracleIds: legacyEligible,
      excludedOracleIds: byOracleId.size - legacyEligible,
      note: "Preserved as top-level-text population shadow snapshot frame — not final eligibility model.",
    },
    correctedFrame: {
      rule: "card-structure-aware: categories A + B + C (legitimate Magic-card Oracle identities)",
      eligibleOracleIds: eligibleRecords.length,
      excludedOracleIds: byOracleId.size - eligibleRecords.length,
      outOfScopeCategoryD: categoryCounts.D,
      malformedCategoryE: categoryCounts.E,
    },
    duplicateOracleIds: duplicateDocIds.length,
    eligibleOracleIds: eligibleRecords.length,
    excludedRecords: excludedRecords.sort((a, b) => a.oracleId.localeCompare(b.oracleId)),
    catalogVersion,
    importVersion: syncState?.lastImportCompletedAt,
    identities,
    populationHash: populationHash(identities),
    cardStructurePopulationHash: cardStructurePopulationHash(identities),
    auditArtifact: "data/milestones/catalog-shadow/catalog-population-structure-audit-v1.json",
  };

  return { snapshot, eligibleRecords, classifications };
}
