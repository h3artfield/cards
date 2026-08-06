"use client";

import type { ScannedCard } from "@/lib/types";

export function CardFlowV2ProductionOfferPanel({
  card,
  clerkWarning,
}: {
  card: ScannedCard;
  clerkWarning?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 px-4 py-3 text-sm">
      <p className="font-semibold text-slate-900">Offer comparison (manager)</p>
      <p className="mt-1 text-xs text-slate-600">
        Stored offer on the card record vs the confirmed-printing estimate.
      </p>
      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-slate-600">Market</dt>
          <dd className="font-medium">${(card.marketPrice ?? 0).toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-600">Cash</dt>
          <dd>${(card.cashOffer ?? 0).toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-600">Trade</dt>
          <dd>${(card.tradeOffer ?? 0).toFixed(2)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-slate-600">Status</dt>
          <dd className="capitalize">{card.status.replace(/_/g, " ")}</dd>
        </div>
      </dl>
      {clerkWarning && (
        <p className="mt-2 text-xs font-medium text-red-800">{clerkWarning}</p>
      )}
    </div>
  );
}
