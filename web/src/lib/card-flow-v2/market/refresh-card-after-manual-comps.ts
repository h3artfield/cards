import type { ScannedCard, StoreRule, StoreSettings } from "../../types";
import { runCardAuditV2 } from "../audit/run-card-audit-v2";
import { runCardOfferPreviewV2 } from "../offer/run-card-offer-preview-v2";
import { stampCardFlowV2Bundles } from "../version-metadata";
import { mergeV2ShadowBundlesOnly } from "../v2-reprocess-summary";
import { snapshotProductionFields } from "../shadow-v2-reprocess";
import { applyManualCompsToMarketBundle } from "./manual-comp-snapshot";

/** Server-only — refresh V2 audit + offer preview after manual comps. */
export function refreshCardAfterManualComps(input: {
  card: ScannedCard;
  settings: StoreSettings;
  rules: StoreRule[];
}): ScannedCard {
  const productionBefore = snapshotProductionFields(input.card);
  const suspectId =
    input.card.cardFlowV2Identity?.staffSelection?.suspectId ??
    input.card.cardFlowV2Market?.selectedSuspectId;

  const market = applyManualCompsToMarketBundle(
    input.card.cardFlowV2Market,
    input.card.cardFlowV2ManualComps,
    suspectId,
  );

  const previewBase: ScannedCard = { ...input.card, cardFlowV2Market: market };
  const cardFlowV2Audit = runCardAuditV2({ card: previewBase });
  const cardFlowV2OfferPreview = runCardOfferPreviewV2({
    card: { ...previewBase, cardFlowV2Audit },
    identity: input.card.cardFlowV2Identity,
    market,
    evidence: input.card.cardFlowV2Evidence,
    settings: input.settings,
    rules: input.rules,
  });

  const stamped = stampCardFlowV2Bundles(
    {
      market,
      audit: cardFlowV2Audit,
      offerPreview: cardFlowV2OfferPreview,
    },
    input.card.category ?? input.card.cardFlowV2Identity?.category,
  );

  const refreshed: ScannedCard = {
    ...input.card,
    cardFlowV2Market: stamped.market ?? market,
    cardFlowV2Audit: stamped.audit,
    cardFlowV2OfferPreview: stamped.offerPreview,
    cardFlowV2VersionMetadata:
      stamped.cardFlowV2VersionMetadata ?? input.card.cardFlowV2VersionMetadata,
    marketPrice: productionBefore.marketPrice,
    cashOffer: productionBefore.cashOffer,
    tradeOffer: productionBefore.tradeOffer,
    status: productionBefore.status,
  };

  return mergeV2ShadowBundlesOnly(input.card, refreshed);
}
