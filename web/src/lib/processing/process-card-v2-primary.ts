import type {
  CardCategory,
  ScannedCard,
  StoreRule,
  StoreSettings,
  VisionResult,
} from "../types";
import {
  isCardFlowV2EvidenceEnabled,
  isCardFlowV2IdentityEnabled,
  isCardFlowV2MarketEnabled,
  isCardFlowV2AuditEnabled,
  isCardFlowV2StaffConfirmationEnabled,
} from "../card-flow-v2/feature-flag";
import { runCardEvidenceV2 } from "../card-flow-v2/run-card-evidence-v2";
import { runCardIdentityV2 } from "../card-flow-v2/run-card-identity-v2";
import { runCardMarketV2 } from "../card-flow-v2/market/run-card-market-v2";
import { runCardAuditV2 } from "../card-flow-v2/audit/run-card-audit-v2";
import { runCardOfferPreviewV2 } from "../card-flow-v2/offer/run-card-offer-preview-v2";
import { applyStaffConfirmationPreservation } from "../card-flow-v2/staff-confirmation-preservation";
import { applyStaffSuspectSelection } from "../card-flow-v2/staff-suspect-selection";
import { stampCardFlowV2Bundles } from "../card-flow-v2/version-metadata";
import { evidenceToVisionHint } from "../card-flow-v2/evidence-utils";
import type { CardCandidateBundle } from "../card-flow-v2/types";
import { applyV2PrimaryProduction } from "./apply-v2-primary-production";
import { bindApiCallTracker } from "./api-call-tracker";
import {
  createCardProcessingTimings,
  finalizeCardProcessingTimings,
  timePhase,
} from "./processing-timings";
import type {
  CardProcessingPipelineMode,
  OrderProcessingWorker,
} from "./processing-config";

function patchCardFromV2(
  card: ScannedCard,
  vision: VisionResult,
  identity?: import("../card-flow-v2/types").CardCandidateBundle,
): ScannedCard {
  const locked = identity?.lockedIdentity;
  return {
    ...card,
    category: vision.category as ScannedCard["category"],
    detectedName:
      locked?.canonicalName ?? vision.cardName ?? card.detectedName,
    setName: locked?.setName ?? vision.setName ?? card.setName,
    cardNumber: locked?.collectorNumber ?? vision.cardNumber ?? card.cardNumber,
    year: vision.year ?? card.year,
    playerName: vision.playerName ?? card.playerName,
    variant: vision.variant ?? card.variant,
    parallel: vision.parallel ?? card.parallel,
    slabCompany: vision.slabCompany ?? card.slabCompany,
    slabGrade: vision.slabGrade ?? card.slabGrade,
    conditionEstimate: vision.conditionEstimate ?? card.conditionEstimate,
    visionJson: vision as unknown as Record<string, unknown>,
    itemType: vision.itemType ?? card.itemType,
  };
}

import { cardVisionFallback } from "./card-vision-fallback";
function maybeAutoConfirmLockedIdentity(
  identity: CardCandidateBundle,
  card: ScannedCard,
): CardCandidateBundle {
  if (!isCardFlowV2StaffConfirmationEnabled()) return identity;
  if (identity.staffSelection?.suspectId) return identity;
  if (!identity.lockedIdentity.locked) return identity;

  const winningId = identity.lockedIdentity.winningSuspectId;
  if (!winningId) return identity;

  try {
    return applyStaffSuspectSelection(identity, {
      suspectId: winningId,
      confirmedBy: "v2_auto_lock",
      notes: "Auto-confirmed — vision-locked identity",
      imageRefs: {
        frontImageUrl: card.frontImageUrl,
        backImageUrl: card.backImageUrl,
      },
    });
  } catch {
    return identity;
  }
}

