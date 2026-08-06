"use client";

import type { V2OfferPreview } from "@/lib/card-flow-v2/offer/types";
import type { ScannedCard } from "@/lib/types";
import {
  friendlyBasis,
  friendlyBlocker,
} from "@/lib/card-flow-v2/v2-staff-labels";

function money(n?: number): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

/** Compact V2 pricing summary for mobile staff workflow — Step 2. */
export function CardFlowV2PricingSummary({
  preview,
  card,
}: {
  preview?: V2OfferPreview;
  card?: ScannedCard;
}) {
  if (!preview?.enabled) {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        V2 pricing preview not available yet.
      </div>
    );
  }

  const md = preview.marketDecision;
  const blocked = !preview.eligible;
  const marketVal = preview.previewMarketValue ?? md.marketValue;

  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm">
      <p className="font-semibold text-emerald-950">Offer estimate</p>

      {blocked ? (
        <div className="mt-2 space-y-1 text-sm text-red-900">
          <p className="font-medium">Preview blocked</p>
          {md.blockers.slice(0, 3).map((b) => (
            <p key={b} className="text-xs">
              · {friendlyBlocker(b)}
            </p>
          ))}
          {md.sourceValues.length > 0 && (
            <div className="mt-2 text-xs text-gray-800">
              {md.sourceValues.map((s) => (
                <p key={`${s.source}-${s.label}`}>
                  {s.label}: {money(s.value)}
                  {!s.used && s.reason ? " (not used)" : ""}
                </p>
              ))}
            </div>
          )}
        </div>
      ) : (
        <dl className="mt-2 space-y-0.5 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-gray-900">Market</dt>
            <dd className="font-bold text-gray-900">{money(marketVal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-gray-900">Cash</dt>
            <dd className="font-bold text-gray-900">{money(preview.previewCashOffer)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-semibold text-gray-900">Trade</dt>
            <dd className="font-bold text-gray-900">{money(preview.previewTradeOffer)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-medium text-gray-900">Confidence</dt>
            <dd className="capitalize text-gray-900">{md.confidence}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-medium text-gray-900">Basis</dt>
            <dd className="text-right text-xs text-gray-900">{friendlyBasis(md.basis)}</dd>
          </div>
        </dl>
      )}

      {md.basis && md.basis !== "none" && (
        <p className="mt-2 text-xs text-gray-700">{friendlyBasis(md.basis)}</p>
      )}
    </div>
  );
}
