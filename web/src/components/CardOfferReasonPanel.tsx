"use client";

import type { V2OfferReasonExplanation } from "@/lib/card-flow-v2/v2-offer-reason";

function money(n?: number): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

/** V2 buyback rationale — market source, offer math, comps, List context. */
export function CardOfferReasonPanel({
  reason,
}: {
  reason: V2OfferReasonExplanation | null;
}) {
  if (!reason) {
    return (
      <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
        V2 offer reasoning not available yet. Re-run V2 shadow analysis if this
        card was recently updated.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3 text-sm text-indigo-950">
      <p className="font-semibold">{reason.heading}</p>
      <p className="mt-2 text-sm text-gray-800">{reason.summary}</p>

      {!reason.blocked && (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
          <div className="rounded-md bg-white/80 px-2 py-1.5 ring-1 ring-gray-100">
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">
              Market
            </dt>
            <dd className="font-semibold">{money(reason.marketValue)}</dd>
            <dd className="text-[10px] text-gray-500">{reason.marketSource}</dd>
          </div>
          <div className="rounded-md bg-indigo-100/80 px-2 py-1.5 ring-1 ring-indigo-200">
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">
              Cash
            </dt>
            <dd className="font-semibold text-indigo-950">
              {money(reason.cashOffer)}
            </dd>
          </div>
          <div className="rounded-md bg-white/80 px-2 py-1.5 ring-1 ring-gray-100">
            <dt className="text-[10px] uppercase tracking-wide text-gray-500">
              Trade
            </dt>
            <dd className="font-semibold">{money(reason.tradeOffer)}</dd>
          </div>
        </dl>
      )}

      {reason.offerFormula && !reason.blocked && (
        <p className="mt-2 text-xs text-gray-700">{reason.offerFormula}</p>
      )}

      {reason.listContext && (
        <p className="mt-2 rounded-md border border-violet-200 bg-violet-50/60 px-2 py-1.5 text-xs text-violet-950">
          {reason.listContext}
        </p>
      )}

      {reason.paragraphs.length > 0 && (
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-gray-700">
          {reason.paragraphs.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {reason.warnings.length > 0 && (
        <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-amber-900">
          {reason.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[10px] text-gray-400">
        {reason.isProductionOffer
          ? "Live store offer from V2."
          : "Production offer unchanged — V2 shadow rationale only."}
      </p>
    </div>
  );
}
