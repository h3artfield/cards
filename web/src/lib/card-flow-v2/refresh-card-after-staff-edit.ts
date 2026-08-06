import type { ScannedCard, StoreRule, StoreSettings } from "../types";
import { runCardAuditV2 } from "./audit/run-card-audit-v2";
import { computeCardOfferPreviewV2 } from "./offer/run-card-offer-preview-v2";
import { stampCardFlowV2Bundles } from "./version-metadata";

/** Recompute V2 audit + offer preview after staff edits condition or offer fields. */
export function refreshCardV2PreviewAfterStaffEdit(input: {
  card: ScannedCard;
  settings: StoreSettings;
  rules: StoreRule[];
}): ScannedCard {
  const { card } = input;
  if (!card.cardFlowV2Identity && !card.cardFlowV2Market) {
    return card;
  }

  const cardFlowV2Audit = runCardAuditV2({ card });
  const cardFlowV2OfferPreview = computeCardOfferPreviewV2({
    card: { ...card, cardFlowV2Audit },
    identity: card.cardFlowV2Identity,
    market: card.cardFlowV2Market,
    evidence: card.cardFlowV2Evidence,
    settings: input.settings,
    rules: input.rules,
  });

  const stamped = stampCardFlowV2Bundles(
    {
      audit: cardFlowV2Audit,
      offerPreview: cardFlowV2OfferPreview,
    },
    card.category ?? card.cardFlowV2Identity?.category,
  );

  return {
    ...card,
    cardFlowV2Audit: stamped.audit ?? cardFlowV2Audit,
    cardFlowV2OfferPreview: stamped.offerPreview ?? cardFlowV2OfferPreview,
    cardFlowV2VersionMetadata:
      stamped.cardFlowV2VersionMetadata ?? card.cardFlowV2VersionMetadata,
  };
}
