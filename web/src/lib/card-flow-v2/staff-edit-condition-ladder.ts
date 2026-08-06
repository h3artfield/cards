import type { ConditionEstimate, ConditionLadderEntry, ScannedCard, StoreSettings } from "../types";
import { DEFAULT_STORE_SETTINGS } from "../constants";
import { effectiveCardCondition } from "../processing/apply-market-pricing";
import {
  tcgConditionLowForGrade,
  tcgConditionLadderFromMarket,
} from "./market/tcg-condition-pricing";
import { getPrimaryMarketSnapshot } from "./market/promote-staff-confirmed-market";
import type { VisionResult } from "../types";
import {
  conditionOffersForCard,
  conditionOffersForEffectiveGrade,
} from "./condition-based-offers";
import { getStaffSelectedSuspect } from "./staff-suspect-selection";
import { suspectBlocksTcgplayerPricing } from "./pokemon-japanese-fallback";
import { resolveClerkDisplayOffers } from "./clerk-card-insights";

export { conditionOffersForCard, conditionOffersForEffectiveGrade };

export function clerkHasTcgConditionPricing(
  card: ScannedCard,
  condition?: ConditionEstimate,
): boolean {
  const staffSuspect = card.cardFlowV2Identity
    ? getStaffSelectedSuspect(card.cardFlowV2Identity)
    : undefined;
  if (suspectBlocksTcgplayerPricing(staffSuspect)) return false;

  const vision = card.visionJson as VisionResult | undefined;
  const grade = condition ?? effectiveCardCondition(card, vision);
  const snapshot = getPrimaryMarketSnapshot(card.cardFlowV2Market);
  return tcgConditionLowForGrade(snapshot?.tcgplayerMapping, grade) != null;
}

/** Condition ladder for staff edit UI — prefers live TCG per-condition lows. */
export function resolveStaffEditConditionLadder(
  card: ScannedCard,
): ConditionLadderEntry[] | undefined {
  const staffSuspect = card.cardFlowV2Identity
    ? getStaffSelectedSuspect(card.cardFlowV2Identity)
    : undefined;
  if (suspectBlocksTcgplayerPricing(staffSuspect)) {
    return card.conditionLadder;
  }

  const vision = card.visionJson as VisionResult | undefined;
  const condition = effectiveCardCondition(card, vision);
  const isSlab = card.itemType === "graded";

  const tcgLadder = tcgConditionLadderFromMarket(
    card.cardFlowV2Market,
    { id: "client", ...DEFAULT_STORE_SETTINGS },
    isSlab
      ? DEFAULT_STORE_SETTINGS.slabCashPercent
      : DEFAULT_STORE_SETTINGS.defaultCashPercent,
    isSlab
      ? DEFAULT_STORE_SETTINGS.slabTradePercent
      : DEFAULT_STORE_SETTINGS.defaultTradePercent,
    condition,
  );

  return tcgLadder ?? card.conditionLadder;
}

function offersFromClerkDisplay(
  card: ScannedCard,
  settings: StoreSettings,
): { cashOffer: number; tradeOffer: number; marketValue: number } | null {
  const versionConfirmed = Boolean(
    card.cardFlowV2Identity?.staffSelection?.suspectId,
  );
  const display = resolveClerkDisplayOffers({
    card,
    offerPreview: card.cardFlowV2OfferPreview,
    versionConfirmed,
  });
  if (display.market == null) return null;

  const isSlab = card.itemType === "graded";
  const cashPercent = isSlab
    ? settings.slabCashPercent
    : settings.defaultCashPercent;
  const tradePercent = isSlab
    ? settings.slabTradePercent
    : settings.defaultTradePercent;

  return {
    marketValue: display.market,
    cashOffer:
      display.cash ??
      Math.max(display.market * cashPercent, settings.minimumOffer),
    tradeOffer:
      display.trade ??
      Math.max(display.market * tradePercent, settings.minimumOffer),
  };
}

export function staffEditOffersForCondition(
  card: ScannedCard,
  condition: ConditionEstimate,
  settings: StoreSettings = { id: "client", ...DEFAULT_STORE_SETTINGS },
): { cashOffer: number; tradeOffer: number; marketValue: number } | null {
  const staffSuspect = card.cardFlowV2Identity
    ? getStaffSelectedSuspect(card.cardFlowV2Identity)
    : undefined;
  if (suspectBlocksTcgplayerPricing(staffSuspect)) {
    return offersFromClerkDisplay(card, settings);
  }
  return conditionOffersForCard(card, condition, settings);
}
