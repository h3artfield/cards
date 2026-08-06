import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "../../firebase/collections";
import { forFirestore } from "../../firebase/for-firestore";
import type { CardRuling } from "./schemas";
import {
  activateRulingsVersion,
  createRulingsVersion,
  getActiveRulingsVersionId,
  listVersionRulingIds,
  markVersionReconciled,
  versionRulingsRef,
} from "./rulings-versions";

/** Legacy flat staging — used only during import before version promotion. */
export function stagingCollection(db: Firestore) {
  return db.collection(COLLECTIONS.catalogRulingsStaging);
}

/** @deprecated Legacy live collection — readers must use active version pointer. */
export function liveCollection(db: Firestore) {
  return db.collection(COLLECTIONS.catalogRulings);
}

/**
 * Atomically promote a fully reconciled version.
 * Readers resolve catalogSyncState/global.activeRulingsVersionId and query only that
 * version's subcollection — they never observe a partially copied collection.
 */
export async function promoteVersionToActive(
  db: Firestore,
  versionId: string,
): Promise<{ previousVersionId: string | null; activeVersionId: string; rulingCount: number }> {
  const rulingIds = await listVersionRulingIds(db, versionId);
  if (!rulingIds.size) {
    throw new Error(`Version ${versionId} has no rulings — refusing activation`);
  }

  await markVersionReconciled(db, versionId, rulingIds.size);
  const { previousVersionId, activeVersionId } = await activateRulingsVersion(db, versionId);
  return {
    previousVersionId,
    activeVersionId,
    rulingCount: rulingIds.size,
  };
}

/** Copy reconciled staging run into an isolated version subcollection. */
export async function copyStagingRunToVersion(
  db: Firestore,
  runId: string,
  versionId: string,
  meta: { bulkUpdatedAt: string; bulkContentHash: string },
): Promise<number> {
  const stagingSnap = await stagingCollection(db).where("importRunId", "==", runId).get();
  if (!stagingSnap.size) {
    throw new Error(`No staging rulings found for run ${runId}`);
  }

  await createRulingsVersion(db, {
    versionId,
    importRunId: runId,
    bulkUpdatedAt: meta.bulkUpdatedAt,
    bulkContentHash: meta.bulkContentHash,
  });

  const batchSize = 500;
  const docs = stagingSnap.docs;
  let copied = 0;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + batchSize)) {
      const data = doc.data() as CardRuling & { importRunId?: string };
      const { importRunId: _run, ...ruling } = data;
      batch.set(versionRulingsRef(db, versionId).doc(ruling.id), forFirestore(ruling as CardRuling));
      copied += 1;
    }
    await batch.commit();
  }

  return copied;
}

export async function clearStagingRun(db: Firestore, runId: string): Promise<number> {
  const snap = await stagingCollection(db).where("importRunId", "==", runId).get();
  let deleted = 0;
  const batchSize = 500;
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const batch = db.batch();
    for (const doc of snap.docs.slice(i, i + batchSize)) {
      batch.delete(doc.ref);
      deleted += 1;
    }
    await batch.commit();
  }
  return deleted;
}

export async function countStagingRun(db: Firestore, runId: string): Promise<number> {
  const snap = await stagingCollection(db).where("importRunId", "==", runId).count().get();
  return snap.data().count;
}

export async function verifyVersionMatchesHashes(
  db: Firestore,
  versionId: string,
  expectedDocIds: Set<string>,
): Promise<{ missing: string[]; extra: string[] }> {
  const versionIds = await listVersionRulingIds(db, versionId);
  const missing = [...expectedDocIds].filter((id) => !versionIds.has(id));
  const extra = [...versionIds].filter((id) => !expectedDocIds.has(id));
  return { missing, extra };
}

export async function countActiveVersionRulings(db: Firestore): Promise<number> {
  const versionId = await getActiveRulingsVersionId(db);
  if (!versionId) return 0;
  const snap = await versionRulingsRef(db, versionId).count().get();
  return snap.data().count;
}
