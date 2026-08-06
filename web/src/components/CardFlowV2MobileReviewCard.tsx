"use client";

import type { ReactNode } from "react";
import { useMemo, useRef, useCallback, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import type { ScannedCard, StoreRule } from "@/lib/types";
import type { CardCandidateBundle } from "@/lib/card-flow-v2/types";
import type { CardFlowV2MarketBundle } from "@/lib/card-flow-v2/market/types";
import type { CardFlowV2AuditRecord } from "@/lib/card-flow-v2/audit/types";
import type { V2OfferPreview } from "@/lib/card-flow-v2/offer/types";
import type { V2ReviewStatus } from "@/lib/card-flow-v2/v2-review-status";
import type { StaffTrainingExplanation } from "@/lib/card-flow-v2/staff-training-explanation";
import {
  resolveAdminCardViewMode,
  adminCardViewModeLabel,
  type AdminCardViewMode,
} from "@/lib/card-flow-v2/admin-card-view-mode";
import {
  clerkRecommendationShortTitle,
  needsProductionComparison,
  resolveClerkRecommendation,
  showClerkWarningSection,
  type ClerkRecommendationKind,
} from "@/lib/card-flow-v2/clerk-recommendation";
import { getPrimaryMarketSnapshot } from "@/lib/card-flow-v2/market/promote-staff-confirmed-market";
import { isV2ProductionPricing } from "@/lib/card-flow-v2/offer/apply-v2-offer-influence";
import { buildV2OfferReason } from "@/lib/card-flow-v2/v2-offer-reason";
import {
  buildClerkCardInsightLines,
  clerkHasDisplayPricing,
  clerkShouldShowStoredOfferMismatch,
  formatStoreCondition,
  resolveClerkDisplayOffers,
  resolveClerkMarketSource,
  resolveClerkRunningOfferAmounts,
} from "@/lib/card-flow-v2/clerk-card-insights";
import { cardDisplayName } from "@/lib/processing/card-display-name";
import type { RuleEngineResult } from "@/lib/processing/rules-engine";
import { evaluateClerkStoreRules } from "@/lib/processing/clerk-store-rules";
import {
  resolveClerkVisualReviewState,
  shouldEvaluateClerkStoreRules,
  isStaffPrintingConfirmationSettled,
} from "@/lib/processing/clerk-visual-review-state";
import { CardFlowV2SuspectPicker } from "@/components/CardFlowV2SuspectPicker";
import { applyStaffSuspectSelection } from "@/lib/card-flow-v2/staff-suspect-selection";
import { CardFlowV2PricingSummary } from "@/components/CardFlowV2PricingSummary";
import { CardFlowV2ClerkRecommendation } from "@/components/CardFlowV2ClerkRecommendation";
import { CardFlowV2StaffActionPanel } from "@/components/CardFlowV2StaffActionPanel";
import { CardFlowV2ProductionOfferPanel } from "@/components/CardFlowV2ProductionOfferPanel";
import { CardFlowV2ManagerDetailsPanel } from "@/components/CardFlowV2ManagerDetailsPanel";
import { CardFlowV2DebugPanel } from "@/components/CardFlowV2PrimaryWorkflowPanel";
import { CardFlowV2DetectiveSummary } from "@/components/CardFlowV2DetectiveSummary";
import { resolveClerkScanIdentityDisplay } from "@/lib/card-flow-v2/clerk-scan-identity-display";
import { CardFlowV2ShadowReprocessButton } from "@/components/CardFlowV2ShadowReprocessButton";
import { CardFlowV2PriceHistoryPanel } from "@/components/CardFlowV2PriceHistoryPanel";
import type { ReviewCardState } from "@/components/ReviewStateCardShell";
import {
  ReviewFlipBackHeader,
  ReviewFlipCardFace,
} from "@/components/review-flip-card/ReviewFlipCardFace";
import { ReviewFlipCard2D } from "@/components/review-flip-card/ReviewFlipCard2D";
import { useReviewFlipCard } from "@/components/review-flip-card/use-review-flip-card";
import { Button } from "@/components/Button";
import { CardImageEnlargeLightbox, CardPhotoLightbox } from "@/components/CardPhotoLightbox";

function money(n?: number): string {
  if (n == null) return "—";
  return `$${n.toFixed(2)}`;
}

function ClerkMetricCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-0.5">
      <p className="text-[9px] font-bold uppercase leading-tight tracking-wide text-gray-500">
        {label}
      </p>
      <p className="mt-0.5 truncate text-xs font-bold leading-tight text-gray-900">
        {value}
      </p>
    </div>
  );
}

