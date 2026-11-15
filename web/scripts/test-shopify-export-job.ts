import assert from "node:assert/strict";
import {
  EXPORT_JOB_FAILURE_CAP,
  EXPORT_JOB_FAILURE_STREAK_LIMIT,
  appendExportJobFailures,
  exportJobProgress,
  isExportJobLeaseHeld,
  isExportJobTerminal,
  nextFailureStreak,
  resolveStatusAfterChunk,
} from "../src/lib/shopify/export-job-math";
import type {
  ShopifyExportJob,
  ShopifyExportJobFailure,
} from "../src/lib/shopify/export-job-types";

function job(overrides: Partial<ShopifyExportJob> = {}): ShopifyExportJob {
  return {
    id: "job-1",
    storeId: "store-1",
    status: "running",
    batchSize: 25,
    totalEligible: 100,
    exported: 0,
    failed: 0,
    failureStreak: 0,
    failures: [],
    startedAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function failure(id: string): ShopifyExportJobFailure {
  return {
    inventoryItemId: id,
    displayName: `Card ${id}`,
    error: "boom",
    at: "2026-01-01T00:00:00.000Z",
  };
}

// Progress counts both outcomes, since a failed row is still processed.
{
  const progress = exportJobProgress(job({ exported: 20, failed: 5 }));
  assert.equal(progress.processed, 25);
  assert.equal(progress.total, 100);
  assert.equal(progress.remaining, 75);
  assert.equal(progress.percent, 25);
}

// An empty job is complete rather than dividing by zero.
{
  const progress = exportJobProgress(job({ totalEligible: 0 }));
  assert.equal(progress.percent, 100);
  assert.equal(progress.remaining, 0);
}

// More rows can become eligible mid-run, so the denominator must not go stale
// enough to report over 100 percent.
{
  const progress = exportJobProgress(
    job({ totalEligible: 10, exported: 12, failed: 3 }),
  );
  assert.equal(progress.total, 15);
  assert.equal(progress.percent, 100);
}

// Failures are capped so the record cannot outgrow a Firestore document.
{
  const existing = Array.from({ length: EXPORT_JOB_FAILURE_CAP }, (_, i) =>
    failure(`old-${i}`),
  );
  const appended = appendExportJobFailures(existing, [failure("new")]);
  assert.equal(appended.length, EXPORT_JOB_FAILURE_CAP);
  assert.equal(appended.at(-1)?.inventoryItemId, "new", "keeps newest");
  assert.ok(
    !appended.some((f) => f.inventoryItemId === "old-0"),
    "drops oldest",
  );
  assert.equal(appendExportJobFailures(existing, []), existing, "no-op");
}

// The lease is what stops two callers exporting the same row twice.
{
  assert.equal(isExportJobLeaseHeld({ leaseUntil: undefined }), false);
  assert.equal(
    isExportJobLeaseHeld({ leaseUntil: new Date(0).toISOString() }),
    false,
    "a released lease is dated in the past",
  );
  assert.equal(
    isExportJobLeaseHeld({ leaseUntil: "not-a-date" }),
    false,
    "an unparseable lease must not block the job forever",
  );
  assert.equal(
    isExportJobLeaseHeld({
      leaseUntil: new Date(Date.now() + 60_000).toISOString(),
    }),
    true,
  );
}

// Cancellation wins over remaining work.
{
  const { status, stopReason } = resolveStatusAfterChunk({
    cancelRequested: true,
    failureStreak: 0,
    remainingEligible: 500,
  });
  assert.equal(status, "cancelled");
  assert.ok(stopReason);
}

// A systemic failure (bad token, revoked scope) must not grind through 3k rows.
{
  const { status, stopReason } = resolveStatusAfterChunk({
    failureStreak: EXPORT_JOB_FAILURE_STREAK_LIMIT,
    remainingEligible: 3000,
  });
  assert.equal(status, "failed");
  assert.match(String(stopReason), /consecutive/i);
}

// Work remaining keeps it running; nothing left completes it.
{
  assert.equal(
    resolveStatusAfterChunk({ failureStreak: 0, remainingEligible: 10 }).status,
    "running",
  );
  assert.equal(
    resolveStatusAfterChunk({ failureStreak: 0, remainingEligible: 0 }).status,
    "completed",
  );
}

// One flaky row among successes should not trip the breaker.
{
  assert.equal(nextFailureStreak(4, 24, 1), 0, "any success resets the streak");
  assert.equal(nextFailureStreak(2, 0, 3), 5, "pure failure accumulates");
}

{
  assert.equal(isExportJobTerminal("running"), false);
  assert.equal(isExportJobTerminal("completed"), true);
  assert.equal(isExportJobTerminal("cancelled"), true);
  assert.equal(isExportJobTerminal("failed"), true);
}

console.log("shopify export job: all assertions passed");
