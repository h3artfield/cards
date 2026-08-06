import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "../../firebase/collections";
import { forFirestore } from "../../firebase/for-firestore";
import type { CardRuling } from "./schemas";
import { RULINGS_SOURCE_VERSION } from "./parse-ruling";

export interface RulingsVersionMetadata {
  versionId: string;
  importRunId: string;
  status: "building" | "reconciled" | "active" | "superseded" | "failed";
  rulingCount: number;
  bulkUpdatedAt: string;
  bulkContentHash: string;
  sourceVersion: string;
  createdAt: string;
  reconciledAt?: string;
  activatedAt?: string;
}

export function versionDocRef(db: Firestore, versionId: string) {
  return db.collection(COLLECTIONS.catalogRulingsVersions).doc(versionId);
}

export function versionRulingsRef(db: Firestore, versionId: string) {
  return versionDocRef(db, versionId).collection("rulings");
}

export async function createRulingsVersion(
  db: Firestore,
  input: {
    versionId: string;
    importRunId: string;
    bulkUpdatedAt: string;
    bulkContentHash: string;
  },
): Promise<void> {
  const meta: RulingsVersionMetadata = {
    versionId: input.versionId,
    importRunId: input.importRunId,
    status: "building",
    rulingCount: 0,
    bulkUpdatedAt: input.bulkUpdatedAt,
    bulkContentHash: input.bulkContentHash,
    sourceVersion: RULINGS_SOURCE_VERSION,
    createdAt: new Date().toISOString(),
  };
  await versionDocRef(db, input.versionId).set(forFirestore(meta));
}

export async function markVersionReconciled(
  db: Firestore,
  versionId: string,
  rulingCount: number,
): Promise<void> {
  await versionDocRef(db, versionId).set(
    forFirestore({
      status: "reconciled",
      rulingCount,
      reconciledAt: new Date().toISOString(),
    }),
    { merge: true },
  );
}

/**
 * Atomically activate a reconciled version. Readers observe either the old
 * complete version or the new complete version — never a partial copy.
 */
export async function activateRulingsVersion(
  db: Firestore,
  versionId: string,
): Promise<{ previousVersionId: string | null; activeVersionId: string }> {
  let previousVersionId: string | null = null;

  await db.runTransaction(async (tx) => {
    const versionRef = versionDocRef(db, versionId);
    const versionSnap = await tx.get(versionRef);
    if (!versionSnap.exists) {
      throw new Error(`Rulings version ${versionId} not found`);
    }
    const version = versionSnap.data() as RulingsVersionMetadata;
    if (version.status !== "reconciled") {
      throw new Error(
        `Cannot activate version ${versionId}: status is ${version.status}, expected reconciled`,
      );
    }

    const globalRef = db.collection(COLLECTIONS.catalogSyncState).doc("global");
    const globalSnap = await tx.get(globalRef);
    previousVersionId =
      (globalSnap.data()?.activeRulingsVersionId as string | undefined) ?? null;

    if (previousVersionId && previousVersionId !== versionId) {
      tx.set(
        versionDocRef(db, previousVersionId),
        forFirestore({ status: "superseded" }),
        { merge: true },
      );
    }

    const activatedAt = new Date().toISOString();
    tx.set(
      versionRef,
      forFirestore({ status: "active", activatedAt }),
      { merge: true },
    );
    tx.set(
      globalRef,
      forFirestore({
        activeRulingsVersionId: versionId,
        previousRulingsVersionId: previousVersionId,
        rulingsImporterVersion: RULINGS_SOURCE_VERSION,
        activeRulingsDatasetVersion: versionId,
        catalogRulingCount: version.rulingCount,
        updatedAt: activatedAt,
      }),
      { merge: true },
    );
  });

  return { previousVersionId, activeVersionId: versionId };
}

export async function getActiveRulingsVersionId(db: Firestore): Promise<string | null> {
  const snap = await db.collection(COLLECTIONS.catalogSyncState).doc("global").get();
  return (snap.data()?.activeRulingsVersionId as string | undefined) ?? null;
}

export async function countVersionRulings(db: Firestore, versionId: string): Promise<number> {
  const snap = await versionRulingsRef(db, versionId).count().get();
  return snap.data().count;
}

export async function writeRulingToVersion(
  db: Firestore,
  versionId: string,
  ruling: CardRuling,
): Promise<void> {
  await versionRulingsRef(db, versionId).doc(ruling.id).set(forFirestore(ruling));
}

export async function getRulingsByOracleIdFromVersion(
  db: Firestore,
  versionId: string,
  oracleId: string,
  limit = 50,
): Promise<CardRuling[]> {
  const snap = await versionRulingsRef(db, versionId)
    .where("oracleId", "==", oracleId.trim())
    .limit(Math.min(limit, 100))
    .get();
  return snap.docs.map((d) => d.data() as CardRuling);
}

/** Readers always resolve active version first — never query without versionId. */
export async function getActiveRulingsByOracleId(
  db: Firestore,
  oracleId: string,
  limit = 50,
): Promise<CardRuling[]> {
  const versionId = await getActiveRulingsVersionId(db);
  if (!versionId) return [];
  return getRulingsByOracleIdFromVersion(db, versionId, oracleId, limit);
}

export async function listVersionRulingIds(
  db: Firestore,
  versionId: string,
): Promise<Set<string>> {
  const snap = await versionRulingsRef(db, versionId).select().get();
  return new Set(snap.docs.map((d) => d.id));
}
