"use client";

import { useState } from "react";
import type { ScannedCard } from "@/lib/types";
import type { CardCandidateBundle } from "@/lib/card-flow-v2/types";
import type { CardFlowV2MarketBundle } from "@/lib/card-flow-v2/market/types";
import type { CardFlowV2AuditRecord } from "@/lib/card-flow-v2/audit/types";
import type { V2OfferPreview } from "@/lib/card-flow-v2/offer/types";
import type { V2ReviewStatus } from "@/lib/card-flow-v2/v2-review-status";
import type { ManualMarketCompSource } from "@/lib/card-flow-v2/market/manual-market-comp";
import { buildMarketResearchAssist } from "@/lib/card-flow-v2/market/market-research-queries";
import { shouldShowMarketResearchAssist } from "@/lib/card-flow-v2/market/market-research-eligibility";
import { getPrimarySnapshotWithManualComps } from "@/lib/card-flow-v2/market/manual-comp-snapshot";
import { getStaffSelectedSuspect } from "@/lib/card-flow-v2/staff-suspect-selection";
import { adminFetch } from "@/lib/api-client";
import { Button } from "@/components/Button";

function money(n?: number): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

/** Human-assisted comp research — manual comp entry only; links live under Check live listings. */
export function CardFlowV2MarketResearchPanel({
  card,
  identity,
  market,
  offerPreview,
  audit,
  reviewStatus,
  onSaved,
}: {
  card: ScannedCard;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  offerPreview?: V2OfferPreview;
  audit?: CardFlowV2AuditRecord;
  reviewStatus: V2ReviewStatus;
  onSaved?: () => void | Promise<void>;
}) {
  const idn = identity ?? card.cardFlowV2Identity;
  const suspect =
    (idn ? getStaffSelectedSuspect(idn) : undefined) ?? idn?.suspects[0];

  const suspectId =
    suspect?.suspectId ??
    market?.selectedSuspectId ??
    identity?.staffSelection?.suspectId;

  const primarySnap = getPrimarySnapshotWithManualComps({
    market,
    manualComps: card.cardFlowV2ManualComps,
    suspectId,
  });
  const visible = shouldShowMarketResearchAssist({
    reviewStatus,
    offerPreview,
    audit,
    primarySnap,
  });

  const assist = buildMarketResearchAssist({
    card,
    suspect,
    snapshot: primarySnap,
  });

  const manualComps = card.cardFlowV2ManualComps ?? [];

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    source: "ebay_sold_manual" as ManualMarketCompSource,
    title: "",
    soldPrice: "",
    shipping: "",
    url: "",
    soldDate: "",
    condition: "",
    notes: "",
    accepted: true,
  });

  if (!visible && manualComps.length === 0) return null;

  async function submitComp() {
    setBusy(true);
    setError(null);
    try {
      const soldPrice = parseFloat(form.soldPrice);
      if (!form.title.trim() || Number.isNaN(soldPrice)) {
        throw new Error("Title and sold price are required");
      }
      const res = await adminFetch(`/api/admin/cards/${card.id}/manual-comps`, {
        method: "POST",
        body: JSON.stringify({
          source: form.source,
          title: form.title.trim(),
          soldPrice,
          shipping: form.shipping ? parseFloat(form.shipping) : undefined,
          url: form.url.trim() || undefined,
          soldDate: form.soldDate || undefined,
          condition: form.condition.trim() || undefined,
          notes: form.notes.trim() || undefined,
          accepted: form.accepted,
          suspectId: assist.suspectId,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save comp");
      setForm({
        source: "ebay_sold_manual",
        title: "",
        soldPrice: "",
        shipping: "",
        url: "",
        soldDate: "",
        condition: "",
        notes: "",
        accepted: true,
      });
      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save comp");
    } finally {
      setBusy(false);
    }
  }

  async function toggleAccepted(compId: string, accepted: boolean) {
    setBusy(true);
    setError(null);
    try {
      const res = await adminFetch(`/api/admin/cards/${card.id}/manual-comps`, {
        method: "PATCH",
        body: JSON.stringify({ compId, accepted }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update comp");
      await onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update comp");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3 text-sm">
      {manualComps.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-800">Human-reviewed comps</p>
          {manualComps.map((c) => (
            <div
              key={c.id}
              className={`rounded border px-2 py-1.5 text-xs ${
                c.accepted
                  ? "border-emerald-200 bg-emerald-50/80"
                  : "border-gray-200 bg-gray-50"
              }`}
            >
              <p className="font-medium">
                {c.accepted ? "✓ accepted" : "✗ rejected"} · {money(c.soldPrice)}{" "}
                <span className="font-normal text-gray-600">({c.source})</span>
              </p>
              <p className="text-gray-700">{c.title}</p>
              <p className="text-[10px] text-gray-500">
                human-reviewed · {c.reviewedBy} ·{" "}
                {new Date(c.reviewedAt).toLocaleString()}
              </p>
              {c.url && (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-indigo-700 hover:underline"
                >
                  Source link
                </a>
              )}
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="text-[10px] font-medium text-indigo-700 hover:underline disabled:opacity-50"
                  onClick={() => void toggleAccepted(c.id, !c.accepted)}
                >
                  Mark {c.accepted ? "rejected" : "accepted"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {visible && (
      <details className="rounded border border-gray-200 bg-white/60">
        <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-gray-800">
          Add manual comp
        </summary>
        <div className="space-y-2 border-t border-sky-100 px-3 py-3 text-xs">
          <label className="block">
            Source
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={form.source}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  source: e.target.value as ManualMarketCompSource,
                }))
              }
            >
              <option value="tcgplayer_manual">TCGplayer (manual)</option>
              <option value="ebay_sold_manual">eBay sold (manual)</option>
              <option value="pricecharting_manual">PriceCharting (manual)</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block">
            Listing title
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              Sold price
              <input
                type="number"
                step="0.01"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={form.soldPrice}
                onChange={(e) =>
                  setForm((f) => ({ ...f, soldPrice: e.target.value }))
                }
              />
            </label>
            <label className="block">
              Shipping
              <input
                type="number"
                step="0.01"
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
                value={form.shipping}
                onChange={(e) =>
                  setForm((f) => ({ ...f, shipping: e.target.value }))
                }
              />
            </label>
          </div>
          <label className="block">
            Source URL
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
            />
          </label>
          <label className="block">
            Notes
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <Button
            variant="secondary"
            className="min-h-9 w-full"
            disabled={busy}
            onClick={() => void submitComp()}
          >
            {busy ? "Saving…" : "Save human-reviewed comp"}
          </Button>
        </div>
      </details>
      )}

      {error && (
        <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-900">
          {error}
        </p>
      )}
    </div>
  );
}
