import type {
  ConditionEstimate,
  ScannedCard,
  StoreSettings,
  VisionResult,
} from "../types";
import { DEFAULT_STORE_SETTINGS } from "../constants";
import { offersFromLadder } from "../processing/condition-ladder";
import { effectiveCardCondition } from "../processing/apply-market-pricing";
import { tcgConditionLadderFromMarket } from "./market/tcg-condition-pricing";
import { getStaffSelectedSuspect } from "./staff-suspect-selection";
import { suspectBlocksTcgplayerPricing } from "./pokemon-japanese-fallback";

/** Market/cash/trade for a grade — same logic as staff edit form. */
export function conditionOffersForCard(
  card: ScannedCard,
  condition: ConditionEstimate,
  settings: StoreSettings = { id: "client", ...DEFAULT_STORE_SETTINGS },
): { marketValue: number; cashOffer: number; tradeOffer: number } | null {
  const staffSuspect = card.cardFlowV2Identity
    ? getStaffSelectedSuspect(card.cardFlowV2Identity)
    : undefined;
  if (suspectBlocksTcgplayerPricing(staffSuspect)) {
    return null;
  }
  const isSlab = card.itemType === "graded";
  const cashPercent = isSlab
    ? settings.slabCashPercent
    : settings.defaultCashPercent;
  const tradePercent = isSlab
    ? settings.slabTradePercent
    : settings.defaultTradePercent;

  const tcgLadder = tcgConditionLadderFromMarket(
    card.cardFlowV2Market,
    settings,
    cashPercent,
    tradePercent,
    condition,
  );
  const ladder = tcgLadder ?? card.conditionLadder;
  return offersFromLadder(ladder, condition);
}

export function conditionOffersForEffectiveGrade(
  card: ScannedCard,
  settings?: StoreSettings,
): { marketValue: number; cashOffer: number; tradeOffer: number } | null {
  const vision = card.visionJson as VisionResult | undefined;
  const condition = effectiveCardCondition(card, vision);
  return conditionOffersForCard(card, condition, settings);
}
