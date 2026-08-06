"use client";

import type { CardFlowV2AuditRecord } from "@/lib/card-flow-v2/audit/types";
import type { CandidateMarketSnapshot } from "@/lib/card-flow-v2/market/types";
import type { V2OfferPreview } from "@/lib/card-flow-v2/offer/types";
import { buildProductionPriceWarning } from "@/lib/card-flow-v2/audit/production-price-warning";
import { formatPriceDiffPercent, friendlyPcSkipReason } from "@/lib/card-flow-v2/v2-staff-labels";
import { CardFlowV2SourceHealthPanel } from "@/components/CardFlowV2SourceHealthPanel";

function money(n?: number): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

/** Collapsed manager-only pricing/source context — not shown in clerk view. */
export function CardFlowV2ManagerDetailsPanel({
  snap,
  audit,
  offerPreview,
  productionMarketPrice,
}: {
  snap?: CandidateMarketSnapshot;
  audit?: CardFlowV2AuditRecord;
  offerPreview?: V2OfferPreview;
  productionMarketPrice?: number;
}) {
  const previewVal =
    offerPreview?.previewMarketValue ?? offerPreview?.marketDecision.marketValue;
  const diffPct = formatPriceDiffPercent(productionMarketPrice, previewVal);
  const pcWarning = audit
    ? buildProductionPriceWarning({
        audit,
        priceChartingMapping: snap?.priceChartingMapping,
      })
    : null;

  const sourceSummary = (offerPreview?.marketDecision.sourceValues ?? [])
    .slice(0, 6)
    .map((s) => `${s.label}: ${money(s.value)}${s.used ? " (used)" : " (not used)"}`);

  return (
    <details className="rounded-lg border border-slate-300 bg-slate-50/80">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-slate-800 [&::-webkit-details-marker]:hidden">
        Source details
        <span className="mt-0.5 block text-xs font-normal text-slate-500">
          Condensed source summary — expand if needed
        </span>
      </summary>
      <div className="space-y-4 border-t border-slate-200 px-4 py-3 text-sm">
        {(productionMarketPrice != null || previewVal != null) && (
          <div>
            <p className="font-medium text-slate-900">Production vs V2</p>
            <p className="mt-1 text-xs text-slate-700">
              Production {money(productionMarketPrice)} · V2 {money(previewVal)}
              {diffPct ? ` · ${diffPct}` : ""}
            </p>
          </div>
        )}

        {sourceSummary.length > 0 && (
          <div>
            <p className="font-medium text-slate-900">Source summary</p>
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-slate-700">
              {sourceSummary.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {snap?.priceChartingMapping?.reasonIfSkipped && (
          <p className="text-xs text-slate-700">
            PriceCharting:{" "}
            {friendlyPcSkipReason(snap.priceChartingMapping.reasonIfSkipped)}
          </p>
        )}

        {pcWarning && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <p className="font-medium">{pcWarning.title}</p>
            <p className="mt-1">{pcWarning.detail}</p>
          </div>
        )}

        {audit?.recommendedStaffAction && (
          <div>
            <p className="font-medium text-slate-900">Pricing safety note</p>
            <p className="mt-1 text-xs text-slate-700">{audit.recommendedStaffAction}</p>
          </div>
        )}

        {snap && (
          <details className="rounded-lg border border-gray-200 bg-white">
            <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-700">
              Full source health
            </summary>
            <div className="border-t border-gray-100 p-3">
              <CardFlowV2SourceHealthPanel snap={snap} />
            </div>
          </details>
        )}
      </div>
    </details>
  );
}
