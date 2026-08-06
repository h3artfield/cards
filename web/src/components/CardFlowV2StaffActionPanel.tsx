"use client";

import type { CardFlowV2AuditRecord } from "@/lib/card-flow-v2/audit/types";
import type { V2OfferPreview } from "@/lib/card-flow-v2/offer/types";
import type { V2ReviewStatus } from "@/lib/card-flow-v2/v2-review-status";
import type { StaffTrainingExplanation } from "@/lib/card-flow-v2/staff-training-explanation";
import { detectStaleV2Metadata } from "@/lib/card-flow-v2/version-metadata";
import type { CardFlowV2VersionMetadata } from "@/lib/card-flow-v2/version-metadata";

function money(n?: number): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

/** Short warning / staff action — clerk mode uses plain language only. */
export function CardFlowV2StaffActionPanel({
  reviewStatus,
  productionMarketPrice,
  offerPreview,
  staffTraining,
  versionMetadata,
  clerkMode = false,
}: {
  reviewStatus: V2ReviewStatus;
  productionMarketPrice?: number;
  offerPreview?: V2OfferPreview;
  audit?: CardFlowV2AuditRecord;
  staffTraining?: StaffTrainingExplanation | null;
  priceChartingMapping?: unknown;
  versionMetadata?: CardFlowV2VersionMetadata | null;
  clerkMode?: boolean;
}) {
  const stale = detectStaleV2Metadata(versionMetadata);
  const previewVal =
    offerPreview?.previewMarketValue ?? offerPreview?.marketDecision.marketValue;
  const training = staffTraining?.paragraphs ?? [];

  if (stale.stale) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
        <p className="font-semibold">V2 review may be stale</p>
        <p className="mt-1 text-xs">{stale.message}</p>
        <p className="mt-2 text-xs font-medium">
          Action: Re-run V2 shadow analysis below, or ask a manager.
        </p>
      </div>
    );
  }

  if (reviewStatus === "v2_production_price_warning") {
    if (clerkMode) {
      return (
        <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-950">
          <p className="font-semibold">Production price warning</p>
          <p className="mt-2 text-xs">
            Production pricing may not match the confirmed printing. Confirm the
            exact version above, then send to manager review.
          </p>
          <p className="mt-3 text-xs font-medium">
            Action: Manager review before accepting.
          </p>
        </div>
      );
    }

    return (
      <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-3 text-sm text-red-950">
        <p className="font-semibold">Production price warning</p>
        <p className="mt-2 text-xs">
          The production price may be wrong.
          {training[0] ? ` ${training[0]}` : ""}
        </p>
        {training[1] && <p className="mt-1 text-xs">{training[1]}</p>}
        {previewVal != null && productionMarketPrice != null && (
          <p className="mt-2 text-xs">
            Production {money(productionMarketPrice)} · V2 {money(previewVal)}
          </p>
        )}
        <p className="mt-3 text-xs font-medium">
          Action: Send to manager review before accepting.
        </p>
      </div>
    );
  }

  if (reviewStatus === "v2_source_disagreement") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-950">
        <p className="font-semibold">Pricing source disagreement</p>
        <p className="mt-2 text-xs">
          {training[0] ?? "Pricing sources disagree too much."}
        </p>
        {training[1] && <p className="mt-1 text-xs">{training[1]}</p>}
        <p className="mt-3 text-xs font-medium">
          Action: Manager review required. Do not average values.
        </p>
      </div>
    );
  }

  if (reviewStatus === "v2_needs_identity_confirmation") {
    return (
      <p className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-3 text-sm text-violet-950">
        Confirm the printing that matches the photos before accepting any offer.
      </p>
    );
  }

  if (reviewStatus === "v2_staff_confirmed_blocked") {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
        V2 preview is blocked after confirmation. Manager review required.
      </p>
    );
  }

  if (reviewStatus === "v2_needs_pricing_review") {
    return (
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
        Pricing needs manager review before accepting this offer.
      </p>
    );
  }

  return null;
}
