/**
 * Rulings import concurrency and atomic promotion regression tests.
 * Run: npx tsx scripts/test-rulings-concurrency.ts
 */
import type { Firestore } from "firebase-admin/firestore";
import assert from "node:assert/strict";
import {
  acquireRulingsJobLock,
  assertNoActiveRulingsJob,
  isRulingsJobLockStale,
  RULINGS_JOB_STALE_MS,
  RulingsJobLockError,
  type RulingsJobLockRecord,
  type RulingsJobType,
} from "../src/lib/deck-builder/golden-catalog/rulings-job-lock";
import {
  activateRulingsVersion,
  createRulingsVersion,
  getActiveRulingsVersionId,
  markVersionReconciled,
  versionDocRef,
  versionRulingsRef,
} from "../src/lib/deck-builder/golden-catalog/rulings-versions";

type DocData = Record<string, unknown>;

class MockTransaction {
  private reads = new Map<string, DocData | null>();
  private writes = new Map<string, DocData>();

  constructor(private store: MockFirestore) {}

  async get(ref: MockDocRef): Promise<{ exists: boolean; data: () => DocData | undefined }> {
    const key = ref.path;
    const data = this.reads.has(key)
      ? this.reads.get(key)
      : this.store.getDoc(key);
    this.reads.set(key, data ?? null);
    return {
      exists: data != null,
      data: () => (data ?? undefined) as DocData | undefined,
    };
  }

  set(ref: MockDocRef, data: DocData, opts?: { merge?: boolean }) {
    const key = ref.path;
    const existing = this.reads.get(key) ?? this.store.getDoc(key);
    this.writes.set(
      key,
      opts?.merge && existing ? { ...existing, ...data } : { ...data },
    );
  }
}

class MockDocRef {
  constructor(
    readonly db: MockFirestore,
    readonly path: string,
  ) {}

  collection(name: string): MockCollectionRef {
    return new MockCollectionRef(this.db, `${this.path}/${name}`);
  }

  async set(data: DocData, opts?: { merge?: boolean }): Promise<void> {
    const existing = this.db.docs[this.path];
    this.db.docs[this.path] =
      opts?.merge && existing ? { ...existing, ...data } : { ...data };
  }

  async get(): Promise<{ exists: boolean; data: () => DocData | undefined }> {
    const data = this.db.docs[this.path] ?? null;
    return {
      exists: data != null,
      data: () => (data ?? undefined) as DocData | undefined,
    };
  }
}

class MockCollectionRef {
  constructor(
    readonly db: MockFirestore,
    readonly path: string,
  ) {}

  doc(id: string): MockDocRef {
    return new MockDocRef(this.db, `${this.path}/${id}`);
  }

  where(field: string, op: string, value: unknown): this {
    void field;
    void op;
    void value;
    return this;
  }

  select(): this {
    return this;
  }

  async get(): Promise<{ docs: Array<{ id: string; ref: MockDocRef; data: () => DocData }> }> {
    const prefix = `${this.path}/`;
    const docs = Object.entries(this.db.docs)
      .filter(([key]) => key.startsWith(prefix) && !key.slice(prefix.length).includes("/"))
      .map(([key, data]) => {
        const id = key.slice(prefix.length);
        return {
          id,
          ref: this.doc(id),
          data: () => data,
        };
      });
    return { docs };
  }

  async count(): Promise<{ data: () => { count: number } }> {
    const snap = await this.get();
    return { data: () => ({ count: snap.docs.length }) };
  }
}

class MockFirestore {
  docs: Record<string, DocData> = {};
  txQueue: Array<(tx: MockTransaction) => Promise<void>> = [];
  runningTx = false;

  collection(name: string): MockCollectionRef {
    return new MockCollectionRef(this, name);
  }

  getDoc(path: string): DocData | null {
    return this.docs[path] ?? null;
  }

  async runTransaction(fn: (tx: MockTransaction) => Promise<void>): Promise<void> {
    const tx = new MockTransaction(this);
    await fn(tx);
    for (const [path, data] of (tx as unknown as { writes: Map<string, DocData> }).writes) {
      this.docs[path] = data;
    }
  }

  batch(): { set: (ref: MockDocRef, data: DocData) => void; commit: () => Promise<void> } {
    const ops: Array<{ ref: MockDocRef; data: DocData }> = [];
    return {
      set: (ref, data) => ops.push({ ref, data }),
      commit: async () => {
        for (const op of ops) {
          await op.ref.set(op.data);
        }
      },
    };
  }
}

