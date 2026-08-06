import type { ScannedCard, StoreRule, StoreSettings } from "../types";
import { runCardFlowV2, type CardFlowV2Bundle } from "./run-card-flow-v2";
import {
  isCardFlowV2AuditEnabled,
  isCardFlowV2EvidenceEnabled,
  isCardFlowV2OfferPreviewEnabled,
  isCardFlowV2StaffConfirmationEnabled,
} from "./feature-flag";
import { applyStaffConfirmationPreservation } from "./staff-confirmation-preservation";
import { applyStaffConfirmedVariantResolution } from "./variant-uncertainty";
import { runCardAuditV2 } from "./audit/run-card-audit-v2";
import { runCardOfferPreviewV2 } from "./offer/run-card-offer-preview-v2";
import { stampCardFlowV2Bundles } from "./version-metadata";
import { isCardFlowV2OfferInfluenceEnabled } from "./feature-flag";
import { applyV2OfferInfluenceToCard } from "./offer/apply-v2-offer-influence";
import { cardVisionFallback } from "../processing/card-vision-fallback";

export type ProductionFieldSnapshot = {
  marketPrice?: number;
  cashOffer?: number;
  tradeOffer?: number;
  status: ScannedCard["status"];
};

export type ProductionFieldMutation = {
  changed: boolean;
  fields: Array<{
    field: keyof ProductionFieldSnapshot;
    before: unknown;
    after: unknown;
  }>;
};

export function snapshotProductionFields(
  card: ScannedCard,
): ProductionFieldSnapshot {
  return {
    marketPrice: card.marketPrice,
    cashOffer: card.cashOffer,
    tradeOffer: card.tradeOffer,
    status: card.status,
  };
}

export function compareProductionFields(
  before: ProductionFieldSnapshot,
  after: ProductionFieldSnapshot,
): ProductionFieldMutation {
  const fields: ProductionFieldMutation["fields"] = [];
  for (const key of [
    "marketPrice",
    "cashOffer",
    "tradeOffer",
    "status",
  ] as const) {
    if (before[key] !== after[key]) {
      fields.push({ field: key, before: before[key], after: after[key] });
    }
  }
  return { changed: fields.length > 0, fields };
}

export function restoreProductionFields(
  card: ScannedCard,
  snapshot: ProductionFieldSnapshot,
): ScannedCard {
  return {
    ...card,
    marketPrice: snapshot.marketPrice,
    cashOffer: snapshot.cashOffer,
    tradeOffer: snapshot.tradeOffer,
    status: snapshot.status,
  };
}

export class ProductionFieldMutationError extends Error {
  constructor(
    public cardId: string,
    public mutation: ProductionFieldMutation,
  ) {
    const detail = mutation.fields
      .map((f) => `${f.field}: ${JSON.stringify(f.before)} → ${JSON.stringify(f.after)}`)
      .join(", ");
    super(
      `V2 shadow reprocess failed: card ${cardId} changed production fields (${detail}). V2-only audit must not mutate production offer fields.`,
    );
  }
}

/**
 * Recompute V2 shadow bundles only — never invokes V1 pricing/offer recalculation.
 */
export async function reprocessCardV2ShadowOnly(input: {
  card: ScannedCard;
  settings: StoreSettings;
  rules: StoreRule[];
  /** When true, throw if production fields differ after merge. Default true. */
  enforceMutationGuard?: boolean;
  /** Admin shadow reprocess — never apply V2 offer influence to production fields. */
  skipOfferInfluence?: boolean;
}): Promise<{
  card: ScannedCard;
  productionBefore: ProductionFieldSnapshot;
  productionAfter: ProductionFieldSnapshot;
  mutation: ProductionFieldMutation;
}> {
  if (!isCardFlowV2EvidenceEnabled()) {
    throw new Error("CARD_FLOW_V2_EVIDENCE_ENABLED must be true for shadow reprocess");
  }

  const { card, settings, rules } = input;
  const enforce = input.enforceMutationGuard !== false;
  const productionBefore = snapshotProductionFields(card);

  const v2Result: CardFlowV2Bundle = await runCardFlowV2({
    frontImageUrl: card.frontImageUrl,
    backImageUrl: card.backImageUrl,
    declaredItemType: card.itemType,
    visionFallback: cardVisionFallback(card),
  }).catch((err) => {
    console.error(`[card-flow-v2 shadow] card ${card.id}:`, err);
    return {};
  });

  let v2Identity = v2Result.identity;
  let v2Market = v2Result.market;

  if (v2Identity && isCardFlowV2StaffConfirmationEnabled()) {
    const preserved = await applyStaffConfirmationPreservation({
      previousIdentity: card.cardFlowV2Identity,
      previousMarket: card.cardFlowV2Market,
      identity: v2Identity,
      market: v2Market,
      imageRefs: {
        frontImageUrl: card.frontImageUrl,
        backImageUrl: card.backImageUrl,
      },
    });
    v2Identity = preserved.identity;
    v2Market = preserved.market;
  }

  if (v2Identity?.staffSelection?.suspectId) {
    v2Identity = applyStaffConfirmedVariantResolution(
      v2Identity,
      v2Result.evidence,
    );
  }

  const previewCardBase: ScannedCard = {
    ...card,
    cardFlowV2Evidence: v2Result.evidence,
    cardFlowV2Identity: v2Identity,
    cardFlowV2Market: v2Market,
  };

  const cardFlowV2Audit = isCardFlowV2AuditEnabled()
    ? runCardAuditV2({
        card: previewCardBase,
        evidence: v2Result.evidence,
        identity: v2Identity,
        market: v2Market,
      })
    : card.cardFlowV2Audit;

  const cardFlowV2OfferPreview = isCardFlowV2OfferPreviewEnabled()
    ? runCardOfferPreviewV2({
        card: { ...previewCardBase, cardFlowV2Audit },
        identity: v2Identity,
        market: v2Market,
        evidence: v2Result.evidence,
        settings,
        rules,
      })
    : card.cardFlowV2OfferPreview;

  const stampedV2 = stampCardFlowV2Bundles(
    {
      evidence: v2Result.evidence ?? card.cardFlowV2Evidence,
      identity: v2Identity ?? card.cardFlowV2Identity,
      market: v2Market ?? card.cardFlowV2Market,
      audit: cardFlowV2Audit,
      offerPreview: cardFlowV2OfferPreview,
    },
    card.category ?? v2Identity?.category,
  );

  let updated: ScannedCard = {
    ...card,
    cardFlowV2VersionMetadata: stampedV2.cardFlowV2VersionMetadata,
    cardFlowV2Evidence: stampedV2.evidence ?? card.cardFlowV2Evidence,
    cardFlowV2Identity: stampedV2.identity ?? card.cardFlowV2Identity,
    cardFlowV2Market: stampedV2.market ?? card.cardFlowV2Market,
    cardFlowV2Audit: stampedV2.audit,
    cardFlowV2OfferPreview: stampedV2.offerPreview,
  };

  const allowOfferInfluence =
    isCardFlowV2OfferInfluenceEnabled() && !input.skipOfferInfluence;

  if (allowOfferInfluence) {
    updated = applyV2OfferInfluenceToCard(updated).card;
  } else {
    updated = restoreProductionFields(updated, productionBefore);
  }

  const productionAfter = snapshotProductionFields(updated);
  const mutation = compareProductionFields(productionBefore, productionAfter);

  if (mutation.changed && enforce && !allowOfferInfluence) {
    updated = restoreProductionFields(updated, productionBefore);
    throw new ProductionFieldMutationError(card.id, mutation);
  }

  return { card: updated, productionBefore, productionAfter, mutation };
}
