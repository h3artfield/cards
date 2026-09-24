"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/Button";
import { adminFetch } from "@/lib/api-client";
import type { ShopifyExportJob } from "@/lib/shopify/export-job-types";

type JobProgress = {
  processed: number;
  total: number;
  remaining: number;
  percent: number;
};

type JobPayload = {
  job: ShopifyExportJob | null;
  progress?: JobProgress;
  eligibleNow: number;
};

const STATUS_LABELS: Record<ShopifyExportJob["status"], string> = {
  running: "Running",
  completed: "Finished",
  cancelled: "Cancelled",
  failed: "Stopped on errors",
};

const STATUS_STYLES: Record<ShopifyExportJob["status"], string> = {
  running: "bg-sky-100 text-sky-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-700",
  failed: "bg-red-100 text-red-800",
};

/** Runs the whole export backlog in chunks instead of 25 rows per click. */
export function ShopifyBulkExportPanel({
  onProgress,
}: {
  onProgress: () => void;
}) {
  const [job, setJob] = useState<ShopifyExportJob | null>(null);
  const [progress, setProgress] = useState<JobProgress | null>(null);
  const [eligibleNow, setEligibleNow] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [starting, setStarting] = useState(false);

  /** Guards against two chunk loops running in one tab. */
  const pumpingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const apply = useCallback((data: JobPayload) => {
    setJob(data.job);
    setProgress(data.progress ?? null);
    setEligibleNow(data.eligibleNow);
  }, []);

  const fetchStatus = useCallback(async (): Promise<JobPayload> => {
    const res = await adminFetch("/api/admin/shopify/export-job");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Could not load export job");
    return data as JobPayload;
  }, []);

  const pump = useCallback(
    async (jobId: string) => {
      if (pumpingRef.current) return;
      pumpingRef.current = true;
      try {
        // One chunk at a time. The server holds a lease per chunk, so a second
        // tab or a stale loop is rejected rather than double-exporting a row.
        for (;;) {
          const res = await adminFetch("/api/admin/shopify/export-job/tick", {
            method: "POST",
            body: JSON.stringify({ jobId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? "Export chunk failed");
          if (!mountedRef.current) return;

          setJob(data.job as ShopifyExportJob);
          setProgress((data.progress as JobProgress) ?? null);
          onProgress();

          if (data.state !== "advanced") break;
        }

        const latest = await fetchStatus();
        if (mountedRef.current) apply(latest);
      } catch (err) {
        if (mountedRef.current) {
          setError(
            err instanceof Error ? err.message : "Export chunk failed",
          );
        }
      } finally {
        pumpingRef.current = false;
      }
    },
    [apply, fetchStatus, onProgress],
  );

  useEffect(() => {
    let active = true;
    fetchStatus()
      .then((data) => {
        if (!active) return;
        apply(data);
        // A run left behind by a closed tab resumes from wherever it stopped.
        if (data.job?.status === "running") void pump(data.job.id);
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Could not load export job",
          );
        }
      })
      .finally(() => {
        if (active) setLoaded(true);
      });

    return () => {
      active = false;
    };
  }, [apply, fetchStatus, pump]);

  async function startJob() {
    setStarting(true);
    setError(null);
    try {
      const res = await adminFetch("/api/admin/shopify/export-job", {
        method: "POST",
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start export");
      apply(data as JobPayload);
      if (data.job?.id) void pump(data.job.id as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start export");
    } finally {
      setStarting(false);
    }
  }

  async function cancelJob() {
    if (!job) return;
    setError(null);
    try {
      const res = await adminFetch("/api/admin/shopify/export-job/cancel", {
        method: "POST",
        body: JSON.stringify({ jobId: job.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not cancel export");
      setJob(data.job as ShopifyExportJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not cancel export");
    }
  }

  if (!loaded) {
    return (
      <p className="mt-4 text-sm text-slate-500">Checking export runs…</p>
    );
  }

  const isRunning = job?.status === "running";
  const percent = progress?.percent ?? 0;

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">
            Run the whole backlog
          </h4>
          <p className="text-xs text-slate-600">
            Exports every ready row in batches of {job?.batchSize ?? 25}. Keep
            this page open to watch it; the run resumes if you come back.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isRunning ? (
            <Button variant="secondary" onClick={cancelJob}>
              Stop after this batch
            </Button>
          ) : (
            <Button
              onClick={startJob}
              disabled={starting || eligibleNow === 0}
            >
              {starting
                ? "Starting…"
                : `Export all ${eligibleNow.toLocaleString()} ready`}
            </Button>
          )}
        </div>
      </div>

      {job ? (
        <div className="mt-3">
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`rounded px-2 py-0.5 font-medium ${STATUS_STYLES[job.status]}`}
            >
              {STATUS_LABELS[job.status]}
            </span>
            <span className="text-slate-600">
              {job.exported.toLocaleString()} listed
              {job.failed > 0
                ? ` · ${job.failed.toLocaleString()} failed`
                : ""}
              {progress
                ? ` · ${progress.remaining.toLocaleString()} to go`
                : ""}
            </span>
          </div>

          <div
            className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200"
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className={`h-full transition-all ${
                job.status === "failed" ? "bg-red-500" : "bg-emerald-500"
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {job.stopReason ? (
            <p className="mt-2 text-xs text-amber-700">{job.stopReason}</p>
          ) : null}

          {job.failures.length ? (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-slate-700">
                {job.failures.length} row
                {job.failures.length === 1 ? "" : "s"} failed
              </summary>
              <ul className="mt-1 space-y-1">
                {job.failures.slice(-10).map((f) => (
                  <li key={`${f.inventoryItemId}-${f.at}`} className="text-xs">
                    <span className="text-slate-800">{f.displayName}</span>
                    <span className="text-red-700"> — {f.error}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
    </div>
  );
}
