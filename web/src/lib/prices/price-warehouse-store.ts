import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "../firebase/collections";
import { isCloudDeployment } from "../cloud-env";
import {
  isAdminConfigured,
  requireFirestore,
  FirestoreUnavailableError,
} from "../firebase/admin";
import type {
  CardPriceSnapshot,
  PriceChartingDailyReport,
  PriceChartingImportRun,
  PriceChartingProductCurrent,
} from "./types";

function dbOrMemory(): Firestore | null {
  if (isAdminConfigured()) return requireFirestore();
  if (isCloudDeployment()) {
    throw new FirestoreUnavailableError(
      "Firestore is required in cloud deployments.",
    );
  }
  return null;
}

type MemoryWarehouse = {
  products: Record<string, PriceChartingProductCurrent>;
  snapshots: Record<string, CardPriceSnapshot>;
  runs: Record<string, PriceChartingImportRun>;
};

const memory: MemoryWarehouse = {
  products: {},
  snapshots: {},
  runs: {},
};

const FIRESTORE_BATCH_SIZE = 400;

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

export const priceWarehouseStore = {
  async saveImportRun(run: PriceChartingImportRun): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.pricechartingImportRuns)
        .doc(run.id)
        .set(run, { merge: true });
      return;
    }
    memory.runs[run.id] = run;
  },

  async getImportRun(id: string): Promise<PriceChartingImportRun | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.pricechartingImportRuns)
        .doc(id)
        .get();
      return snap.exists ? (snap.data() as PriceChartingImportRun) : null;
    }
    return memory.runs[id] ?? null;
  },

  async hasSuccessfulImportForDate(
    capturedDate: string,
    importCategory?: string,
    fileName?: string,
  ): Promise<boolean> {
    const db = dbOrMemory();
    if (db) {
      let q = db
        .collection(COLLECTIONS.pricechartingImportRuns)
        .where("capturedDate", "==", capturedDate)
        .where("status", "==", "success");
      if (importCategory) {
        q = q.where("importCategory", "==", importCategory);
      }
      if (fileName) {
        q = q.where("fileName", "==", fileName);
      }
      const snap = await q.limit(1).get();
      return !snap.empty;
    }
    return Object.values(memory.runs).some(
      (r) =>
        r.capturedDate === capturedDate &&
        r.status === "success" &&
        (!importCategory || r.importCategory === importCategory) &&
        (!fileName || r.fileName === fileName),
    );
  },

  async upsertProducts(products: PriceChartingProductCurrent[]): Promise<number> {
    if (!products.length) return 0;
    const db = dbOrMemory();
    if (db) {
      let written = 0;
      for (let i = 0; i < products.length; i += FIRESTORE_BATCH_SIZE) {
        const batch = db.batch();
        const chunk = products.slice(i, i + FIRESTORE_BATCH_SIZE);
        for (const product of chunk) {
          batch.set(
            db
              .collection(COLLECTIONS.pricechartingProductsCurrent)
              .doc(product.priceChartingProductId),
            stripUndefined(product as unknown as Record<string, unknown>),
            { merge: true },
          );
        }
        await batch.commit();
        written += chunk.length;
      }
      return written;
    }
    for (const product of products) {
      memory.products[product.priceChartingProductId] = product;
    }
    return products.length;
  },

  async saveSnapshots(snapshots: CardPriceSnapshot[]): Promise<{
    written: number;
    skipped: number;
  }> {
    if (!snapshots.length) return { written: 0, skipped: 0 };
    const db = dbOrMemory();

    if (db) {
      let written = 0;
      for (let i = 0; i < snapshots.length; i += FIRESTORE_BATCH_SIZE) {
        const batch = db.batch();
        const chunk = snapshots.slice(i, i + FIRESTORE_BATCH_SIZE);
        for (const snapshot of chunk) {
          batch.set(
            db.collection(COLLECTIONS.cardPriceSnapshots).doc(snapshot.id),
            stripUndefined(snapshot as unknown as Record<string, unknown>),
            { merge: true },
          );
        }
        await batch.commit();
        written += chunk.length;
      }
      return { written, skipped: 0 };
    }

    for (const snapshot of snapshots) {
      memory.snapshots[snapshot.id] = snapshot;
    }
    return { written: snapshots.length, skipped: 0 };
  },

  async listSnapshotsByIdentityKey(
    identityKey: string,
  ): Promise<CardPriceSnapshot[]> {
    return this.listSnapshotsByIdentityKeys([identityKey]);
  },

  async listSnapshotsByIdentityKeys(
    identityKeys: string[],
  ): Promise<CardPriceSnapshot[]> {
    const uniqueKeys = [...new Set(identityKeys.filter(Boolean))];
    if (!uniqueKeys.length) return [];

    const db = dbOrMemory();
    const byId = new Map<string, CardPriceSnapshot>();

    if (db) {
      for (const key of uniqueKeys) {
        const snap = await db
          .collection(COLLECTIONS.cardPriceSnapshots)
          .where("identityKey", "==", key)
          .where("exactIdentityMatch", "==", true)
          .get();
        for (const doc of snap.docs) {
          const data = doc.data() as CardPriceSnapshot;
          byId.set(data.id, data);
        }
      }
    } else {
      for (const s of Object.values(memory.snapshots)) {
        if (uniqueKeys.includes(s.identityKey) && s.exactIdentityMatch === true) {
          byId.set(s.id, s);
        }
      }
    }

    return [...byId.values()].sort((a, b) =>
      a.capturedDate.localeCompare(b.capturedDate),
    );
  },

  /** Test helper — reset in-memory warehouse. */
  _resetMemoryForTests(): void {
    memory.products = {};
    memory.snapshots = {};
    memory.runs = {};
  },

  /** Test helper — seed in-memory snapshots. */
  _seedMemorySnapshots(snapshots: CardPriceSnapshot[]): void {
    for (const s of snapshots) memory.snapshots[s.id] = s;
  },

  async saveDailyReport(report: PriceChartingDailyReport): Promise<void> {
    const db = dbOrMemory();
    if (db) {
      await db
        .collection(COLLECTIONS.pricechartingDailyReports)
        .doc(report.date)
        .set(stripUndefined(report as unknown as Record<string, unknown>), { merge: true });
    }
  },

  async getDailyReport(date: string): Promise<PriceChartingDailyReport | null> {
    const db = dbOrMemory();
    if (db) {
      const snap = await db
        .collection(COLLECTIONS.pricechartingDailyReports)
        .doc(date)
        .get();
      return snap.exists ? (snap.data() as PriceChartingDailyReport) : null;
    }
    return null;
  },

  async getPreviousSuccessfulDailyReport(
    beforeDate: string,
  ): Promise<PriceChartingDailyReport | null> {
    const db = dbOrMemory();
    if (!db) return null;

    const snap = await db
      .collection(COLLECTIONS.pricechartingDailyReports)
      .orderBy("date", "desc")
      .limit(20)
      .get();

    for (const doc of snap.docs) {
      const data = doc.data() as PriceChartingDailyReport;
      if (data.date >= beforeDate) continue;
      if (data.status === "success" || data.status === "warning") return data;
    }
    return null;
  },

  async countSnapshotsForDate(capturedDate: string): Promise<number> {
    const db = dbOrMemory();
    if (db) {
      return (
        await db
          .collection(COLLECTIONS.cardPriceSnapshots)
          .where("capturedDate", "==", capturedDate)
          .where("exactIdentityMatch", "==", true)
          .count()
          .get()
      ).data().count;
    }
    return Object.values(memory.snapshots).filter(
      (s) => s.capturedDate === capturedDate && s.exactIdentityMatch === true,
    ).length;
  },
};
