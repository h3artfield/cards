"use client";

import { useState } from "react";
import type { CardCandidateBundle } from "@/lib/card-flow-v2/types";
import type { CardFlowV2MarketBundle } from "@/lib/card-flow-v2/market/types";
import type { V2OfferPreview } from "@/lib/card-flow-v2/offer/types";
import {
  pricingReadinessLabel,
  type V2PricingReadinessState,
} from "@/lib/card-flow-v2/offer/pricing-readiness";
import { getPrimaryMarketSnapshot } from "@/lib/card-flow-v2/market/promote-staff-confirmed-market";
import { getStaffSelectedSuspect } from "@/lib/card-flow-v2/staff-suspect-selection";
import { CardFlowV2SourceHealthPanel } from "@/components/CardFlowV2SourceHealthPanel";

const READINESS_COLORS: Record<string, string> = {
  ready: "bg-emerald-100 text-emerald-900",
  ready_low_confidence: "bg-blue-100 text-blue-900",
  blocked: "bg-red-100 text-red-900",
  stale: "bg-amber-100 text-amber-900",
};

function readinessTone(state: V2PricingReadinessState): string {
  if (state === "ready") return READINESS_COLORS.ready!;
  if (state === "ready_low_confidence") return READINESS_COLORS.ready_low_confidence!;
  if (state === "stale_snapshot_needs_refresh") return READINESS_COLORS.stale!;
  return READINESS_COLORS.blocked!;
}

function formatMoney(n?: number): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

export function CardFlowV2ConfirmedPricingPanel({
  identity,
  market,
  offerPreview,
}: {
  identity: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  offerPreview?: V2OfferPreview;
}) {
  const [open, setOpen] = useState(true);
  const suspect = getStaffSelectedSuspect(identity);
  if (!suspect) return null;

  const snapshot = getPrimaryMarketSnapshot(market);
  const promotion = market?.staffConfirmedPromotion;
  const md = offerPreview?.marketDecision;
  const readiness =
    offerPreview?.pricingReadinessState ??
    (offerPreview?.eligible ? "ready" : "blocked_insufficient_market_data");

  const blocked = !offerPreview?.eligible;
  const tone = readinessTone(readiness);

  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50/80">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-emerald-950"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Confirmed V2 Pricing — Shadow Only</span>
        <span className="text-xs font-normal text-emerald-800">
          {open ? "Hide" : "Show"} · {pricingReadinessLabel(readiness)}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-emerald-200 px-4 py-3 text-sm">
          <p className="text-xs font-medium text-emerald-900">
            Shadow only — production offer not changed.
          </p>

          <div className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${tone}`}>
            {blocked ? "Pricing blocked" : "Preview ready"} ·{" "}
            {pricingReadinessLabel(readiness)}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <Row label="Confirmed suspect" value={suspect.label} />
            <Row
              label="Identity basis"
              value={offerPreview?.identityBasis?.replace(/_/g, " ") ?? "—"}
            />
            <Row label="Market mode" value={market?.mode.replace(/_/g, " ") ?? "—"} />
            <Row
              label="Promoted from snapshot"
              value={
                promotion?.promotedFromSnapshot == null
                  ? "—"
                  : promotion.promotedFromSnapshot
                    ? "yes"
                    : "no (refetched)"
              }
            />
            {snapshot?.marketSnapshotReason && (
              <Row label="Snapshot reason" value={snapshot.marketSnapshotReason.replace(/_/g, " ")} />
            )}
            {promotion?.marketRefetchReason && (
              <Row
                label="Snapshot note"
                value={promotion.marketRefetchReason.replace(/_/g, " ")}
              />
            )}
          </div>

          {!blocked && (
            <div className="rounded border border-emerald-100 bg-white p-3 text-xs">
              <p className="font-semibold text-gray-800">Shadow preview</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <p>Market value: {formatMoney(offerPreview?.previewMarketValue ?? md?.marketValue)}</p>
                <p>Range: {formatMoney(md?.valueLow)} – {formatMoney(md?.valueHigh)}</p>
                <p>Cash preview: {formatMoney(offerPreview?.previewCashOffer)}</p>
                <p>Trade preview: {formatMoney(offerPreview?.previewTradeOffer)}</p>
                <p>Basis: {md?.basis.replace(/_/g, " ") ?? "—"}</p>
                <p>Confidence: {md?.confidence ?? "—"}</p>
              </div>
            </div>
          )}

          {blocked && md && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-xs text-red-950">
              <p className="font-semibold">Pricing status: Blocked</p>
              <p className="mt-1">{md.explanation}</p>
              {md.blockers.length > 0 && (
                <ul className="mt-2 list-inside list-disc">
                  {md.blockers.map((b) => (
                    <li key={b}>{b.replace(/_/g, " ")}</li>
                  ))}
                </ul>
              )}
              {md.sourceValues.length > 0 && (
                <div className="mt-2">
                  {md.sourceValues.map((s) => (
                    <p key={`${s.source}-${s.label}`}>
                      {s.source}: {formatMoney(s.value)}
                      {s.used ? " (used)" : s.reason ? ` (${s.reason})` : ""}
                    </p>
                  ))}
                </div>
              )}
              <p className="mt-2 font-medium">
                Action: {offerPreview?.recommendedAction.replace(/_/g, " ") ?? "staff review required"}
              </p>
            </div>
          )}

          {snapshot && (
            <div className="rounded border border-emerald-100 bg-white p-3 text-xs">
              <p className="font-semibold text-gray-800">Market snapshot</p>
              <p className="mt-1 text-gray-700">{snapshot.marketProductName}</p>
              <p className="text-gray-600">
                Accepted comps: {snapshot.acceptedComps.length} · Maybe/active:{" "}
                {snapshot.maybeComps.length} · Rejected: {snapshot.rejectedComps.length} ·
                Pricing signals: {snapshot.marketOutcome?.pricingSignals ?? 0}
              </p>
              {snapshot.valueMedian != null && (
                <p>
                  Shadow median: {formatMoney(snapshot.valueMedian)} (
                  {formatMoney(snapshot.valueLow)} – {formatMoney(snapshot.valueHigh)})
                </p>
              )}
              <p className="text-gray-600">Method: {snapshot.pricingMethod.replace(/_/g, " ")}</p>
              <CardFlowV2SourceHealthPanel snap={snapshot} />
            </div>
          )}

          <div className="rounded border border-gray-200 bg-white p-3 text-xs">
            <p className="font-semibold text-gray-800">Production vs V2 preview</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <p>Production market: {formatMoney(offerPreview?.currentMarketPrice)}</p>
              <p>Preview market: {formatMoney(offerPreview?.previewMarketValue)}</p>
              <p>Production cash: {formatMoney(offerPreview?.currentCashOffer)}</p>
              <p>Preview cash: {formatMoney(offerPreview?.previewCashOffer)}</p>
              <p>Production trade: {formatMoney(offerPreview?.currentTradeOffer)}</p>
              <p>Preview trade: {formatMoney(offerPreview?.previewTradeOffer)}</p>
            </div>
          </div>

          {offerPreview?.pricingRuleApplied && (
            <p className="text-xs text-gray-600">
              Pricing rule: {offerPreview.pricingRuleApplied}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-semibold uppercase tracking-wide text-emerald-800">{label}</p>
      <p className="mt-0.5 text-gray-800">{value}</p>
    </div>
  );
}
