"use client";

import type { CandidateMarketSnapshot } from "@/lib/card-flow-v2/market/types";
import { friendlyPcSkipReason } from "@/lib/card-flow-v2/v2-staff-labels";
import { CardFlowV2SourceHealthPanel } from "@/components/CardFlowV2SourceHealthPanel";

function sourceLine(
  snap: CandidateMarketSnapshot,
): Array<{ label: string; detail: string }> {
  const lines: Array<{ label: string; detail: string }> = [];
  const health = snap.sourceHealth ?? [];

  for (const h of health) {
    const name = h.source.replace(/_/g, " ");
    if (!h.attempted) {
      lines.push({ label: name, detail: "not attempted" });
      continue;
    }
    if (h.fatalError) {
      lines.push({
        label: name,
        detail: h.fatalError.includes("403") || h.fatalError.includes("authorization")
          ? "unavailable"
          : h.fatalError.replace(/_/g, " "),
      });
      continue;
    }
    if (h.priceSignalsFound > 0) {
      lines.push({ label: name, detail: `${h.priceSignalsFound} signal(s)` });
    } else if (h.acceptedCount > 0) {
      lines.push({ label: name, detail: `${h.acceptedCount} accepted` });
    } else if (h.maybeCount > 0) {
      lines.push({ label: name, detail: "sanity only" });
    } else if (h.reasonIfSkipped) {
      lines.push({
        label: name,
        detail: friendlyPcSkipReason(h.reasonIfSkipped) || "skipped",
      });
    } else {
      lines.push({ label: name, detail: "no results" });
    }
  }

  if (snap.priceChartingMapping?.reasonIfSkipped) {
    const pc = lines.find((l) => l.label.toLowerCase().includes("pricecharting"));
    if (pc) {
      pc.detail = friendlyPcSkipReason(snap.priceChartingMapping.reasonIfSkipped);
    } else {
      lines.push({
        label: "PriceCharting",
        detail: friendlyPcSkipReason(snap.priceChartingMapping.reasonIfSkipped),
      });
    }
  }

  if (snap.valueMedian != null) {
    const scryfall = snap.marketOutcome?.pricingSignalDetails?.find(
      (s) => s.source === "scryfall_print_price" || s.label.toLowerCase().includes("scryfall"),
    );
    if (scryfall) {
      lines.unshift({
        label: "Scryfall",
        detail: `$${scryfall.price.toFixed(2)} used`,
      });
    }
  }

  return lines.slice(0, 6);
}

/** Collapsed source details — Step 5. Full panel inside details. */
export function CardFlowV2SourceHealthSummary({
  snap,
}: {
  snap: CandidateMarketSnapshot;
}) {
  const lines = sourceLine(snap);

  return (
    <details className="rounded-lg border border-gray-200 bg-white">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-gray-800 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span>Source Details</span>
          <span className="text-xs font-normal text-indigo-600">Show details</span>
        </span>
        <ul className="mt-2 space-y-0.5 text-xs font-normal text-gray-600">
          {lines.map((l) => (
            <li key={l.label}>
              {l.label}: {l.detail}
            </li>
          ))}
        </ul>
      </summary>
      <div className="border-t border-gray-100 px-4 py-3">
        <CardFlowV2SourceHealthPanel snap={snap} />
      </div>
    </details>
  );
}
