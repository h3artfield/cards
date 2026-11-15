import type {
  ShopifyExportJob,
  ShopifyExportJobFailure,
  ShopifyExportJobStatus,
} from "./export-job-types";

/** Keep the record small enough to stay well under the Firestore document limit. */
export const EXPORT_JOB_FAILURE_CAP = 50;

/**
 * Stop after this many failures in a row. A bad token or revoked scope fails
 * every row, and grinding through thousands of them just hammers Shopify.
 */
export const EXPORT_JOB_FAILURE_STREAK_LIMIT = 5;

/** How long one chunk may hold the job before another caller may take over. */
export const EXPORT_JOB_LEASE_MS = 120_000;

export function exportJobProgress(job: ShopifyExportJob): {
  processed: number;
  total: number;
  remaining: number;
  percent: number;
} {
  const processed = job.exported + job.failed;
  const total = Math.max(job.totalEligible, processed);
  const remaining = Math.max(0, total - processed);
  const percent = total === 0 ? 100 : Math.round((processed / total) * 100);
  return { processed, total, remaining, percent };
}

export function appendExportJobFailures(
  existing: ShopifyExportJobFailure[],
  incoming: ShopifyExportJobFailure[],
): ShopifyExportJobFailure[] {
  if (!incoming.length) return existing;
  return [...existing, ...incoming].slice(-EXPORT_JOB_FAILURE_CAP);
}

export function isExportJobLeaseHeld(
  job: Pick<ShopifyExportJob, "leaseUntil">,
  now = Date.now(),
): boolean {
  if (!job.leaseUntil) return false;
  const until = Date.parse(job.leaseUntil);
  if (Number.isNaN(until)) return false;
  return until > now;
}

export function isExportJobTerminal(status: ShopifyExportJobStatus): boolean {
  return status !== "running";
}

/** Decide where the job stands once a chunk finishes. */
export function resolveStatusAfterChunk(input: {
  cancelRequested?: boolean;
  failureStreak: number;
  remainingEligible: number;
}): { status: ShopifyExportJobStatus; stopReason?: string } {
  if (input.cancelRequested) {
    return { status: "cancelled", stopReason: "Cancelled by staff." };
  }
  if (input.failureStreak >= EXPORT_JOB_FAILURE_STREAK_LIMIT) {
    return {
      status: "failed",
      stopReason: `Stopped after ${input.failureStreak} consecutive failures.`,
    };
  }
  if (input.remainingEligible <= 0) {
    return { status: "completed" };
  }
  return { status: "running" };
}

/** Streak resets on any success, so a lone flaky row does not stop the run. */
export function nextFailureStreak(
  current: number,
  chunkExported: number,
  chunkFailed: number,
): number {
  if (chunkExported > 0) return 0;
  return current + chunkFailed;
}
