import type { ScannedCard } from "../types";
import { getPrimaryMarketSnapshot } from "./market/promote-staff-confirmed-market";
import { enrichTcgplayerMappingConditionLows } from "./market/tcgplayer-condition-lows";
import type { CardFlowV2MarketBundle } from "./market/types";
import { getStaffSelectedSuspect } from "./staff-suspect-selection";
import { suspectBlocksTcgplayerPricing } from "./pokemon-japanese-fallback";

/** Fetch per-condition TCG lows when missing from the stored market snapshot. */
export async function ensureCardTcgConditionLows(
  card: ScannedCard,
): Promise<ScannedCard> {
  const staffSuspect = card.cardFlowV2Identity
    ? getStaffSelectedSuspect(card.cardFlowV2Identity)
    : undefined;
  if (suspectBlocksTcgplayerPricing(staffSuspect)) {
    return card;
  }

  const market = card.cardFlowV2Market;
  if (!market?.snapshots?.length) return card;

  const snapshot = getPrimaryMarketSnapshot(market);
  const mapping = snapshot?.tcgplayerMapping;
  if (!mapping?.productId) return card;
  if (
    mapping.conditionLowPrices &&
    Object.keys(mapping.conditionLowPrices).length > 0
  ) {
    return card;
  }

  await enrichTcgplayerMappingConditionLows(mapping);
  if (!mapping.conditionLowPrices) return card;

  const snapshots = market.snapshots.map((s) =>
    s.suspectId === snapshot!.suspectId
      ? { ...s, tcgplayerMapping: { ...mapping } }
      : s,
  );

  const updatedMarket: CardFlowV2MarketBundle = {
    ...market,
    snapshots,
  };

  return { ...card, cardFlowV2Market: updatedMarket };
}