/** V2-primary submit path — no V1 pricing or full analysis. */
export async function processCardV2Primary(
  card: ScannedCard,
  settings: StoreSettings,
  rules: StoreRule[],
  workerMode: OrderProcessingWorker,
): Promise<ScannedCard> {
  const pipelineMode: CardProcessingPipelineMode = "v2_primary";
  const timings = createCardProcessingTimings({ workerMode, pipelineMode });
  bindApiCallTracker(timings);
  const startedMs = Date.now();

  try {
    if (!isCardFlowV2EvidenceEnabled()) {
      throw new Error("V2-primary requires CARD_FLOW_V2_EVIDENCE_ENABLED");
    }

    const input = {
      frontImageUrl: card.frontImageUrl,
      backImageUrl: card.backImageUrl,
      declaredItemType: card.itemType,
    };

    const evidence = await timePhase(timings, "v2EvidenceMs", () =>
      runCardEvidenceV2(input),
    );

    let identity = isCardFlowV2IdentityEnabled()
      ? await timePhase(timings, "v2IdentityMs", () =>
          runCardIdentityV2({
            ...input,
            evidence,
            visionFallback: cardVisionFallback(card),
          }),
        )
      : undefined;

    if (identity) {
      identity = maybeAutoConfirmLockedIdentity(identity, card);
    }

    if (
      identity &&
      identity.suspects.length === 0 &&
      (card.cardFlowV2Identity?.suspects?.length ?? 0) > 0
    ) {
      identity = {
        ...identity,
        suspects: card.cardFlowV2Identity!.suspects,
        suspectAssessments: card.cardFlowV2Identity!.suspectAssessments,
        candidateGenerationNotes: [
          ...(identity.candidateGenerationNotes ?? []),
          "Catalog unavailable — retained previous suspect list for staff review.",
        ],
      };
    }

    let market = isCardFlowV2MarketEnabled() && identity
      ? await timePhase(timings, "v2MarketMs", () =>
          runCardMarketV2({ evidence, identity }),
        )
      : undefined;

    if (identity && isCardFlowV2StaffConfirmationEnabled()) {
      const preserved = await applyStaffConfirmationPreservation({
        previousIdentity: card.cardFlowV2Identity,
        previousMarket: card.cardFlowV2Market,
        identity,
        market,
        imageRefs: {
          frontImageUrl: card.frontImageUrl,
          backImageUrl: card.backImageUrl,
        },
      });
      identity = preserved.identity;
      market = preserved.market;
    }

    const category =
      evidence.categoryClassification.category ?? ("unknown" as CardCategory);
    const vision = evidenceToVisionHint(
      evidence.imageEvidence,
      category === "unknown"
        ? "unknown"
        : category,
      card.itemType,
    );

    let working = patchCardFromV2(card, vision, identity);

    const cardFlowV2Audit = isCardFlowV2AuditEnabled()
      ? runCardAuditV2({
          card: {
            ...working,
            marketPrice: working.marketPrice ?? 0,
            cashOffer: working.cashOffer ?? 0,
            tradeOffer: working.tradeOffer ?? 0,
            status: working.status,
            cardFlowV2Evidence: evidence,
            cardFlowV2Identity: identity,
            cardFlowV2Market: market,
          },
          evidence,
          identity,
          market,
        })
      : undefined;

    const cardFlowV2OfferPreview = await timePhase(
      timings,
      "v2AuditPreviewMs",
      async () =>
        runCardOfferPreviewV2({
          card: {
            ...working,
            cardFlowV2Evidence: evidence,
            cardFlowV2Identity: identity,
            cardFlowV2Market: market,
            cardFlowV2Audit,
          },
          identity,
          market,
          evidence,
          settings,
          rules,
        }),
    );

    const stampedV2 = stampCardFlowV2Bundles(
      {
        evidence,
        identity,
        market,
        audit: cardFlowV2Audit,
        offerPreview: cardFlowV2OfferPreview,
      },
      vision.category,
    );

    working = {
      ...working,
      cardFlowV2VersionMetadata: stampedV2.cardFlowV2VersionMetadata,
      cardFlowV2Evidence: stampedV2.evidence,
      cardFlowV2Identity: stampedV2.identity,
      cardFlowV2Market: stampedV2.market,
      cardFlowV2Audit: stampedV2.audit,
      cardFlowV2OfferPreview: stampedV2.offerPreview,
    };

    const result = await timePhase(timings, "v2InfluenceMs", async () =>
      applyV2PrimaryProduction({ card: working, settings, rules }),
    );

    return {
      ...result,
      processingTimings: finalizeCardProcessingTimings(timings, startedMs),
      lastCompletedStep: "v2_primary_complete",
    };
  } finally {
    bindApiCallTracker(null);
  }
}