function ClerkCardMetricsStrip({
  conditionLabel,
  showPricingFields,
  market,
  marketSource,
  cash,
  trade,
}: {
  conditionLabel?: string | null;
  showPricingFields: boolean;
  market?: number;
  marketSource: string;
  cash?: number;
  trade?: number;
}) {
  return (
    <div className="mt-2 grid grid-cols-5 gap-1 border-y border-gray-100 py-2">
      <ClerkMetricCell label="Condition" value={conditionLabel ?? "—"} />
      <ClerkMetricCell
        label="Market"
        value={showPricingFields ? money(market) : "—"}
      />
      <ClerkMetricCell
        label="Source"
        value={
          showPricingFields && marketSource !== "—" ? marketSource : "—"
        }
      />
      <ClerkMetricCell
        label="Cash"
        value={showPricingFields ? money(cash) : "—"}
      />
      <ClerkMetricCell
        label="Trade"
        value={showPricingFields ? money(trade) : "—"}
      />
    </div>
  );
}

function ClerkCardScanPhotos({
  card,
  compact = false,
}: {
  card: ScannedCard;
  compact?: boolean;
}) {
  const [enlargeOpen, setEnlargeOpen] = useState(false);
  const [enlargeSide, setEnlargeSide] = useState<"front" | "back">("front");
  const [pregradeOpen, setPregradeOpen] = useState(false);
  const front = card.frontImageUrl?.trim();
  const back = card.backImageUrl?.trim();
  const name = cardDisplayName(card);
  const hasPregrade = Boolean(card.conditionReport?.serviceAvailable);

  if (!front && !back) return null;

  function openEnlarge(side: "front" | "back") {
    setEnlargeSide(side);
    setEnlargeOpen(true);
  }

  const imgClass = compact
    ? "max-h-28 w-full object-contain"
    : "max-h-32 w-full object-contain sm:max-h-36";

  return (
    <>
      <div className={compact ? "flex flex-col gap-2" : "grid grid-cols-2 gap-2"}>
        {front ? (
          <button
            type="button"
            className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
            onClick={() => openEnlarge("front")}
            aria-label="Enlarge front photo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={front}
              alt={`${name} front`}
              className={imgClass}
            />
            <p className="border-t border-gray-100 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-600">
              Front
            </p>
          </button>
        ) : (
          <div
            className={`flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500 ${compact ? "min-h-20" : "min-h-24"}`}
          >
            No front photo
          </div>
        )}
        {back ? (
          <button
            type="button"
            className="overflow-hidden rounded-lg border border-gray-200 bg-gray-50"
            onClick={() => openEnlarge("back")}
            aria-label="Enlarge back photo"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={back}
              alt={`${name} back`}
              className={imgClass}
            />
            <p className="border-t border-gray-100 py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-600">
              Back
            </p>
          </button>
        ) : (
          <div
            className={`flex items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-500 ${compact ? "min-h-20" : "min-h-24"}`}
          >
            No back photo
          </div>
        )}
      </div>

      {hasPregrade && (
        <Button
          variant="ghost"
          className={`w-full text-xs text-indigo-700 ${compact ? "mt-1 px-1 py-1" : "mt-2"}`}
          onClick={() => setPregradeOpen(true)}
        >
          Pregrade scan overlay
        </Button>
      )}

      {front && (
        <>
          <CardImageEnlargeLightbox
            open={enlargeOpen}
            onClose={() => setEnlargeOpen(false)}
            frontImageUrl={front}
            backImageUrl={back}
            cardName={name}
            initialSide={enlargeSide}
          />
          <CardPhotoLightbox
            open={pregradeOpen}
            onClose={() => setPregradeOpen(false)}
            frontImageUrl={front}
            backImageUrl={back}
            cardName={name}
            report={card.conditionReport}
            initialSide="front"
          />
        </>
      )}
    </>
  );
}

