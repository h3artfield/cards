"use client";

import { useState } from "react";
import type { CardFlowV2AuditRecord, V2StaffReviewStatus } from "@/lib/card-flow-v2/audit/types";

const REVIEW_OPTIONS: { value: V2StaffReviewStatus; label: string }[] = [
  { value: "not_reviewed", label: "Not reviewed" },
  { value: "staff_confirmed_v2", label: "V2 correct" },
  { value: "staff_confirmed_current", label: "Current pricing correct" },
  { value: "staff_corrected_identity", label: "Identity corrected" },
  { value: "staff_corrected_value", label: "Value corrected" },
  { value: "staff_requested_rescan", label: "Needs rescan" },
  { value: "staff_manual_price", label: "Manual price entered" },
];

const RISK_COLORS: Record<string, string> = {
  low: "text-green-800 bg-green-100",
  medium: "text-amber-800 bg-amber-100",
  high: "text-orange-800 bg-orange-100",
  critical: "text-red-800 bg-red-100",
};

export function CardFlowV2AuditPanel({
  cardId,
  audit,
  onSaved,
}: {
  cardId: string;
  audit?: CardFlowV2AuditRecord;
  onSaved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<V2StaffReviewStatus>(
    audit?.staffCorrection?.status ?? "not_reviewed",
  );
  const [notes, setNotes] = useState(audit?.staffCorrection?.notes ?? "");
  const [correctedMarketValue, setCorrectedMarketValue] = useState(
    audit?.staffCorrection?.correctedMarketValue?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (!audit) return null;

  const { priceComparison: pc } = audit;
  const riskClass = RISK_COLORS[audit.riskLevel] ?? "text-gray-800 bg-gray-100";

  async function saveReview() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/cards/${cardId}/v2-audit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffCorrection: {
            status,
            notes: notes.trim() || undefined,
            correctedMarketValue:
              correctedMarketValue.trim() !== ""
                ? parseFloat(correctedMarketValue)
                : undefined,
          },
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Save failed");
      }
      onSaved?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50/50">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-amber-900"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Card Flow V2 Audit</span>
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${riskClass}`}>
          {audit.riskLevel} risk
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-amber-200 px-4 py-3 text-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Current production
              </h4>
              <p>Market: {fmtPrice(audit.currentMarketPrice)}</p>
              <p>Cash: {fmtPrice(audit.currentCashOffer)}</p>
              <p>Trade: {fmtPrice(audit.currentTradeOffer)}</p>
              <p>Status: {audit.currentStatus ?? "—"}</p>
            </div>
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                V2 shadow
              </h4>
              <p>
                Identity:{" "}
                {audit.v2Locked
                  ? "locked"
                  : audit.v2LockStatus.replace(/_/g, " ")}
                {" · "}
                {(audit.v2IdentityConfidence * 100).toFixed(0)}%
              </p>
              <p>Market mode: {audit.v2MarketMode.replace(/_/g, " ")}</p>
              <p>
                Shadow value:{" "}
                {pc.v2ValueMedian != null
                  ? `$${pc.v2ValueLow?.toFixed(0) ?? "?"}–$${pc.v2ValueHigh?.toFixed(0) ?? "?"} (median $${pc.v2ValueMedian.toFixed(2)})`
                  : "none"}
              </p>
              <p>Confidence: {audit.v2MarketConfidence}</p>
              {audit.topV2MarketProductName && (
                <p className="text-gray-700">{audit.topV2MarketProductName}</p>
              )}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Agreement
            </h4>
            <p>
              {pc.agreement.replace(/_/g, " ")}
              {pc.percentDifference != null &&
                pc.agreement !== "not_comparable" &&
                ` (${(pc.percentDifference * 100).toFixed(0)}% diff)`}
            </p>
            <p className="text-xs text-gray-600">
              Comps: {audit.acceptedCompCount} accepted, {audit.rejectedCompCount}{" "}
              rejected, {audit.maybeCompCount} maybe
            </p>
          </div>

          {audit.issues.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                Issues
              </h4>
              <ul className="list-inside list-disc text-gray-800">
                {audit.issues.map((issue) => (
                  <li key={issue}>{issue.replace(/_/g, " ")}</li>
                ))}
              </ul>
            </div>
          )}

          <pre className="whitespace-pre-wrap rounded bg-white p-3 text-xs text-gray-800">
            {audit.recommendedStaffAction}
          </pre>

          <div className="space-y-2 rounded border border-amber-100 bg-white p-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Staff review
            </h4>
            <select
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as V2StaffReviewStatus)}
            >
              {REVIEW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.01"
              placeholder="Corrected market value (optional)"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              value={correctedMarketValue}
              onChange={(e) => setCorrectedMarketValue(e.target.value)}
            />
            <textarea
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
              rows={3}
              placeholder="Notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            {audit.staffCorrection?.reviewedAt && (
              <p className="text-xs text-gray-500">
                Last reviewed {audit.staffCorrection.reviewedAt}
                {audit.staffCorrection.reviewedBy
                  ? ` by ${audit.staffCorrection.reviewedBy}`
                  : ""}
              </p>
            )}
            {saveError && <p className="text-xs text-red-600">{saveError}</p>}
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveReview()}
              className="rounded bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save staff review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function fmtPrice(n?: number): string {
  if (n == null || n <= 0) return "—";
  return `$${n.toFixed(2)}`;
}
