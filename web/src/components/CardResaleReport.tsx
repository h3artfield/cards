"use client";

import type { CardResaleAnalysis } from "@/lib/types";

const SENTIMENT_STYLES = {
  bullish: "bg-emerald-100 text-emerald-800",
  bearish: "bg-red-100 text-red-800",
  neutral: "bg-gray-100 text-gray-800",
} as const;

const REC_STYLES = {
  buy: "bg-emerald-600 text-white",
  negotiate: "bg-emerald-600 text-white",
  pass: "bg-red-600 text-white",
  review: "bg-indigo-100 text-indigo-800",
} as const;

const REC_LABELS = {
  buy: "buy",
  negotiate: "buy",
  pass: "pass",
  review: "review",
} as const;

const FREQ_LABELS = {
  high: "High turnover",
  medium: "Moderate turnover",
  low: "Slow mover",
  unknown: "Unknown liquidity",
} as const;

function fmt(n?: number) {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${n.toFixed(2)}`;
}

export function CardResaleReport({
  analysis,
  compact = false,
}: {
  analysis: CardResaleAnalysis;
  compact?: boolean;
}) {
  const conf = Math.round((analysis.confidence ?? 0) * 100);
  const suggestedCash =
    analysis.suggestedCashOffer ?? analysis.maxBuyPrice;

  return (
    <div className={`rounded-lg border border-indigo-100 bg-indigo-50/40 ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
          Buyback report
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${SENTIMENT_STYLES[analysis.sentiment]}`}
        >
          {analysis.sentiment}
        </span>
        <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-600 ring-1 ring-gray-200">
          {FREQ_LABELS[analysis.salesFrequency]}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${REC_STYLES[analysis.recommendation]}`}
        >
          {REC_LABELS[analysis.recommendation]}
        </span>
        <span className="text-xs text-gray-500">{conf}% confidence</span>
      </div>

      {suggestedCash != null && suggestedCash > 0 && (
        <p className="mt-3 text-lg font-bold text-indigo-950">
          Suggested cash offer: {fmt(suggestedCash)}
          {analysis.suggestedTradeOffer != null && analysis.suggestedTradeOffer > 0 && (
            <span className="ml-3 text-base font-semibold text-indigo-800">
              · Trade {fmt(analysis.suggestedTradeOffer)}
            </span>
          )}
        </p>
      )}

      <p className={`mt-2 text-sm text-gray-800 ${compact ? "" : "leading-relaxed"}`}>
        {analysis.summary}
      </p>

      {analysis.priceRationale && (
        <p className="mt-2 text-sm text-gray-700">{analysis.priceRationale}</p>
      )}

      <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:grid-cols-4"} text-sm`}>
        <Metric label="Est. recent sale" value={fmt(analysis.latestSaleEstimate)} />
        <Metric label="Suggested buy" value={fmt(suggestedCash)} highlight />
        <Metric label="Target resale" value={fmt(analysis.targetResalePrice)} />
        <Metric
          label="Est. margin"
          value={
            analysis.estimatedMarginPercent != null
              ? `${analysis.estimatedMarginPercent.toFixed(0)}%`
              : "—"
          }
        />
      </div>

      {analysis.latestSaleNote && (
        <p className="mt-2 text-xs text-gray-600">{analysis.latestSaleNote}</p>
      )}
      {analysis.liquidityNotes && (
        <p className="mt-1 text-xs text-gray-600">{analysis.liquidityNotes}</p>
      )}

      {!compact && (analysis.risks.length > 0 || analysis.opportunities.length > 0) && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {analysis.risks.length > 0 && (
            <ListBlock title="Risks" items={analysis.risks} tone="red" />
          )}
          {analysis.opportunities.length > 0 && (
            <ListBlock title="Opportunities" items={analysis.opportunities} tone="emerald" />
          )}
        </div>
      )}

      <p className="mt-2 text-[10px] text-gray-400">
        Analyzed {new Date(analysis.analyzedAt).toLocaleString()}
        {analysis.model ? ` · ${analysis.model}` : ""}
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md px-2 py-1.5 ring-1 ${
        highlight ? "bg-indigo-100/80 ring-indigo-200" : "bg-white/80 ring-gray-100"
      }`}
    >
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`font-semibold ${highlight ? "text-indigo-950" : "text-gray-900"}`}>
        {value}
      </p>
    </div>
  );
}

function ListBlock({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "red" | "emerald";
}) {
  const color = tone === "red" ? "text-red-700" : "text-emerald-700";
  return (
    <div>
      <p className={`text-xs font-semibold uppercase ${color}`}>{title}</p>
      <ul className="mt-1 list-inside list-disc text-xs text-gray-700">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
