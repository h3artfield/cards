import type { TopdeckBulkRequest, TopdeckTournament } from "./types";
import type { TopdeckFetchMetrics, TopdeckFetchRequestLog } from "../types";
import { TopdeckClient, TopdeckRateLimitError, TopdeckTransientError } from "./client";
import type { DateWindow } from "./window-planner";
import {
  intervalKey,
  nextSubdivisionWindows,
  windowsForInitialAttempt,
} from "./window-planner";

const TRANSIENT_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS_PER_WINDOW = 5;

function jitterMs(base: number): number {
  return base + Math.floor(Math.random() * 500);
}

function backoffMs(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds != null) return jitterMs(retryAfterSeconds * 1000);
  return jitterMs(Math.min(60_000, 2000 * 2 ** attempt));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type FetchWindowResult = {
  tournaments: TopdeckTournament[];
  status: "COMPLETE" | "PARTIAL" | "FAILED";
  fetchWindowsUsed: string[];
  missingIntervals: string[];
  duplicateTidRetrievals: number;
};

export async function fetchLogicalMonthWithSubdivision(input: {
  client: TopdeckClient;
  logicalMonth: DateWindow;
  baseRequest: Omit<TopdeckBulkRequest, "start" | "end">;
  resumeCompletedWindows?: string[];
  resumeMissingIntervals?: string[];
}): Promise<FetchWindowResult> {
  const metrics = input.client.metrics;
  const seenTids = new Set<string>();
  const tournaments: TopdeckTournament[] = [];
  let duplicateTidRetrievals = 0;

  const completed = new Set(input.resumeCompletedWindows ?? []);
  const missing = new Set(input.resumeMissingIntervals ?? []);
  const fetchWindowsUsed: string[] = [...completed];

  const queue: Array<{ window: DateWindow; splitDepth: number }> = [];

  if (missing.size > 0) {
    for (const key of missing) {
      const [startStr, endStr] = key.split("..");
      queue.push({
        window: {
          start: new Date(`${startStr}T00:00:00.000Z`),
          end: new Date(`${endStr}T23:59:59.999Z`),
          label: key,
        },
        splitDepth: 0,
      });
    }
  } else if (completed.has(input.logicalMonth.label)) {
    return {
      tournaments: [],
      status: "COMPLETE",
      fetchWindowsUsed: [...completed],
      missingIntervals: [],
      duplicateTidRetrievals: 0,
    };
  } else {
    for (const w of windowsForInitialAttempt(input.logicalMonth)) {
      queue.push({ window: w, splitDepth: 0 });
    }
  }

  const failedIntervals: string[] = [];

  while (queue.length > 0) {
    const item = queue.shift()!;
    const label = item.window.label;
    if (completed.has(label)) continue;

    metrics.splitDepthMax = Math.max(metrics.splitDepthMax ?? 0, item.splitDepth);

    const log: TopdeckFetchRequestLog = {
      windowLabel: label,
      attemptCount: 0,
      retryDelaysMs: [],
      splitDepth: item.splitDepth,
      result: "failed",
    };

    let success = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS_PER_WINDOW; attempt += 1) {
      log.attemptCount = attempt + 1;
      try {
        const batch = await input.client.fetchTournaments({
          ...input.baseRequest,
          start: Math.floor(item.window.start.getTime() / 1000),
          end: Math.floor(item.window.end.getTime() / 1000),
        });
        for (const t of batch) {
          const tid = t.TID ?? "unknown";
          if (seenTids.has(tid)) {
            duplicateTidRetrievals += 1;
            metrics.duplicateTidRetrievals = (metrics.duplicateTidRetrievals ?? 0) + 1;
            continue;
          }
          seenTids.add(tid);
          tournaments.push(t);
        }
        completed.add(label);
        fetchWindowsUsed.push(label);
        log.result = "success";
        log.httpStatus = 200;
        success = true;
        break;
      } catch (err) {
        const retryAfter =
          err instanceof TopdeckRateLimitError
            ? err.retryAfterSeconds
            : err instanceof TopdeckTransientError
              ? err.retryAfterSeconds
              : undefined;
        const status =
          err instanceof TopdeckTransientError
            ? Number.parseInt(err.message.replace(/.*(\d{3}).*/, "$1"), 10)
            : err instanceof TopdeckRateLimitError
              ? 429
              : undefined;
        if (status) log.httpStatus = status;
        if (TRANSIENT_STATUSES.has(status ?? 0) && attempt + 1 < MAX_ATTEMPTS_PER_WINDOW) {
          metrics.retries += 1;
          const delay = backoffMs(attempt, retryAfter);
          log.retryDelaysMs.push(delay);
          await sleep(delay);
          continue;
        }
        break;
      }
    }

    metrics.requestLog.push(log);

    if (success) continue;

    const subdivisions = nextSubdivisionWindows(item.window, item.splitDepth);
    if (subdivisions.length <= 1 || item.splitDepth >= 2) {
      failedIntervals.push(intervalKey(item.window.start, item.window.end));
      continue;
    }

    log.result = "split";
    for (const sub of subdivisions) {
      queue.push({ window: sub, splitDepth: item.splitDepth + 1 });
    }
  }

  const missingIntervals = [...new Set(failedIntervals)];
  let status: FetchWindowResult["status"] = "COMPLETE";
  if (missingIntervals.length > 0 && tournaments.length > 0) status = "PARTIAL";
  if (missingIntervals.length > 0 && tournaments.length === 0) status = "FAILED";

  return {
    tournaments,
    status,
    fetchWindowsUsed,
    missingIntervals,
    duplicateTidRetrievals,
  };
}
