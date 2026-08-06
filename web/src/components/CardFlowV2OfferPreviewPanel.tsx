"use client";

import { useState } from "react";
import type { V2OfferPreview } from "@/lib/card-flow-v2/offer/types";

const ACTION_LABELS: Record<V2OfferPreview["recommendedAction"], string> = {
  eligible_for_future_guarded_offer: "Eligible for Future Guarded Offer",
  staff_confirmed_preview_ready: "Staff-Confirmed Preview Ready",
  staff_review_required: "Staff Review Required",
  manual_price_required: "Manual Price Required",
  insufficient_market_data: "Insufficient Market Data",
  identity_confirmation_required: "Identity Confirmation Required",
  store_rule_rejected: "Rejected — Store Rule",
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-800 bg-green-100",
  medium: "text-blue-800 bg-blue-100",
  low: "text-amber-800 bg-amber-100",
  none: "text-gray-800 bg-gray-100",
};

function formatBasis(basis: string): string {
  return basis.replace(/_/g, " ");
}

function formatMoney(n?: number): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function formatDiff(n?: number): string {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${n.toFixed(2)}`;
}

export function CardFlowV2OfferPreviewPanel({
  preview,
}: {
  preview?: V2OfferPreview;
}) {
  const [open, setOpen] = useState(false);

  if (!preview?.enabled) return null;

  const { marketDecision: md } = preview;
  const confidenceClass =
    CONFIDENCE_COLORS[md.confidence] ?? "text-gray-800 bg-gray-100";
  const actionLabel = ACTION_LABELS[preview.recommendedAction];

  return (
    <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50/50">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-emerald-900"
        onClick={() => setOpen((v) => !v)}
      >
        <span>V2 Offer Preview — Shadow Only</span>
        <span className="text-xs font-normal text-emerald-700">
          {open ? "Hide" : "Show"}
          {" · "}
          {preview.eligible ? "eligible" : "blocked"}
          {" · "}
          {actionLabel}
        </span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-emerald-200 px-4 py-3 text-sm">
          <div>
            <p className="font-semibold text-emerald-900">{actionLabel}</p>
            <p className="mt-1 text-xs text-gray-600">{md.explanation}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <InfoRow label="Eligibility" value={preview.eligible ? "Yes" : "No"} />
            <InfoRow
              label="Identity basis"
              value={preview.identityBasis?.replace(/_/g, " ") ?? "—"}
            />
            {preview.variantUncertaintyStatus && (
              <InfoRow
                label="Variant uncertainty"
                value={preview.variantUncertaintyStatus.replace(/_/g, " ")}
              />
            )}
            <InfoRow label="Market value basis" value={formatBasis(md.basis)} />
            <InfoRow label="Market value" value={formatMoney(md.marketValue)} />
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Confidence
              </p>
              <span
                className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${confidenceClass}`}
              >
                {md.confidence}
              </span>
            </div>
          </div>

          {md.blockers.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
                Blockers
              </p>
              <ul className="mt-1 list-inside list-disc text-xs text-red-900">
                {md.blockers.map((b) => (
                  <li key={b}>{b.replace(/_/g, " ")}</li>
                ))}
              </ul>
            </div>
          )}

          {md.warnings.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Warnings
              </p>
              <ul className="mt-1 list-inside list-disc text-xs text-amber-900">
                {md.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {md.sourceValues.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
                Source values
              </p>
              <div className="mt-1 space-y-1 text-xs">
                {md.sourceValues.map((s) => (
                  <p key={`${s.source}-${s.label}`} className="text-gray-700">
                    {s.source}: {s.label} — {formatMoney(s.value)}
                    {s.used ? " (used)" : s.reason ? ` (${s.reason})` : ""}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="rounded border border-emerald-100 bg-white p-3 text-xs">
            <p className="font-semibold text-gray-800">Current vs preview</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <p>
                Current market: {formatMoney(preview.currentMarketPrice)}
              </p>
              <p>
                Preview market: {formatMoney(preview.previewMarketValue)}
              </p>
              <p>Current cash: {formatMoney(preview.currentCashOffer)}</p>
              <p>Preview cash: {formatMoney(preview.previewCashOffer)}</p>
              <p>Current trade: {formatMoney(preview.currentTradeOffer)}</p>
              <p>Preview trade: {formatMoney(preview.previewTradeOffer)}</p>
              <p>Cash diff: {formatDiff(preview.cashDifference)}</p>
              <p>Trade diff: {formatDiff(preview.tradeDifference)}</p>
            </div>
            {preview.pricingRuleApplied && (
              <p className="mt-2 text-gray-600">
                Pricing rule: {preview.pricingRuleApplied}
              </p>
            )}
          </div>

          <p className="text-xs text-gray-500">
            Shadow preview only — production market/cash/trade/status unchanged.
          </p>
        </div>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">
        {label}
      </p>
      <p className="mt-0.5 text-gray-800">{value}</p>
    </div>
  );
}