function lockPath() {
  return "catalogSyncState/rulingsJobLock";
}

function auditPath() {
  return "catalogSyncState/rulingsJobLockAudit";
}

function globalPath() {
  return "catalogSyncState/global";
}

async function seedLock(
  db: MockFirestore,
  lock: Partial<RulingsJobLockRecord> & { runId: string; jobType: RulingsJobType },
): Promise<void> {
  const now = new Date().toISOString();
  db.docs[lockPath()] = {
    runId: lock.runId,
    jobType: lock.jobType,
    status: lock.status ?? "running",
    startedAt: lock.startedAt ?? now,
    heartbeatAt: lock.heartbeatAt ?? now,
    pid: lock.pid ?? 1,
    hostname: lock.hostname ?? "test",
  };
}

// 1. Second import during active import must fail
async function runTests() {
{
  const db = new MockFirestore() as unknown as Firestore;
  const mock = db as unknown as MockFirestore;
  await seedLock(mock, { runId: "run-active", jobType: "import" });
  let caught: RulingsJobLockError | null = null;
  try {
    await acquireRulingsJobLock(db, "import");
  } catch (err) {
    caught = err as RulingsJobLockError;
  }
  assert.ok(caught instanceof RulingsJobLockError, "second import blocked");
  assert.equal(caught?.code, "lock_held");
  console.log("PASS: second import blocked during active import");
}

// 2. Reset during import must fail
{
  const db = new MockFirestore() as unknown as Firestore;
  const mock = db as unknown as MockFirestore;
  await seedLock(mock, { runId: "run-reset-block", jobType: "import" });
  let caught: RulingsJobLockError | null = null;
  try {
    await assertNoActiveRulingsJob(db);
  } catch (err) {
    caught = err as RulingsJobLockError;
  }
  assert.ok(caught instanceof RulingsJobLockError, "reset blocked during import");
  console.log("PASS: reset/reconcile blocked during active import");
}

// 3. Reconciliation mutation guard during import
{
  const db = new MockFirestore() as unknown as Firestore;
  const mock = db as unknown as MockFirestore;
  await seedLock(mock, { runId: "run-reconcile-block", jobType: "import" });
  await assert.rejects(
    () => assertNoActiveRulingsJob(db),
    RulingsJobLockError,
    "reconcile blocked during import",
  );
  console.log("PASS: reconciliation mutation blocked during active import");
}

// 4. Stale lock with expired heartbeat may be cleared
{
  const staleHeartbeat = new Date(Date.now() - RULINGS_JOB_STALE_MS - 60_000).toISOString();
  const lock: RulingsJobLockRecord = {
    runId: "stale-run",
    jobType: "import",
    status: "running",
    startedAt: staleHeartbeat,
    heartbeatAt: staleHeartbeat,
    pid: 1,
    hostname: "test",
  };
  assert.equal(isRulingsJobLockStale(lock, Date.now()), true, "stale lock detected");

  const db = new MockFirestore() as unknown as Firestore;
  const mock = db as unknown as MockFirestore;
  mock.docs[lockPath()] = lock;
  const acquired = await acquireRulingsJobLock(db, "import");
  assert.ok(acquired.runId !== "stale-run", "new run after stale clear");
  const audit = mock.docs[auditPath()];
  assert.ok(audit?.entries, "stale lock audit written");
  console.log("PASS: stale lock cleared with audit entry");
}

// 5. Non-stale lock must not be cleared
{
  const fresh = new Date().toISOString();
  const lock: RulingsJobLockRecord = {
    runId: "fresh-run",
    jobType: "import",
    status: "running",
    startedAt: fresh,
    heartbeatAt: fresh,
    pid: 1,
    hostname: "test",
  };
  assert.equal(isRulingsJobLockStale(lock, Date.now()), false, "fresh lock not stale");

  const db = new MockFirestore() as unknown as Firestore;
  const mock = db as unknown as MockFirestore;
  mock.docs[lockPath()] = lock;
  await assert.rejects(
    () => acquireRulingsJobLock(db, "import"),
    RulingsJobLockError,
    "fresh lock not cleared",
  );
  assert.equal((mock.docs[lockPath()] as RulingsJobLockRecord).runId, "fresh-run");
  console.log("PASS: non-stale lock preserved");
}

// 6. Failed staging reconciliation must not activate version
{
  const db = new MockFirestore() as unknown as Firestore;
  const mock = db as unknown as MockFirestore;
  const versionId = "rulings-failed-reconcile";
  await createRulingsVersion(db, {
    versionId,
    importRunId: "run-fail",
    bulkUpdatedAt: "2026-01-01",
    bulkContentHash: "abc",
  });
  await assert.rejects(
    () => activateRulingsVersion(db, versionId),
    /expected reconciled/,
    "unreconciled version cannot activate",
  );
  assert.equal(await getActiveRulingsVersionId(db), null);
  console.log("PASS: failed reconciliation blocks promotion");
}

// 7. Successful reconciliation and atomic promotion
{
  const db = new MockFirestore() as unknown as Firestore;
  const mock = db as unknown as MockFirestore;
  const v1 = "rulings-v1";
  const v2 = "rulings-v2";

  await createRulingsVersion(db, {
    versionId: v1,
    importRunId: "run-v1",
    bulkUpdatedAt: "2026-01-01",
    bulkContentHash: "hash1",
  });
  await versionRulingsRef(db, v1).doc("ruling-a").set({
    id: "ruling-a",
    oracleId: "oracle-1",
    contentHash: "h1",
  });
  await markVersionReconciled(db, v1, 1);
  await activateRulingsVersion(db, v1);

  mock.docs[globalPath()] = { activeRulingsVersionId: v1 };
  const activeBefore = await getActiveRulingsVersionId(db);
  assert.equal(activeBefore, v1);

  await createRulingsVersion(db, {
    versionId: v2,
    importRunId: "run-v2",
    bulkUpdatedAt: "2026-02-01",
    bulkContentHash: "hash2",
  });
  await versionRulingsRef(db, v2).doc("ruling-a").set({
    id: "ruling-a",
    oracleId: "oracle-1",
    contentHash: "h1",
  });
  await versionRulingsRef(db, v2).doc("ruling-b").set({
    id: "ruling-b",
    oracleId: "oracle-2",
    contentHash: "h2",
  });
  await markVersionReconciled(db, v2, 2);

  const { previousVersionId, activeVersionId } = await activateRulingsVersion(db, v2);
  assert.equal(previousVersionId, v1);
  assert.equal(activeVersionId, v2);
  assert.equal(
    (mock.docs[versionDocRef(db, v1).path] as { status: string }).status,
    "superseded",
  );
  assert.equal(
    (mock.docs[globalPath()] as { activeRulingsVersionId: string }).activeRulingsVersionId,
    v2,
  );
  assert.equal(
    (mock.docs[globalPath()] as { previousRulingsVersionId: string }).previousRulingsVersionId,
    v1,
  );
  console.log("PASS: atomic promotion retains previous version for rollback");
}

// 8. Readers never see partial version — pointer switches only after complete version
{
  const db = new MockFirestore() as unknown as Firestore;
  const mock = db as unknown as MockFirestore;
  const vOld = "rulings-complete-old";
  const vNew = "rulings-building-new";

  await createRulingsVersion(db, {
    versionId: vOld,
    importRunId: "old",
    bulkUpdatedAt: "2026-01-01",
    bulkContentHash: "old",
  });
  await versionRulingsRef(db, vOld).doc("r1").set({ id: "r1", oracleId: "o1" });
  await markVersionReconciled(db, vOld, 1);
  await activateRulingsVersion(db, vOld);

  await createRulingsVersion(db, {
    versionId: vNew,
    importRunId: "new",
    bulkUpdatedAt: "2026-02-01",
    bulkContentHash: "new",
  });
  await versionRulingsRef(db, vNew).doc("r1").set({ id: "r1", oracleId: "o1" });

  const activeDuringBuild = await getActiveRulingsVersionId(db);
  assert.equal(activeDuringBuild, vOld, "readers stay on old version while new builds");

  await versionRulingsRef(db, vNew).doc("r2").set({ id: "r2", oracleId: "o2" });
  await markVersionReconciled(db, vNew, 2);
  await activateRulingsVersion(db, vNew);

  assert.equal(await getActiveRulingsVersionId(db), vNew);
  console.log("PASS: readers see old or new complete version, never partial");
}

console.log("\nAll rulings concurrency regression tests passed.");
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
