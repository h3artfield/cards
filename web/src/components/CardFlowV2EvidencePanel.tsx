"use client";

import { useState, type ReactNode } from "react";
import type {
  CardCandidateBundle,
  CardFlowV2EvidenceBundle,
} from "@/lib/card-flow-v2/types";
import type { CardFlowV2MarketBundle } from "@/lib/card-flow-v2/market/types";
import { getStaffSelectedSuspect } from "@/lib/card-flow-v2/staff-suspect-selection";
import { CardFlowV2SuspectPicker } from "@/components/CardFlowV2SuspectPicker";
import { CardFlowV2SourceHealthPanel } from "@/components/CardFlowV2SourceHealthPanel";
import { CardFlowV2OfferPreviewPanel } from "@/components/CardFlowV2OfferPreviewPanel";
import { CardFlowV2ConfirmedPricingPanel } from "@/components/CardFlowV2ConfirmedPricingPanel";
import type { V2OfferPreview } from "@/lib/card-flow-v2/offer/types";

export function CardFlowV2EvidencePanel({
  cardId,
  evidence,
  identity,
  market,
  offerPreview,
  onSaved,
}: {
  cardId?: string;
  evidence?: CardFlowV2EvidenceBundle;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  offerPreview?: V2OfferPreview;
  onSaved?: (payload?: {
    identity?: CardCandidateBundle;
    market?: CardFlowV2MarketBundle;
    offerPreview?: V2OfferPreview;
  }) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!evidence && !identity && !market) return null;

  const { imageEvidence, categoryClassification, detectiveGuide } =
    evidence ?? {
      imageEvidence: undefined,
      categoryClassification: identity
        ? {
            category: identity.category,
            confidence: identity.lockedIdentity.confidence,
            evidence: [],
            detectedSides: [],
            needsHigherVision: false,
          }
        : undefined,
      detectiveGuide: undefined,
    };

  const topAssessment = identity?.suspectAssessments[0];
  const topSuspect = identity?.suspects.find(
    (s) => s.suspectId === topAssessment?.suspectId,
  );
  const locked = identity?.lockedIdentity;
  const staffSuspect = identity ? getStaffSelectedSuspect(identity) : undefined;

  return (
    <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50/50">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-violet-900"
        onClick={() => setOpen((v) => !v)}
      >
        <span>Card Flow V2 Evidence</span>
        <span className="text-xs font-normal text-violet-700">
          {open ? "Hide" : "Show"}
          {categoryClassification
            ? ` · ${categoryClassification.category}`
            : ""}
          {locked
            ? ` · ${locked.locked ? "locked" : locked.lockStatus}`
            : staffSuspect
              ? ` · staff: ${staffSuspect.finish ?? staffSuspect.label.slice(0, 24)}`
            : imageEvidence
              ? ` · ${imageEvidence.identificationMode}`
              : ""}
        </span>
      </button>

      {open && (
        <div className="space-y-4 border-t border-violet-200 px-4 py-3 text-sm">
          {identity && cardId && identity.suspects.length > 0 && (
            <CardFlowV2SuspectPicker
              cardId={cardId}
              identity={identity}
              market={market}
              onSaved={onSaved}
            />
          )}

          {locked && (
            <SummaryBlock title="V2 identity">
              <p className="font-medium">
                {locked.locked ? "Locked" : locked.lockStatus.replace(/_/g, " ")}
                {" · "}
                confidence {(locked.confidence * 100).toFixed(0)}%
              </p>
              {topSuspect && (
                <p className="text-gray-700">Top suspect: {topSuspect.label}</p>
              )}
              <pre className="mt-2 whitespace-pre-wrap rounded bg-white p-2 text-xs text-gray-800">
                {locked.staffMessage}
              </pre>
              {locked.missingRequiredEvidence.length > 0 && (
                <p className="mt-2 text-xs text-red-700">
                  Missing required: {locked.missingRequiredEvidence.join(", ")}
                </p>
              )}
              {locked.unresolvedVariantRisks.length > 0 && (
                <p className="mt-1 text-xs text-amber-800">
                  Variant risks: {locked.unresolvedVariantRisks.slice(0, 3).join("; ")}
                </p>
              )}
              {identity && (
                <p className="mt-1 text-xs text-gray-500">
                  {identity.suspects.length} suspect(s) generated
                </p>
              )}
            </SummaryBlock>
          )}

          {market && (
            <SummaryBlock title="V2 market (shadow)">
              <p className="font-medium">{market.mode.replace(/_/g, " ")}</p>
              <p className="text-xs text-gray-600">
                Identity status: {market.lockedIdentityStatus.replace(/_/g, " ")}
              </p>
              <pre className="mt-2 whitespace-pre-wrap rounded bg-white p-2 text-xs text-gray-800">
                {market.recommendedStaffAction}
              </pre>
              {market.snapshots.map((snap) => (
                <div
                  key={snap.searchPlan.planId}
                  className="mt-3 rounded border border-violet-100 bg-white p-2 text-xs"
                >
                  <p className="font-medium">{snap.marketProductName}</p>
                  {snap.marketOutcome && (
                    <p className="text-gray-700">{snap.marketOutcome.summaryLabel}</p>
                  )}
                  <p className="text-gray-600">
                    Sold comps: {snap.marketOutcome?.acceptedSoldComps ?? snap.acceptedComps.length} ·
                    Maybe: {snap.marketOutcome?.maybeListings ?? snap.maybeComps.length} ·
                    Rejected: {snap.marketOutcome?.rejectedListings ?? snap.rejectedComps.length} ·
                    Pricing signals: {snap.marketOutcome?.pricingSignals ?? 0}
                  </p>
                  <p className="text-gray-600">
                    Confidence: {snap.confidence}
                  </p>
                  {snap.valueMedian != null && (
                    <p>
                      Shadow value: ${snap.valueLow?.toFixed(0)}–$
                      {snap.valueHigh?.toFixed(0)} (median $
                      {snap.valueMedian.toFixed(0)})
                    </p>
                  )}
                  <p className="mt-1 text-gray-500">
                    Queries:{" "}
                    {[
                      ...snap.searchPlan.exactQueries,
                      ...snap.searchPlan.narrowQueries,
                    ]
                      .map((q) => q.query)
                      .slice(0, 3)
                      .join(" | ")}
                  </p>
                  {snap.rejectedComps.slice(0, 2).map((r) => (
                    <p key={r.comp.title} className="text-red-700">
                      Rejected: {r.comp.title.slice(0, 70)} —{" "}
                      {r.rejectionReasons.join(", ")}
                    </p>
                  ))}
                  <CardFlowV2SourceHealthPanel snap={snap} />
                </div>
              ))}
            </SummaryBlock>
          )}

          {staffSuspect && identity && (
            <CardFlowV2ConfirmedPricingPanel
              identity={identity}
              market={market}
              offerPreview={offerPreview}
            />
          )}

          {!staffSuspect && (
            <CardFlowV2OfferPreviewPanel preview={offerPreview} />
          )}

          {identity && identity.suspectAssessments.length > 0 && (
            <SummaryBlock title="Suspect assessments">
              <div className="max-h-56 overflow-y-auto space-y-2">
                {identity.suspectAssessments.slice(0, 6).map((a) => {
                  const suspect = identity.suspects.find(
                    (s) => s.suspectId === a.suspectId,
                  );
                  return (
                    <div
                      key={a.suspectId}
                      className="rounded border border-violet-100 bg-white p-2 text-xs"
                    >
                      <p className="font-medium">
                        {(a.matchScore * 100).toFixed(0)}% —{" "}
                        {suspect?.label ?? a.suspectId}
                      </p>
                      <p className="text-gray-600">{a.reasoning}</p>
                      {a.missingEvidence.length > 0 && (
                        <p className="text-amber-700">
                          Missing: {a.missingEvidence.join("; ")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </SummaryBlock>
          )}

          {imageEvidence && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryBlock title="Image usability">
                  <p>{imageEvidence.imageUsability}</p>
                  <p className="text-xs text-gray-600">
                    Can attempt ID:{" "}
                    {imageEvidence.canAttemptIdentification ? "yes" : "no"}
                    {" · "}
                    Auto-lock: {imageEvidence.canAutoLockIdentity ? "yes" : "no"}
                  </p>
                  <p className="text-xs text-gray-600">
                    Sides: {imageEvidence.detectedSides.join(", ") || "—"}
                  </p>
                  {imageEvidence.visualProblems.length > 0 && (
                    <p className="text-xs text-amber-800">
                      Problems: {imageEvidence.visualProblems.join(", ")}
                    </p>
                  )}
                </SummaryBlock>

                {categoryClassification && (
                  <SummaryBlock title="Category">
                    <p>
                      {categoryClassification.category}{" "}
                      <span className="text-xs text-gray-600">
                        ({(categoryClassification.confidence * 100).toFixed(0)}%)
                      </span>
                    </p>
                    {categoryClassification.needsHigherVision && (
                      <p className="text-xs text-amber-800">Needs higher vision</p>
                    )}
                  </SummaryBlock>
                )}
              </div>

              <SummaryBlock title="Identification mode">
                <p className="font-medium">{imageEvidence.identificationMode}</p>
                <p className="mt-1 text-gray-700">{imageEvidence.staffMessage}</p>
              </SummaryBlock>
            </>
          )}

          {detectiveGuide && (
            <SummaryBlock title={`Detective guide (${detectiveGuide.category})`}>
              {detectiveGuide.identificationFormula && (
                <p className="text-xs text-violet-900">
                  <span className="font-medium">Safe lookup:</span>{" "}
                  {detectiveGuide.identificationFormula}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-600">
                Lock requirements: {detectiveGuide.lockRequirements.join(", ")}
              </p>
              {detectiveGuide.staffTips.length > 0 && (
                <ul className="mt-2 list-inside list-disc text-xs text-gray-700">
                  {detectiveGuide.staffTips.slice(0, 4).map((tip) => (
                    <li key={tip}>{tip}</li>
                  ))}
                </ul>
              )}
              {detectiveGuide.variantTraps.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-amber-800">
                    Variant traps ({detectiveGuide.variantTraps.length})
                  </summary>
                  <ul className="mt-1 list-inside list-disc text-xs text-amber-900">
                    {detectiveGuide.variantTraps.slice(0, 6).map((trap) => (
                      <li key={trap}>{trap}</li>
                    ))}
                  </ul>
                </details>
              )}
              {detectiveGuide.catalogSources && detectiveGuide.catalogSources.length > 0 && (
                <p className="mt-2 text-xs text-gray-500">
                  Catalog: {detectiveGuide.catalogSources.join(" ")}
                </p>
              )}
              {detectiveGuide.marketResearchNotes &&
                detectiveGuide.marketResearchNotes.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-gray-600">
                      Market research notes
                    </summary>
                    <ul className="mt-1 list-inside list-disc text-xs text-gray-600">
                      {detectiveGuide.marketResearchNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </details>
                )}
            </SummaryBlock>
          )}

          <details>
            <summary className="cursor-pointer text-xs text-violet-800">
              Full V2 JSON
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded bg-white p-2 text-xs">
              {JSON.stringify({ evidence, identity, market }, null, 2)}
            </pre>
          </details>

          <p className="text-xs text-gray-500">
            V2 shadow layer — staff printing confirmation is saved for evaluation;
            production offers unchanged until V2 becomes default.
          </p>
        </div>
      )}
    </div>
  );
}

function SummaryBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-violet-800">
        {title}
      </h4>
      <div className="mt-1">{children}</div>
    </div>
  );
}
