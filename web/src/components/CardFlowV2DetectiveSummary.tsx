"use client";

import type { CardFlowV2EvidenceBundle } from "@/lib/card-flow-v2/types";
import { buildDetectiveEvidenceRows } from "@/lib/card-flow-v2/clerk-scan-identity-display";
import { CardOfferReasonPanel } from "@/components/CardOfferReasonPanel";
import type { V2OfferReasonExplanation } from "@/lib/card-flow-v2/v2-offer-reason";

/** Scan detective readout + value estimate for the Reason flip-card back. */
export function CardFlowV2DetectiveSummary({
  evidence,
  offerReason,
}: {
  evidence?: CardFlowV2EvidenceBundle;
  offerReason: V2OfferReasonExplanation | null;
}) {
  const imageEvidence = evidence?.imageEvidence;
  const detectiveRows = buildDetectiveEvidenceRows(imageEvidence);
  const staffMessage = imageEvidence?.staffMessage?.trim();
  const guide = evidence?.detectiveGuide;

  return (
    <div className="space-y-3">
      {detectiveRows.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Scan detective
          </p>
          <p className="mt-0.5 text-[10px] text-gray-500">
            From customer photos — same vision pass as catalog matching.
          </p>
          <dl className="mt-2 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-xs">
            {detectiveRows.map((row) => (
              <div
                key={row.label}
                className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-2 px-2 py-1.5"
              >
                <dt className="font-semibold text-gray-600">{row.label}</dt>
                <dd className="font-medium text-gray-900">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {staffMessage && (
        <div className="rounded-md border border-violet-100 bg-violet-50/50 px-2 py-2 text-xs text-violet-950">
          <p className="font-semibold">Detective note</p>
          <p className="mt-0.5 leading-relaxed">{staffMessage}</p>
        </div>
      )}

      {guide?.staffTips?.[0] && (
        <p className="text-xs text-gray-600">
          <span className="font-semibold text-gray-700">Tip: </span>
          {guide.staffTips[0]}
        </p>
      )}

      <div>
        <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-gray-500">
          Value estimate
        </p>
        <CardOfferReasonPanel reason={offerReason} />
      </div>
    </div>
  );
}
