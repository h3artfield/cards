"use client";

import type { CardResaleAnalysis } from "@/lib/types";
import { CardResaleReport } from "@/components/CardResaleReport";

export function CardBuybackReportPanel({
  analysis,
  analyzing,
  onAnalyze,
  className = "",
}: {
  analysis?: CardResaleAnalysis;
  analyzing: boolean;
  onAnalyze?: () => void;
  className?: string;
}) {
  return (
    <div
      className={`flex min-h-0 flex-col rounded-xl border border-indigo-200 bg-gradient-to-b from-indigo-50/80 to-white p-3 shadow-sm ${className}`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold text-indigo-900">Buyback report</h4>
        {analysis && onAnalyze && (
          <button
            type="button"
            className="text-xs text-indigo-600 hover:underline disabled:opacity-50"
            disabled={analyzing}
            onClick={onAnalyze}
          >
            {analyzing ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>

      {analyzing && !analysis ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-6 text-center">
          <div
            className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
            aria-hidden
          />
          <p className="text-xs text-gray-600">Running full analysis…</p>
        </div>
      ) : analysis ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <CardResaleReport analysis={analysis} compact />
        </div>
      ) : (
        <p className="py-4 text-center text-xs text-gray-500">
          Full analysis runs automatically when orders are submitted or reprocessed.
        </p>
      )}
    </div>
  );
}
