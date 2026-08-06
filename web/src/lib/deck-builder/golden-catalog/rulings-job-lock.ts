import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { COLLECTIONS } from "../../firebase/collections";
import { forFirestore } from "../../firebase/for-firestore";

export type RulingsJobType = "import" | "reset" | "deduplicate" | "reconcile" | "switch";

export interface RulingsJobLockRecord {
  runId: string;
  jobType: RulingsJobType;
  status: "running" | "completed" | "failed";
  startedAt: string;
  heartbeatAt: string;
  completedAt?: string;
  pid: number;
  hostname: string;
  message?: string;
}

export interface RulingsLockAuditEntry {
  clearedAt: string;
  previousLock: RulingsJobLockRecord;
  reason: "stale_heartbeat_timeout";
  staleAfterMs: number;
}

const LOCK_DOC = "rulingsJobLock";
const AUDIT_DOC = "rulingsJobLockAudit";
/** Stale locks may be cleared only after this timeout with an audit entry. */
export const RULINGS_JOB_STALE_MS = 30 * 60 * 1000;

export function isRulingsJobLockStale(
  lock: RulingsJobLockRecord,
  nowMs: number,
): boolean {
  const heartbeat = Date.parse(lock.heartbeatAt);
  return lock.status === "running" && nowMs - heartbeat > RULINGS_JOB_STALE_MS;
}

export class RulingsJobLockError extends Error {
  constructor(
    message: string,
    readonly code: "lock_held" | "lock_conflict",
    readonly activeLock?: RulingsJobLockRecord,
  ) {
    super(message);
    this.name = "RulingsJobLockError";
  }
}

function lockRef(db: Firestore) {
  return db.collection(COLLECTIONS.catalogSyncState).doc(LOCK_DOC);
}

function auditRef(db: Firestore) {
  return db.collection(COLLECTIONS.catalogSyncState).doc(AUDIT_DOC);
}

function isStale(lock: RulingsJobLockRecord, nowMs: number): boolean {
  return isRulingsJobLockStale(lock, nowMs);
}

export async function readRulingsJobLock(db: Firestore): Promise<RulingsJobLockRecord | null> {
  const snap = await lockRef(db).get();
  return snap.exists ? (snap.data() as RulingsJobLockRecord) : null;
}

/** Acquire exclusive rulings mutation lock. Refuses if another job is active. */
export async function acquireRulingsJobLock(
  db: Firestore,
  jobType: RulingsJobType,
): Promise<{ runId: string; release: (status: "completed" | "failed", message?: string) => Promise<void> }> {
  const runId = randomUUID();
  const now = new Date().toISOString();
  const nowMs = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef(db));
    const existing = snap.exists ? (snap.data() as RulingsJobLockRecord) : null;

    if (existing?.status === "running") {
      if (!isStale(existing, nowMs)) {
        throw new RulingsJobLockError(
          `Rulings job already active: ${existing.jobType} run ${existing.runId} since ${existing.startedAt}`,
          "lock_held",
          existing,
        );
      }

      const auditEntry: RulingsLockAuditEntry = {
        clearedAt: now,
        previousLock: existing,
        reason: "stale_heartbeat_timeout",
        staleAfterMs: RULINGS_JOB_STALE_MS,
      };
      const auditSnap = await tx.get(auditRef(db));
      const prior = (auditSnap.data()?.entries as RulingsLockAuditEntry[] | undefined) ?? [];
      tx.set(auditRef(db), forFirestore({ entries: [...prior, auditEntry].slice(-50) }), { merge: true });
    }

    const record: RulingsJobLockRecord = {
      runId,
      jobType,
      status: "running",
      startedAt: now,
      heartbeatAt: now,
      pid: process.pid,
      hostname: process.env.COMPUTERNAME ?? process.env.HOSTNAME ?? "unknown",
    };
    tx.set(lockRef(db), forFirestore(record));
  });

  let heartbeatTimer: ReturnType<typeof setInterval> | undefined = setInterval(() => {
    void lockRef(db).set(forFirestore({ heartbeatAt: new Date().toISOString() }), { merge: true });
  }, 60_000);

  const release = async (status: "completed" | "failed", message?: string) => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = undefined;
    }
    await lockRef(db).set(
      forFirestore({
        status,
        completedAt: new Date().toISOString(),
        heartbeatAt: new Date().toISOString(),
        message,
      }),
      { merge: true },
    );
  };

  return { runId, release };
}

export async function assertNoActiveRulingsJob(db: Firestore): Promise<void> {
  const lock = await readRulingsJobLock(db);
  if (lock?.status === "running" && !isStale(lock, Date.now())) {
    throw new RulingsJobLockError(
      `Refusing: rulings job ${lock.jobType} (${lock.runId}) is active since ${lock.startedAt}`,
      "lock_held",
      lock,
    );
  }
}
