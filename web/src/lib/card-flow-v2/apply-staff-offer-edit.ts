import type { ScannedCard, StoreRule, StoreSettings, VisionResult } from "../types";
import { applyMarketPricing } from "../processing/apply-market-pricing";
import { ensureCardTcgConditionLows } from "./ensure-card-tcg-condition-lows";
import { refreshCardV2PreviewAfterStaffEdit } from "./refresh-card-after-staff-edit";
import { conditionOffersForEffectiveGrade } from "./condition-based-offers";
import { getStaffSelectedSuspect } from "./staff-suspect-selection";
import { suspectBlocksTcgplayerPricing } from "./pokemon-japanese-fallback";
import { resolveClerkDisplayOffers } from "./clerk-card-insights";

function isStaffOfferEdit(update: Partial<ScannedCard>): boolean {
  return (
    update.marketPrice != null ||
    update.cashOffer != null ||
    update.tradeOffer != null ||
    update.conditionEstimate != null ||
    update.conditionOverride != null
  );
}

/** Recompute V2 preview + production offers after staff saves edit-offer fields. */
export async function applyStaffOfferEditToCard(input: {
  card: ScannedCard;
  update: Partial<ScannedCard>;
  settings: StoreSettings;
  rules: StoreRule[];
}): Promise<ScannedCard> {
  let merged = { ...input.card, ...input.update, id: input.card.id };

  if (
    !isStaffOfferEdit(input.update) ||
    (!input.card.cardFlowV2Identity && !input.card.cardFlowV2Market)
  ) {
    return merged;
  }

  const vision = merged.visionJson as VisionResult | undefined;
  const newCondition =
    input.update.conditionOverride?.condition ?? input.update.conditionEstimate;
  if (newCondition && vision) {
    merged.visionJson = {
      ...vision,
      conditionEstimate: newCondition,
    };
  }

  merged = await ensureCardTcgConditionLows(merged);
  merged = applyMarketPricing(merged, input.settings, input.rules);
  merged = refreshCardV2PreviewAfterStaffEdit({
    card: merged,
    settings: input.settings,
    rules: input.rules,
  });

  const staffSuspect = merged.cardFlowV2Identity
    ? getStaffSelectedSuspect(merged.cardFlowV2Identity)
    : undefined;

  if (!suspectBlocksTcgplayerPricing(staffSuspect)) {
    const row = conditionOffersForEffectiveGrade(merged, input.settings);
    if (row) {
      merged = {
        ...merged,
        marketPrice: row.marketValue,
        cashOffer: row.cashOffer,
        tradeOffer: row.tradeOffer,
      };
    } else {
      const preview = merged.cardFlowV2OfferPreview;
      if (preview?.previewMarketValue != null) {
        merged.marketPrice = preview.previewMarketValue;
        if (preview.previewCashOffer != null) {
          merged.cashOffer = preview.previewCashOffer;
        }
        if (preview.previewTradeOffer != null) {
          merged.tradeOffer = preview.previewTradeOffer;
        }
      }
    }
  } else {
    const versionConfirmed = Boolean(
      merged.cardFlowV2Identity?.staffSelection?.suspectId,
    );
    const display = resolveClerkDisplayOffers({
      card: merged,
      offerPreview: merged.cardFlowV2OfferPreview,
      versionConfirmed,
    });
    if (
      display.market != null &&
      input.update.marketPrice == null &&
      input.update.cashOffer == null &&
      input.update.tradeOffer == null
    ) {
      merged.marketPrice = display.market;
      if (display.cash != null) merged.cashOffer = display.cash;
      if (display.trade != null) merged.tradeOffer = display.trade;
    }
  }

  return merged;
}
