/** Firestore-backed persistence for bulk Shopify export jobs. */
import { randomUUID } from "node:crypto";
import { getAdminFirestore } from "../firebase/admin";
import { COLLECTIONS } from "../firebase/collections";
import { EXPORT_JOB_LEASE_MS, isExportJobLeaseHeld } from "./export-job-math";
import type { ShopifyExportJob } from "./export-job-types";

const memoryJobs = new Map<string, ShopifyExportJob>();

function nowIso(): string {
  return new Date().toISOString();
}

/** Firestore rejects undefined, and optional job fields are frequently unset. */
function forFirestore(job: ShopifyExportJob): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(job).filter(([, value]) => value !== undefined),
  );
}

export function buildExportJob(input: {
  storeId: string;
  batchSize: number;
  totalEligible: number;
  startedBy?: string;
}): ShopifyExportJob {
  const at = nowIso();
  return {
    id: randomUUID(),
    storeId: input.storeId,
    status: "running",
    batchSize: input.batchSize,
    totalEligible: input.totalEligible,
    exported: 0,
    failed: 0,
    failureStreak: 0,
    failures: [],
    startedAt: at,
    updatedAt: at,
    startedBy: input.startedBy,
  };
}

export async function saveExportJob(job: ShopifyExportJob): Promise<void> {
  memoryJobs.set(job.id, job);
  const db = getAdminFirestore();
  if (!db) return;
  await db
    .collection(COLLECTIONS.shopifyExportJobs)
    .doc(job.id)
    .set(forFirestore(job), { merge: true });
}

export async function getExportJob(
  jobId: string,
): Promise<ShopifyExportJob | null> {
  const db = getAdminFirestore();
  if (!db) return memoryJobs.get(jobId) ?? null;
  const snap = await db
    .collection(COLLECTIONS.shopifyExportJobs)
    .doc(jobId)
    .get();
  if (!snap.exists) return memoryJobs.get(jobId) ?? null;
  const job = snap.data() as ShopifyExportJob;
  memoryJobs.set(job.id, job);
  return job;
}

export async function getLatestExportJob(
  storeId: string,
): Promise<ShopifyExportJob | null> {
  const db = getAdminFirestore();
  if (!db) {
    const jobs = [...memoryJobs.values()].filter((j) => j.storeId === storeId);
    return sortNewestFirst(jobs)[0] ?? null;
  }
  // Sorted in memory so this needs no composite index on (storeId, startedAt).
  const snap = await db
    .collection(COLLECTIONS.shopifyExportJobs)
    .where("storeId", "==", storeId)
    .limit(25)
    .get();
  const jobs = snap.docs.map((d) => d.data() as ShopifyExportJob);
  for (const job of jobs) memoryJobs.set(job.id, job);
  return sortNewestFirst(jobs)[0] ?? null;
}

function sortNewestFirst(jobs: ShopifyExportJob[]): ShopifyExportJob[] {
  return [...jobs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

/**
 * Take exclusive ownership of the next chunk. Returns null when the job is
 * finished or another caller already holds the lease.
 */
export async function acquireExportJobLease(
  jobId: string,
): Promise<ShopifyExportJob | null> {
  const leaseUntil = new Date(Date.now() + EXPORT_JOB_LEASE_MS).toISOString();
  const db = getAdminFirestore();

  if (!db) {
    const job = memoryJobs.get(jobId);
    if (!job || job.status !== "running" || isExportJobLeaseHeld(job)) {
      return null;
    }
    const leased = { ...job, leaseUntil, updatedAt: nowIso() };
    memoryJobs.set(jobId, leased);
    return leased;
  }

  const ref = db.collection(COLLECTIONS.shopifyExportJobs).doc(jobId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    const job = snap.data() as ShopifyExportJob;
    if (job.status !== "running" || isExportJobLeaseHeld(job)) return null;
    tx.update(ref, { leaseUntil, updatedAt: nowIso() });
    const leased: ShopifyExportJob = { ...job, leaseUntil };
    memoryJobs.set(job.id, leased);
    return leased;
  });
}

export async function requestExportJobCancel(
  jobId: string,
): Promise<ShopifyExportJob | null> {
  const job = await getExportJob(jobId);
  if (!job || job.status !== "running") return job;
  const updated: ShopifyExportJob = {
    ...job,
    cancelRequested: true,
    updatedAt: nowIso(),
  };
  await saveExportJob(updated);
  return updated;
}
