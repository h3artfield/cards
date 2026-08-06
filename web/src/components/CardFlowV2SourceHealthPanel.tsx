"use client";

import type { CandidateMarketSnapshot } from "@/lib/card-flow-v2/market/types";
import type { MarketSourceHealth } from "@/lib/card-flow-v2/market/source-health-types";

function SourceHealthRow({ h }: { h: MarketSourceHealth }) {
  const label = h.source.replace(/_/g, " ");
  return (
    <div className="rounded border border-gray-200 bg-gray-50 p-2 text-xs">
      <p className="font-medium capitalize">{label}</p>
      <p className="text-gray-600">
        Attempted: {h.attempted ? "yes" : "no"}
        {h.httpStatus != null ? ` · HTTP ${h.httpStatus}` : ""}
      </p>
      {h.fatalError && (
        <p className="text-red-700">Error: {h.fatalError.replace(/_/g, " ")}</p>
      )}
      {h.reasonIfSkipped && (
        <p className="text-amber-700">Skipped: {h.reasonIfSkipped}</p>
      )}
      {h.attempted && (
        <p className="text-gray-700">
          Raw: {h.rawResultCount} · Accepted: {h.acceptedCount} · Maybe:{" "}
          {h.maybeCount} · Rejected: {h.rejectedCount}
          {h.priceSignalsFound > 0
            ? ` · Pricing signals: ${h.priceSignalsFound}`
            : ""}
        </p>
      )}
      {h.query && <p className="text-gray-500 truncate">Query: {h.query}</p>}
      {h.productId && <p className="text-gray-500">Product ID: {h.productId}</p>}
      {h.catalogId && <p className="text-gray-500">Catalog ID: {h.catalogId}</p>}
      {h.warnings.slice(0, 2).map((w) => (
        <p key={w} className="text-amber-800">
          {w}
        </p>
      ))}
    </div>
  );
}

export function CardFlowV2SourceHealthPanel({
  snap,
}: {
  snap: CandidateMarketSnapshot;
}) {
  const outcome = snap.marketOutcome;

  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-800">
        Source health
      </p>

      {outcome?.plainEnglishSummary && (
        <pre className="whitespace-pre-wrap rounded border border-violet-100 bg-violet-50/40 p-2 text-xs text-gray-800">
          {outcome.plainEnglishSummary}
        </pre>
      )}

      {outcome && (
        <p className="text-xs text-gray-600">
          Sold comps: {outcome.acceptedSoldComps} · Maybe: {outcome.maybeListings}{" "}
          · Rejected: {outcome.rejectedListings} · Pricing signals:{" "}
          {outcome.pricingSignals}
        </p>
      )}

      {outcome?.pricingSignalDetails && outcome.pricingSignalDetails.length > 0 && (
        <ul className="list-inside list-disc text-xs text-gray-700">
          {outcome.pricingSignalDetails.map((s) => (
            <li key={`${s.source}-${s.label}`}>
              {s.source}: {s.label} — ${s.price.toFixed(2)}
            </li>
          ))}
        </ul>
      )}

      {snap.pricingMethod && (
        <p className="text-xs text-gray-600">
          Method: {snap.pricingMethod.replace(/_/g, " ")}
          {snap.valueMedian != null ? ` · Shadow $${snap.valueMedian.toFixed(2)}` : ""}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        {(snap.sourceHealth ?? []).map((h) => (
          <SourceHealthRow key={h.source} h={h} />
        ))}
      </div>

      {snap.tcgplayerMapping && (
        <div className="rounded border border-blue-100 bg-blue-50/50 p-2 text-xs">
          <p className="font-medium">TCGplayer mapping</p>
          {snap.tcgplayerMapping.productId && (
            <p>Product: {snap.tcgplayerMapping.productId}</p>
          )}
          {snap.tcgplayerMapping.groupId && (
            <p>Group/set: {snap.tcgplayerMapping.groupId}</p>
          )}
          {snap.tcgplayerMapping.finishRequested && (
            <p>Finish requested: {snap.tcgplayerMapping.finishRequested}</p>
          )}
          {snap.tcgplayerMapping.selectedVariantName && (
            <p>Variant matched: {snap.tcgplayerMapping.selectedVariantName}</p>
          )}
          {snap.tcgplayerMapping.availableVariantNames.length > 0 && (
            <p>
              Available variants:{" "}
              {snap.tcgplayerMapping.availableVariantNames.join(", ")}
            </p>
          )}
          {snap.tcgplayerMapping.marketPrice != null && (
            <p>Market: ${snap.tcgplayerMapping.marketPrice.toFixed(2)}</p>
          )}
          {snap.tcgplayerMapping.reasonIfSkipped && (
            <p className="text-amber-700">{snap.tcgplayerMapping.reasonIfSkipped}</p>
          )}
          {snap.tcgplayerMapping.error && (
            <p className="text-red-700">{snap.tcgplayerMapping.error}</p>
          )}
        </div>
      )}

      {snap.priceChartingMapping && (
        <div className="rounded border border-green-100 bg-green-50/50 p-2 text-xs">
          <p className="font-medium">PriceCharting mapping</p>
          {snap.priceChartingMapping.productId && (
            <p>Product: {snap.priceChartingMapping.productId}</p>
          )}
          {snap.priceChartingMapping.tierSelected && (
            <p>Tier: {snap.priceChartingMapping.tierSelected}</p>
          )}
          {snap.priceChartingMapping.loosePrice != null && (
            <p>Loose: ${snap.priceChartingMapping.loosePrice.toFixed(2)}</p>
          )}
          {snap.priceChartingMapping.tiersExcluded.length > 0 && (
            <p className="text-gray-600">
              Excluded: {snap.priceChartingMapping.tiersExcluded.join(", ")}
            </p>
          )}
          {snap.priceChartingMapping.reasonIfSkipped && (
            <p className="text-amber-700">{snap.priceChartingMapping.reasonIfSkipped}</p>
          )}
        </div>
      )}

      {snap.queryAudits && snap.queryAudits.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-violet-800">
            Query strategy ({snap.queryAudits.length})
          </summary>
          <ul className="mt-1 space-y-1">
            {snap.queryAudits.map((q) => (
              <li key={`${q.source}-${q.query}`} className="rounded bg-white p-1">
                <span className="font-medium">{q.source}</span> [{q.purpose}]: raw{" "}
                {q.rawResults}, ✓{q.accepted} ?{q.maybe} ✗{q.rejected}
                {q.fatalError ? ` — ${q.fatalError}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
