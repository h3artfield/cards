import type { ScannedCard, StoreRule, StoreSettings } from "../types";
import type {
  CardCandidateBundle,
  CardFlowV2EvidenceBundle,
} from "./types";
import type {
  CardFlowV2MarketBundle,
  StaffConfirmedMarketPromotion,
} from "./market/types";
import {
  clearStaffConfirmedMarket,
  promoteStaffConfirmedMarket,
} from "./market/promote-staff-confirmed-market";
import { runCardOfferPreviewV2 } from "./offer/run-card-offer-preview-v2";
import { resolvePricingReadinessState } from "./offer/pricing-readiness";
import type { V2OfferPreview } from "./offer/types";
import { assertPreviewDoesNotMutateProduction } from "./offer/v2-offer-preview";
import {
  applyStaffCorrection,
  runCardAuditV2,
} from "./audit/run-card-audit-v2";
import type { CardFlowV2AuditRecord } from "./audit/types";
import { getStaffSelectedSuspect } from "./staff-suspect-selection";
import { stampCardFlowV2Bundles } from "./version-metadata";
import { applyV2OfferInfluenceToCard } from "./offer/apply-v2-offer-influence";
import { isCardFlowV2OfferInfluenceEnabled } from "./feature-flag";

export type StaffConfirmPricingResult = {
  cardFlowV2Identity: CardCandidateBundle;
  cardFlowV2Market?: CardFlowV2MarketBundle;
  cardFlowV2OfferPreview?: V2OfferPreview;
  cardFlowV2Audit?: CardFlowV2AuditRecord;
  staffMarketPromotion?: StaffConfirmedMarketPromotion;
  productionUnchanged: boolean;
  productionFields: ReturnType<typeof assertPreviewDoesNotMutateProduction>;
  /** Updated production fields when CARD_FLOW_V2_OFFER_INFLUENCE applies. */
  cardWithProduction?: ScannedCard;
  v2InfluenceApplied?: boolean;
  v2InfluenceReason?: string;
};

function previewCardShell(
  card: ScannedCard,
  identity: CardCandidateBundle,
  market?: CardFlowV2MarketBundle,
  evidence?: CardFlowV2EvidenceBundle,
  audit?: CardFlowV2AuditRecord,
): ScannedCard {
  return {
    ...card,
    cardFlowV2Identity: identity,
    cardFlowV2Market: market,
    cardFlowV2Evidence: evidence ?? card.cardFlowV2Evidence,
    cardFlowV2Audit: audit,
  };
}

/** Directive 006J — promote market + refresh offer preview after staff confirm/clear. */
export async function applyStaffConfirmPricingRefresh(input: {
  card: ScannedCard;
  identity: CardCandidateBundle;
  market?: CardFlowV2MarketBundle;
  evidence?: CardFlowV2EvidenceBundle;
  settings: StoreSettings;
  rules: StoreRule[];
  confirmedBy?: string;
  manualRefresh?: boolean;
  clearConfirmation?: boolean;
}): Promise<StaffConfirmPricingResult> {
  let identity = input.identity;
  let market = input.market;
  let staffMarketPromotion: StaffConfirmedMarketPromotion | undefined;

  if (input.clearConfirmation) {
    if (market) {
      market = clearStaffConfirmedMarket(market);
    }
  } else {
    const suspect = getStaffSelectedSuspect(identity);
    if (suspect && market) {
      const promoted = await promoteStaffConfirmedMarket({
        market,
        suspect,
        confirmedBy: input.confirmedBy,
        manualRefresh: input.manualRefresh,
      });
      market = promoted.market;
      staffMarketPromotion = promoted.promotion;
    }
  }

  let cardFlowV2Audit = runCardAuditV2({
    card: previewCardShell(input.card, identity, market, input.evidence),
    evidence: input.evidence,
    identity,
    market,
  });

  const suspect = getStaffSelectedSuspect(identity);
  if (suspect) {
    cardFlowV2Audit = applyStaffCorrection(cardFlowV2Audit, {
      status: "staff_confirmed_v2",
      correctedName: suspect.canonicalName ?? suspect.label,
      correctedSetName: suspect.setName,
      correctedSetCode: suspect.setCode,
      correctedCardNumber:
        suspect.collectorNumber ?? suspect.cardNumber ?? undefined,
      correctedVariant: suspect.finish,
      notes: identity.staffSelection?.notes ?? `Staff confirmed: ${suspect.label}`,
      reviewedAt: identity.staffSelection?.confirmedAt ?? new Date().toISOString(),
      reviewedBy: input.confirmedBy ?? identity.staffSelection?.confirmedBy,
    });
    if (staffMarketPromotion) {
      cardFlowV2Audit = {
        ...cardFlowV2Audit,
        v2StaffMarketPromotion: staffMarketPromotion,
      };
    }
  }

  const previewCard = previewCardShell(
    input.card,
    identity,
    market,
    input.evidence,
    cardFlowV2Audit,
  );

  let cardFlowV2OfferPreview = runCardOfferPreviewV2({
    card: previewCard,
    identity,
    market,
    evidence: input.evidence,
    settings: input.settings,
    rules: input.rules,
  });

  if (cardFlowV2OfferPreview) {
    const readiness = resolvePricingReadinessState({
      preview: cardFlowV2OfferPreview,
      identity,
      market,
    });
    cardFlowV2OfferPreview = {
      ...cardFlowV2OfferPreview,
      pricingReadinessState: readiness,
    };
  }

  const stamped = stampCardFlowV2Bundles(
    {
      evidence: input.evidence ?? input.card.cardFlowV2Evidence,
      identity,
      market,
      audit: cardFlowV2Audit,
      offerPreview: cardFlowV2OfferPreview,
    },
    identity.category ?? input.card.category,
  );

  const previewShell: ScannedCard = {
    ...input.card,
    cardFlowV2Identity: stamped.identity!,
    cardFlowV2Market: stamped.market,
    cardFlowV2Audit: stamped.audit,
    cardFlowV2OfferPreview: stamped.offerPreview,
    cardFlowV2VersionMetadata: stamped.cardFlowV2VersionMetadata,
  };

  let productionUnchanged = true;
  let cardWithProduction: ScannedCard | undefined;
  let v2InfluenceApplied = false;
  let v2InfluenceReason: string | undefined;

  if (isCardFlowV2OfferInfluenceEnabled() && !input.clearConfirmation) {
    const influence = applyV2OfferInfluenceToCard(previewShell);
    v2InfluenceApplied = influence.applied;
    v2InfluenceReason = influence.reason;
    if (influence.applied) {
      productionUnchanged = false;
      cardWithProduction = influence.card;
    }
  }

  const afterFields = cardWithProduction ?? previewShell;

  return {
    cardFlowV2Identity: stamped.identity!,
    cardFlowV2Market: stamped.market,
    cardFlowV2OfferPreview: stamped.offerPreview,
    cardFlowV2Audit: stamped.audit,
    staffMarketPromotion,
    productionUnchanged,
    productionFields: {
      marketPrice: afterFields.marketPrice,
      cashOffer: afterFields.cashOffer,
      tradeOffer: afterFields.tradeOffer,
      status: afterFields.status,
    },
    cardWithProduction,
    v2InfluenceApplied,
    v2InfluenceReason,
  };
}