const REVIEW_REASON_KINDS = new Set<ClerkRecommendationKind>([
  "needs_manager_review",
  "production_price_warning",
  "pricing_source_disagreement",
  "insufficient_market_data",
  "confirm_version_first",
  "store_rule_pass",
]);

function storeRuleReasonLines(
  block: RuleEngineResult,
  rules: StoreRule[],
): string[] {
  return block.matchedRules.map((title) => {
    const rule = rules.find((r) => r.title === title);
    if (rule?.ruleText?.trim()) {
      return `${title}: ${rule.ruleText.trim()}`;
    }
    return title;
  });
}

function showOfferReasonButton(input: {
  card: ScannedCard;
  recommendationKind: ClerkRecommendationKind;
}): boolean {
  return (
    input.card.status === "manual_review" ||
    REVIEW_REASON_KINDS.has(input.recommendationKind)
  );
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h4 className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-600">
      {children}
    </h4>
  );
}

function gameCategoryLabel(category?: string): string {
  if (!category) return "—";
  const map: Record<string, string> = {
    magic: "Magic",
    mtg: "Magic",
    pokemon: "Pokémon",
    yugioh: "Yu-Gi-Oh!",
    sports: "Sports",
    riftbound: "Riftbound",
  };
  return map[category.toLowerCase()] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

export function CardFlowV2MobileReviewCard({
  card,
  identity,
  market,
  offerPreview,
  audit,
  reviewStatus,
  staffTraining,
  legacyAdvanced,
  viewMode: viewModeProp,
  reviewState = "no",
  storeRules,
  storeRuleBlock: storeRuleBlockProp,
  bodyExtras,
  footer,
  onSaved,
}: {
  card: ScannedCard;
  identity?: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  offerPreview?: V2OfferPreview;
  audit?: CardFlowV2AuditRecord;
  reviewStatus: V2ReviewStatus;
  staffTraining?: StaffTrainingExplanation | null;
  legacyAdvanced?: ReactNode;
  viewMode?: AdminCardViewMode;
  reviewState?: ReviewCardState;
  storeRules?: StoreRule[];
  /** Precomputed on order page; recomputed here when omitted. */
  storeRuleBlock?: RuleEngineResult | null;
  bodyExtras?: ReactNode;
  footer?: ReactNode;
  onSaved?: (payload?: {
    identity?: CardCandidateBundle;
    market?: CardFlowV2MarketBundle;
    offerPreview?: V2OfferPreview;
    card?: ScannedCard;
  }) => void;
}) {
  const searchParams = useSearchParams();
  const viewMode =
    viewModeProp ??
    resolveAdminCardViewMode({
      debugParam: searchParams.get("debug"),
      viewParam: searchParams.get("view"),
    });

  const {
    face,
    backMode,
    reducedMotion,
    flipToReason,
    flipToReview,
    flipToFront,
  } = useReviewFlipCard();

  const scrollRef = useRef<HTMLDivElement>(null);
  const identityBeforeConfirmRef = useRef<CardCandidateBundle | undefined>(
    undefined,
  );
  const [reviewPickerOpen, setReviewPickerOpen] = useState(false);

  useEffect(() => {
    if (face === "front") {
      setReviewPickerOpen(false);
    }
  }, [face]);

  const openReviewPicker = useCallback(() => {
    setReviewPickerOpen(true);
    flipToReview();
  }, [flipToReview]);

  const handleConfirmStart = useCallback(
    (suspectId?: string) => {
      identityBeforeConfirmRef.current = identity;
      flipToFront();
      if (!identity || !suspectId) return;
      try {
        const optimisticIdentity = applyStaffSuspectSelection(identity, {
          suspectId,
          confirmedBy: "pending",
        });
        onSaved?.({ identity: optimisticIdentity });
      } catch {
        /* suspect missing — API save will surface error */
      }
    },
    [identity, flipToFront, onSaved],
  );

  const handleConfirmFailed = useCallback(() => {
    const previous = identityBeforeConfirmRef.current;
    if (previous) {
      onSaved?.({ identity: previous });
    }
    identityBeforeConfirmRef.current = undefined;
  }, [onSaved]);

  const handleSaved = useCallback(
    (payload?: {
      identity?: CardCandidateBundle;
      market?: CardFlowV2MarketBundle;
      offerPreview?: V2OfferPreview;
      card?: ScannedCard;
    }) => {
      onSaved?.(payload);
    },
    [onSaved],
  );

  const primarySnap = getPrimaryMarketSnapshot(market);
  const versionConfirmed = isStaffPrintingConfirmationSettled(
    card,
    identity,
  );
  const displayOffers = useMemo(
    () =>
      resolveClerkDisplayOffers({
        card,
        offerPreview,
        versionConfirmed,
      }),
    [card, offerPreview, versionConfirmed],
  );
  const runningAmounts = useMemo(
    () => resolveClerkRunningOfferAmounts(card),
    [card],
  );
  const v2MarketVal = runningAmounts.market;
  const productionMarket = card.marketPrice;
  const cashVal = runningAmounts.cash;
  const tradeVal = runningAmounts.trade;
  const marketSource = resolveClerkMarketSource({
    card,
    offerPreview,
    versionConfirmed,
  });
  const showPricingFields = clerkHasDisplayPricing(displayOffers);

  const storeRuleBlock = useMemo(() => {
    if (!shouldEvaluateClerkStoreRules(card, versionConfirmed)) return null;
    if (storeRuleBlockProp) return storeRuleBlockProp;
    if (!storeRules?.length || v2MarketVal == null) return null;
    return evaluateClerkStoreRules(card, storeRules, v2MarketVal);
  }, [
    storeRuleBlockProp,
    storeRules,
    card,
    v2MarketVal,
    versionConfirmed,
  ]);

  const storeRuleBlocked = Boolean(storeRuleBlock?.doNotBuy);
  const visualReviewState = resolveClerkVisualReviewState({
    card,
    v2ReviewStatus: reviewStatus,
    versionConfirmed,
    storeRuleBlocked,
  });

  const recommendation = useMemo(
    () =>
      resolveClerkRecommendation({
        reviewStatus,
        offerPreview,
        productionMarketPrice: productionMarket,
        staffTraining,
        storeRuleBlock: storeRuleBlocked ? storeRuleBlock : null,
      }),
    [
      reviewStatus,
      offerPreview,
      productionMarket,
      staffTraining,
      storeRuleBlocked,
      storeRuleBlock,
    ],
  );

  const showProduction =
    !isV2ProductionPricing(card) &&
    needsProductionComparison({
      reviewStatus,
      productionMarketPrice: productionMarket,
      v2PreviewMarketPrice: v2MarketVal,
    });

  const needsReasonButton = showOfferReasonButton({
    card,
    recommendationKind: recommendation.kind,
  });
  const cardInsight = useMemo(
    () =>
      buildClerkCardInsightLines(card, {
        v2Market: v2MarketVal ?? productionMarket,
        includeCondition: false,
        versionConfirmed,
        reviewStatus,
      }),
    [card, v2MarketVal, productionMarket, versionConfirmed, reviewStatus],
  );
  const showStoredOfferMismatch = clerkShouldShowStoredOfferMismatch({
    storedOfferMismatch: displayOffers.storedOfferMismatch,
    versionConfirmed,
    reviewStatus,
  });
  const conditionLabel = formatStoreCondition(card);
  const showReasonButton =
    needsReasonButton ||
    storeRuleBlocked ||
    cardInsight.lines.length > 0 ||
    Boolean(conditionLabel) ||
    cardInsight.staleBuybackReport;

  const offerReason = useMemo(
    () =>
      buildV2OfferReason({
        card,
        offerPreview,
        identity,
        market,
        audit,
        reviewStatus,
        evidence: card.cardFlowV2Evidence,
      }),
    [card, offerPreview, identity, market, audit, reviewStatus],
  );

  const scanIdentity = useMemo(
    () => resolveClerkScanIdentityDisplay(card),
    [card],
  );

  function scrollToRecommendation() {
    scrollRef.current
      ?.querySelector("#clerk-recommendation")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  const frontFace = (
    <ReviewFlipCardFace fillHeight>
      <div className="flex min-h-0 flex-1 flex-col gap-2 lg:grid lg:grid-cols-[minmax(0,1fr)_7.5rem] lg:items-start lg:gap-3">
        <div className="flex min-w-0 flex-col">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base font-bold leading-tight text-gray-900">
                {scanIdentity.primaryName}
              </p>
              {scanIdentity.secondaryName ? (
                <p className="text-sm font-semibold text-gray-700">
                  {scanIdentity.secondaryName}
                </p>
              ) : null}
              <div className="mt-1 space-y-0.5">
                <p className="text-sm font-semibold text-gray-900">
                  {gameCategoryLabel(card.category)}
                </p>
                {scanIdentity.setLabel ? (
                  <p className="text-sm font-semibold text-gray-900">
                    {scanIdentity.setLabel}
                  </p>
                ) : null}
                {scanIdentity.setCode ? (
                  <p className="text-sm font-semibold uppercase text-gray-900">
                    {scanIdentity.setCode}
                  </p>
                ) : null}
                {scanIdentity.collectorNumber ? (
                  <p className="text-sm font-semibold text-gray-900">
                    #{scanIdentity.collectorNumber}
                  </p>
                ) : null}
                {scanIdentity.language ? (
                  <p className="text-xs font-medium text-gray-600">
                    {scanIdentity.language}
                  </p>
                ) : null}
                {scanIdentity.fromScan && !versionConfirmed ? (
                  <p className="text-[10px] text-violet-700">From scan — confirm version</p>
                ) : null}
              </div>
            </div>
            <Button
              variant="primary"
              className="shrink-0 px-3 py-2 text-xs font-semibold"
              onClick={openReviewPicker}
            >
              Select version
            </Button>
          </div>

          <div className="mt-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
              Recommendation
            </p>
            <p
              className={`text-sm font-semibold ${
                recommendation.tone === "red" ? "text-red-700" : "text-gray-900"
              }`}
            >
              {clerkRecommendationShortTitle(recommendation)}
            </p>
          </div>

          {conditionLabel || showPricingFields ? (
            <>
              <ClerkCardMetricsStrip
                conditionLabel={conditionLabel}
                showPricingFields={showPricingFields}
                market={v2MarketVal ?? productionMarket}
                marketSource={marketSource}
                cash={cashVal}
                trade={tradeVal}
              />
              {!versionConfirmed && showPricingFields && (
                <p className="mt-1 text-[10px] leading-snug text-gray-600">
                  Estimate from scan — tap Select version to confirm printing.
                </p>
              )}
              {showStoredOfferMismatch && (
                <p className="mt-1 text-[10px] leading-snug text-amber-800">
                  Stored offer on file was {money(card.cashOffer)} cash (from{" "}
                  {money(card.marketPrice)} market). Confirmed-printing estimate
                  shown above — use Edit if the buy price should change.
                </p>
              )}
            </>
          ) : (
            <>
              <ClerkCardMetricsStrip
                conditionLabel={conditionLabel}
                showPricingFields={false}
                marketSource="—"
              />
              <p className="mt-1 text-[10px] leading-snug text-gray-600">
                Select version to see pricing.
              </p>
            </>
          )}

          {showReasonButton && (
            <Button
              variant="secondary"
              className="mt-2 min-h-10 w-full text-sm"
              onClick={flipToReason}
            >
              Reason
            </Button>
          )}

          <div className="mt-2 lg:hidden">
            <ClerkCardScanPhotos card={card} />
          </div>

          <div className="mt-auto space-y-2 pt-2">
            {bodyExtras ? (
              <div className="space-y-2 border-t border-gray-100 pt-2">{bodyExtras}</div>
            ) : null}

            {footer ? <div className="border-t border-gray-100 pt-2">{footer}</div> : null}
          </div>
        </div>

        <div className="hidden shrink-0 lg:block">
          <ClerkCardScanPhotos card={card} compact />
        </div>
      </div>
    </ReviewFlipCardFace>
  );

  const reasonBackFace = (
    <ReviewFlipCardFace>
      <ReviewFlipBackHeader title="Reason" onBack={flipToFront} />

      <CardFlowV2DetectiveSummary
        evidence={card.cardFlowV2Evidence}
        offerReason={offerReason}
      />

      {conditionLabel && (
        <div className="mt-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Condition
          </p>
          <p className="text-sm font-semibold text-gray-900">{conditionLabel}</p>
          <p className="text-[10px] text-gray-600">Prices above reflect this grade.</p>
        </div>
      )}

      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-gray-500">
          Recommendation
        </p>
        <p
          className={`text-sm font-semibold ${
            recommendation.tone === "red" ? "text-red-700" : "text-gray-900"
          }`}
        >
          {recommendation.title}
        </p>
        {storeRuleBlocked && offerReason?.summary && (
          <p className="mt-1 text-xs leading-relaxed text-gray-800">{offerReason.summary}</p>
        )}
      </div>

      {storeRuleBlocked && storeRuleBlock && (
        <div className="mt-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-red-700">
            Store rules
          </p>
          {storeRuleReasonLines(storeRuleBlock, storeRules ?? []).map((line) => (
            <p key={line.slice(0, 64)} className="text-sm font-bold leading-snug text-red-700">
              {line}
            </p>
          ))}
        </div>
      )}

      {cardInsight.staleBuybackReport && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-950">
          <p className="font-semibold">Buyback report may be outdated</p>
          <p className="mt-0.5">
            The stored buyback note does not match this card or current pricing.
            Order <strong>Reprocess</strong> refreshes scan pricing but may not
            regenerate the buyback agent note — use Edit to adjust the offer, or
            ask a manager to run full analysis.
          </p>
        </div>
      )}

      {displayOffers.storedOfferMismatch && showStoredOfferMismatch && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-950">
          <p className="font-semibold">Stored offer differs from estimate</p>
          <p className="mt-0.5">
            On file: {money(card.marketPrice)} market → {money(card.cashOffer)}{" "}
            cash. Confirmed printing estimate uses {money(v2MarketVal)} market.
          </p>
        </div>
      )}

      {cardInsight.lines.length > 0 && (
        <div className="mt-3">
          <p className="text-[10px] font-bold uppercase text-gray-500">Market notes</p>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs text-gray-800">
            {cardInsight.lines.slice(0, 5).map((line) => (
              <li key={line.slice(0, 64)}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      {!cardInsight.lines.length &&
        !cardInsight.staleBuybackReport &&
        !card.resaleAnalysis &&
        !card.conditionReport && (
        <p className="mt-3 text-xs text-gray-600">
          Full analysis runs when the order is submitted. Reprocess if missing.
        </p>
      )}

      {offerReason?.warnings?.[0] && (
        <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2 py-2 text-xs text-amber-950">
          <p className="font-semibold">Risk</p>
          <p className="mt-0.5">{offerReason.warnings[0]}</p>
        </div>
      )}

      <p className="mt-3 text-xs">
        <span className="font-semibold text-gray-800">Action: </span>
        {recommendation.actionLine}
      </p>
    </ReviewFlipCardFace>
  );

  const reviewBackFace = (
    <ReviewFlipCardFace>
      <div ref={scrollRef}>
        <ReviewFlipBackHeader title="Select version" onBack={flipToFront} />

        {viewMode !== "clerk" && (
          <p className="mb-3 text-[10px] text-gray-500">
            View: {adminCardViewModeLabel(viewMode)}
          </p>
        )}

        <section className="mb-4">
          <SectionHeading>Confirm printing</SectionHeading>
          {identity ? (
            <CardFlowV2SuspectPicker
              cardId={card.id}
              identity={identity}
              market={market}
              evidence={card.cardFlowV2Evidence}
              customerFrontImageUrl={card.frontImageUrl}
              customerBackImageUrl={card.backImageUrl}
              layout="mobile"
              suppressSectionTitle
              compareDockActive={face === "back" && backMode === "review"}
              forceShowPicker={reviewPickerOpen}
              onManagerReview={scrollToRecommendation}
              onConfirmStart={handleConfirmStart}
              onConfirmFailed={handleConfirmFailed}
              onSaved={handleSaved}
            />
          ) : (
            <p className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
              Pick the exact version — no printing options yet.
            </p>
          )}
        </section>

        <section className="mb-3">
          <SectionHeading>Price summary</SectionHeading>
          {showPricingFields ? (
            <CardFlowV2PricingSummary preview={offerPreview} card={card} />
          ) : (
            <p className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm font-medium text-gray-900">
              Confirm the printing above to see pricing.
            </p>
          )}
        </section>

        <section className="mb-4">
          <SectionHeading>Staff action</SectionHeading>
          {showClerkWarningSection(reviewStatus) ? (
            <CardFlowV2StaffActionPanel
              reviewStatus={reviewStatus}
              productionMarketPrice={productionMarket}
              offerPreview={offerPreview}
              audit={audit}
              staffTraining={staffTraining}
              priceChartingMapping={primarySnap?.priceChartingMapping}
              versionMetadata={card.cardFlowV2VersionMetadata}
              clerkMode
            />
          ) : (
            <CardFlowV2ClerkRecommendation recommendation={recommendation} compact />
          )}
        </section>

        {showProduction && viewMode !== "clerk" && (
          <section className="mb-4">
            <SectionHeading>Production offer</SectionHeading>
            <CardFlowV2ProductionOfferPanel
              card={card}
              clerkWarning={
                reviewStatus === "v2_production_price_warning"
                  ? "V2 says this may be wrong. Do not accept without manager review."
                  : reviewStatus === "v2_source_disagreement"
                    ? "Do not accept until manager resolves source disagreement."
                    : undefined
              }
            />
          </section>
        )}

        {viewMode !== "clerk" && (
          <section className="mb-3">
            <CardFlowV2ManagerDetailsPanel
              snap={primarySnap}
              audit={audit}
              offerPreview={offerPreview}
              productionMarketPrice={productionMarket}
            />
          </section>
        )}

        <section>
          <details className="rounded border border-gray-200 bg-gray-50/80 text-xs">
            <summary className="cursor-pointer px-3 py-2 font-medium text-gray-700">
              Advanced / Debug
            </summary>
            <div className="space-y-3 border-t border-gray-200 px-3 py-2">
              {viewMode !== "clerk" && (
                <CardFlowV2ShadowReprocessButton
                  cardId={card.id}
                  onComplete={onSaved}
                />
              )}
              <CardFlowV2PriceHistoryPanel
                card={card}
                identity={identity}
                viewMode={viewMode}
              />
              {viewMode === "developer" && (
                <>
                  {legacyAdvanced}
                  <CardFlowV2DebugPanel
                    evidence={card.cardFlowV2Evidence}
                    identity={identity}
                    market={market}
                    offerPreview={offerPreview}
                    audit={audit}
                  />
                </>
              )}
              {viewMode === "manager" && legacyAdvanced}
            </div>
          </details>
        </section>
      </div>
    </ReviewFlipCardFace>
  );

  const flipProps = {
    face,
    backMode,
    reducedMotion,
    reviewState: visualReviewState,
    front: frontFace,
    reasonBack: reasonBackFace,
    reviewBack: reviewBackFace,
  };

  return <ReviewFlipCard2D {...flipProps} />;
}
