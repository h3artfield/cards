import type { ScannedCard, StoreRule, StoreSettings } from "../types";
import { applyMarketPricing } from "../processing/apply-market-pricing";
import { getPrimaryMarketSnapshot } from "./market/promote-staff-confirmed-market";
import { ensureCardTcgConditionLows } from "./ensure-card-tcg-condition-lows";
import { refreshCardV2PreviewAfterStaffEdit } from "./refresh-card-after-staff-edit";
import { conditionOffersForEffectiveGrade } from "./condition-based-offers";
import {
  getStaffSelectedSuspect,
} from "./staff-suspect-selection";
import {
  staffSuspectUsesTcgplayerJapanCatalog,
  suspectBlocksTcgplayerPricing,
} from "./pokemon-japanese-fallback";
import { resolveClerkDisplayOffers } from "./clerk-card-insights";

function needsTcgConditionFetch(card: ScannedCard): boolean {
  const snapshot = getPrimaryMarketSnapshot(card.cardFlowV2Market);
  const mapping = snapshot?.tcgplayerMapping;
  if (!mapping?.productId) return false;
  const lows = mapping.conditionLowPrices;
  return !lows || Object.keys(lows).length === 0;
}

function previewDriftsFromConditionOffers(card: ScannedCard, settings: StoreSettings): boolean {
  const row = conditionOffersForEffectiveGrade(card, settings);
  if (!row) return false;
  const previewMarket =
    card.cardFlowV2OfferPreview?.previewMarketValue ??
    card.cardFlowV2OfferPreview?.marketDecision?.marketValue;
  if (previewMarket == null) return true;
  return Math.abs(previewMarket - row.marketValue) > 0.05;
}

/** Fetch missing TCG per-condition lows and align preview + production offers. */
export async function enrichCardClerkPricingIfNeeded(input: {
  card: ScannedCard;
  settings: StoreSettings;
  rules: StoreRule[];
}): Promise<{ card: ScannedCard; changed: boolean }> {
  const { card, settings, rules } = input;
  const versionConfirmed = Boolean(
    card.cardFlowV2Identity?.staffSelection?.suspectId,
  );
  if (!versionConfirmed || !card.cardFlowV2Market || !card.cardFlowV2Identity) {
    return { card, changed: false };
  }

  const staffSuspect = getStaffSelectedSuspect(card.cardFlowV2Identity);
  const usePreviewClerkPath =
    suspectBlocksTcgplayerPricing(staffSuspect) ||
    staffSuspectUsesTcgplayerJapanCatalog(staffSuspect);
  if (usePreviewClerkPath) {
    const display = resolveClerkDisplayOffers({
      card,
      offerPreview: card.cardFlowV2OfferPreview,
      versionConfirmed: true,
    });
    if (display.market != null) {
      const isSlab = card.itemType === "graded";
      const cashPct = isSlab ? settings.slabCashPercent : settings.defaultCashPercent;
      const tradePct = isSlab ? settings.slabTradePercent : settings.defaultTradePercent;
      const cashOffer =
        display.cash ??
        Math.max(display.market * cashPct, settings.minimumOffer);
      const tradeOffer =
        display.trade ??
        Math.max(display.market * tradePct, settings.minimumOffer);
      const marketDrift =
        card.marketPrice == null ||
        Math.abs(card.marketPrice - display.market) > 0.05;
      const cashDrift =
        card.cashOffer == null || Math.abs(card.cashOffer - cashOffer) > 0.05;
      if (marketDrift || cashDrift) {
        return {
          card: {
            ...card,
            marketPrice: display.market,
            cashOffer,
            tradeOffer,
          },
          changed: true,
        };
      }
    }
    return { card, changed: false };
  }

  let updated = card;
  let changed = false;

  if (needsTcgConditionFetch(card)) {
    updated = await ensureCardTcgConditionLows(card);
    changed = true;
  }

  if (changed || previewDriftsFromConditionOffers(updated, settings)) {
    updated = applyMarketPricing(updated, settings, rules);
    updated = refreshCardV2PreviewAfterStaffEdit({
      card: updated,
      settings,
      rules,
    });
    changed = true;
  }

  const row = conditionOffersForEffectiveGrade(updated, settings);
  if (row) {
    const marketDrift =
      updated.marketPrice == null ||
      Math.abs(updated.marketPrice - row.marketValue) > 0.05;
    if (marketDrift) {
      updated = {
        ...updated,
        marketPrice: row.marketValue,
        cashOffer: row.cashOffer,
        tradeOffer: row.tradeOffer,
      };
      changed = true;
    }
  }

  return { card: updated, changed };
}
