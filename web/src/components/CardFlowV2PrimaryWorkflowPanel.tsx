"use client";

import type {
  CardCandidateBundle,
  CardFlowV2EvidenceBundle,
} from "@/lib/card-flow-v2/types";
import type { CardFlowV2MarketBundle } from "@/lib/card-flow-v2/market/types";
import { getPrimaryMarketSnapshot } from "@/lib/card-flow-v2/market/promote-staff-confirmed-market";
import { getStaffSelectedSuspect } from "@/lib/card-flow-v2/staff-suspect-selection";
import { CardFlowV2SuspectPicker } from "@/components/CardFlowV2SuspectPicker";
import { CardFlowV2SourceHealthPanel } from "@/components/CardFlowV2SourceHealthPanel";
import { CardFlowV2OfferPreviewPanel } from "@/components/CardFlowV2OfferPreviewPanel";
import { CardFlowV2ConfirmedPricingPanel } from "@/components/CardFlowV2ConfirmedPricingPanel";
import type { V2OfferPreview } from "@/lib/card-flow-v2/offer/types";

export function CardFlowV2PrimaryWorkflowPanel({
  cardId,
  identity,
  market,
  offerPreview,
  onSaved,
}: {
  cardId: string;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  offerPreview?: V2OfferPreview;
  onSaved?: (payload?: {
    identity?: CardCandidateBundle;
    market?: CardFlowV2MarketBundle;
    offerPreview?: V2OfferPreview;
  }) => void;
}) {
  if (!identity && !market && !offerPreview) return null;

  const staffSuspect = identity ? getStaffSelectedSuspect(identity) : undefined;
  const primarySnap = getPrimaryMarketSnapshot(market);
  const locked = identity?.lockedIdentity;

  return (
    <div className="space-y-4 rounded-lg border border-violet-300 bg-violet-50/40 p-4">
      <p className="text-sm font-semibold text-violet-950">V2 staff workflow</p>

      {staffSuspect && identity ? (
        <CardFlowV2ConfirmedPricingPanel
          identity={identity}
          market={market}
          offerPreview={offerPreview}
        />
      ) : (
        <CardFlowV2OfferPreviewPanel preview={offerPreview} />
      )}

      {identity && identity.suspects.length > 0 && (
        <CardFlowV2SuspectPicker
          cardId={cardId}
          identity={identity}
          market={market}
          onSaved={onSaved}
        />
      )}

      {primarySnap && (
        <div className="rounded border border-violet-100 bg-white p-3 text-xs">
          <p className="mb-2 font-medium text-violet-900">Source health</p>
          <CardFlowV2SourceHealthPanel snap={primarySnap} />
        </div>
      )}

      {locked && (
        <div className="rounded border border-violet-100 bg-white p-3 text-xs text-gray-800">
          <p className="font-medium text-violet-900">V2 identity</p>
          <p className="mt-1">
            {locked.locked ? "Locked" : locked.lockStatus.replace(/_/g, " ")}
            {" · "}
            confidence {(locked.confidence * 100).toFixed(0)}%
          </p>
          <p className="mt-1 text-gray-600">{locked.staffMessage}</p>
        </div>
      )}
    </div>
  );
}

/** Collapsible evidence + debug — shown after production V1 panel. */
export function CardFlowV2DebugPanel({
  evidence,
  identity,
  market,
  offerPreview,
  audit,
}: {
  evidence?: CardFlowV2EvidenceBundle;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  offerPreview?: V2OfferPreview;
  audit?: unknown;
}) {
  if (!evidence && !identity && !market) return null;

  return (
    <details className="rounded-lg border border-gray-200 bg-gray-50/50">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700">
        Full V2 evidence &amp; debug JSON
      </summary>
      <div className="border-t border-gray-200 px-4 py-3">
        <pre className="max-h-96 overflow-auto rounded bg-white p-2 text-xs">
          {JSON.stringify(
            { evidence, identity, market, offerPreview, audit },
            null,
            2,
          )}
        </pre>
      </div>
    </details>
  );
}
