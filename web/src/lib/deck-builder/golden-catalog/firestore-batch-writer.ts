import type { Firestore } from "firebase-admin/firestore";
import { forFirestore } from "../../firebase/for-firestore";

const MAX_BATCH = 500;

export interface BatchWriteStats {
  written: number;
  batches: number;
  failed: number;
}

export class FirestoreBatchWriter<T extends { id: string }> {
  private pending: Array<{ id: string; data: T }> = [];
  private stats: BatchWriteStats = { written: 0, batches: 0, failed: 0 };

  constructor(
    private db: Firestore,
    private collectionPath: string,
    private dryRun = false,
  ) {}

  getStats(): BatchWriteStats {
    return { ...this.stats };
  }

  async enqueue(doc: T): Promise<void> {
    this.pending.push({ id: doc.id, data: doc });
    if (this.pending.length >= MAX_BATCH) {
      await this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.pending.length) return;
    const chunk = this.pending.splice(0, MAX_BATCH);
    if (this.dryRun) {
      this.stats.written += chunk.length;
      return;
    }

    const batch = this.db.batch();
    for (const item of chunk) {
      const ref = this.db.collection(this.collectionPath).doc(item.id);
      batch.set(ref, forFirestore(item.data), { merge: true });
    }
    try {
      await batch.commit();
      this.stats.written += chunk.length;
      this.stats.batches += 1;
    } catch {
      this.stats.failed += chunk.length;
      throw new Error(
        `Firestore batch write failed for ${this.collectionPath} (${chunk.length} docs)`,
      );
    }
  }
}

export async function countCollection(
  db: Firestore,
  collectionPath: string,
): Promise<number> {
  const snap = await db.collection(collectionPath).count().get();
  return snap.data().count;
}

export async function sampleDoc<T>(
  db: Firestore,
  collectionPath: string,
): Promise<T | null> {
  const snap = await db.collection(collectionPath).limit(1).get();
  return snap.docs[0]?.data() as T | undefined ?? null;
}
