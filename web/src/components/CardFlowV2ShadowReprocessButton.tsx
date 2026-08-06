"use client";

import { useState } from "react";
import { adminFetch } from "@/lib/api-client";
import type { V2ReprocessSummary } from "@/lib/card-flow-v2/v2-reprocess-summary";
import { Button } from "@/components/Button";

/** Runs V2 shadow reprocess on Cloud Run — no local Firestore scripts. */
export function CardFlowV2ShadowReprocessButton({
  cardId,
  onComplete,
  className,
}: {
  cardId: string;
  onComplete?: () => void | Promise<void>;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<V2ReprocessSummary | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/cards/${cardId}/v2-reprocess`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        error?: string;
        summary?: V2ReprocessSummary;
      };
      if (!res.ok) {
        throw new Error(data.error ?? "V2 shadow reprocess failed");
      }
      if (data.summary) setSummary(data.summary);
      await onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "V2 shadow reprocess failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button
        variant="secondary"
        className="min-h-10 w-full"
        disabled={busy}
        onClick={() => void run()}
      >
        {busy ? "Re-running V2…" : "Re-run V2 shadow analysis"}
      </Button>
      {error && (
        <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900">
          {error}
        </p>
      )}
      {summary && !error && (
        <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-950">
          <p className="font-medium">
            V2 refreshed · production unchanged:{" "}
            {summary.productionUnchanged ? "yes" : "no"}
          </p>
          {summary.topSuspects.length > 0 && (
            <p className="mt-1">
              Top suspect: {summary.topSuspects[0]?.label}
              {summary.topSuspectScores[0] != null &&
                ` (${(summary.topSuspectScores[0].score * 100).toFixed(0)}%)`}
            </p>
          )}
          {summary.listRelatedNotes.length > 0 && (
            <p className="mt-1 text-emerald-900">
              {summary.listRelatedNotes[0]}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
