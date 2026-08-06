"use client";

import { useEffect, useState } from "react";
import type { ScannedCard } from "@/lib/types";
import type { CardCandidateBundle } from "@/lib/card-flow-v2/types";
import type { AdminCardViewMode } from "@/lib/card-flow-v2/admin-card-view-mode";
import type { CardPriceHistoryResponse } from "@/lib/prices/types";
import { adminFetch } from "@/lib/api-client";

function money(n?: number): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function pct(n?: number): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

function PriceSparkline({
  points,
}: {
  points: { date: string; value: number }[];
}) {
  if (points.length < 2) {
    return (
      <p className="text-xs text-gray-500">
        Not enough daily snapshots yet for a chart.
      </p>
    );
  }

  const width = 280;
  const height = 72;
  const pad = 4;
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (width - pad * 2);
    const y = height - pad - ((p.value - min) / span) * (height - pad * 2);
    return `${x},${y}`;
  });

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-2 w-full max-w-sm text-emerald-700"
      role="img"
      aria-label="Price history line chart"
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        points={coords.join(" ")}
      />
    </svg>
  );
}

/** Collapsed manager price history — PriceCharting daily snapshots. */
export function CardFlowV2PriceHistoryPanel({
  card,
  viewMode,
}: {
  card: ScannedCard;
  identity?: CardCandidateBundle;
  viewMode: AdminCardViewMode;
}) {
  const [history, setHistory] = useState<CardPriceHistoryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (viewMode === "clerk" || !open || history || loading) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminFetch(
          `/api/admin/cards/${card.id}/v2-price-history`,
        );
        const data = (await res.json()) as CardPriceHistoryResponse & {
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Failed to load price history");
        if (!cancelled) setHistory(data);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load price history");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, card.id, history, loading, viewMode]);

  if (viewMode === "clerk") return null;

  const series = history?.series[0];
  const points = series?.points ?? [];

  return (
    <details
      className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50/50 text-sm"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer list-none px-4 py-3 font-semibold text-emerald-950 [&::-webkit-details-marker]:hidden">
        Price History
        <span className="mt-0.5 block text-xs font-normal text-emerald-900/80">
          PriceCharting daily snapshots — stock-style graph
        </span>
      </summary>

      <div className="space-y-3 border-t border-emerald-200 px-4 py-3">
        {loading && <p className="text-xs text-gray-600">Loading…</p>}
        {error && <p className="text-xs text-red-700">{error}</p>}

        {history && (
          <>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span>
                Ungraded:{" "}
                <strong>{money(history.currentEstimate)}</strong>
              </span>
              <span>7D: {pct(history.trend.sevenDayChangePct)}</span>
              <span>30D: {pct(history.trend.thirtyDayChangePct)}</span>
              <span>90D: {pct(history.trend.ninetyDayChangePct)}</span>
            </div>

            <PriceSparkline points={points} />

            <p className="text-xs text-gray-600">
              Source: {history.sourceNote}
              {history.lastUpdated && (
                <> · Last updated {history.lastUpdated.slice(0, 10)}</>
              )}
              {history.trend.sampleCount > 0 && (
                <> · {history.trend.sampleCount} snapshot(s)</>
              )}
            </p>

            {(history.retailBuy != null || history.retailSell != null) && (
              <div className="rounded border border-gray-200 bg-white/80 px-3 py-2 text-xs text-gray-700">
                {history.retailBuy != null && (
                  <p>PriceCharting retail buy: {money(history.retailBuy)}</p>
                )}
                {history.retailSell != null && (
                  <p>PriceCharting retail sell: {money(history.retailSell)}</p>
                )}
                <p>Store rule cash offer: {money(card.cashOffer)}</p>
              </div>
            )}

            {history.identityKey && (
              <p className="font-mono text-[10px] text-gray-500">
                {history.identityKey}
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
