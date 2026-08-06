import type {
  ConditionEstimate,
  ConditionLadderEntry,
  StoreSettings,
} from "../../types";
import { CONDITION_LABELS } from "../../constants";
import type { CandidateMarketSnapshot } from "./types";
import type { TcgplayerMappingAudit } from "./source-health-types";
import { getPrimaryMarketSnapshot } from "./promote-staff-confirmed-market";
import type { CardFlowV2MarketBundle } from "./types";

export function tcgConditionLowForGrade(
  mapping: TcgplayerMappingAudit | undefined,
  condition: ConditionEstimate,
): number | undefined {
  const price = mapping?.conditionLowPrices?.[condition];
  return price != null && price > 0 ? price : undefined;
}

export function buildTcgConditionLadder(input: {
  conditionLowPrices: Partial<Record<ConditionEstimate, number>>;
  cashPercent: number;
  tradePercent: number;
  settings: StoreSettings;
  estimatedCondition?: ConditionEstimate;
}): ConditionLadderEntry[] {
  const conditions: ConditionEstimate[] = ["NM", "LP", "MP", "HP", "DMG"];
  return conditions
    .filter((condition) => {
      const price = input.conditionLowPrices[condition];
      return price != null && price > 0;
    })
    .map((condition) => {
      const marketValue = input.conditionLowPrices[condition]!;
      return {
        condition,
        label: CONDITION_LABELS[condition],
        multiplier: 1,
        marketValue,
        cashOffer: Math.max(
          marketValue * input.cashPercent,
          input.settings.minimumOffer,
        ),
        tradeOffer: Math.max(
          marketValue * input.tradePercent,
          input.settings.minimumOffer,
        ),
        isEstimated: condition === input.estimatedCondition,
      };
    });
}

export function tcgConditionLadderFromSnapshot(
  snapshot: CandidateMarketSnapshot | undefined,
  settings: StoreSettings,
  cashPercent: number,
  tradePercent: number,
  estimatedCondition?: ConditionEstimate,
): ConditionLadderEntry[] | undefined {
  const lows = snapshot?.tcgplayerMapping?.conditionLowPrices;
  if (!lows || !Object.keys(lows).length) return undefined;
  return buildTcgConditionLadder({
    conditionLowPrices: lows,
    cashPercent,
    tradePercent,
    settings,
    estimatedCondition,
  });
}

export function tcgConditionLadderFromMarket(
  market: CardFlowV2MarketBundle | undefined,
  settings: StoreSettings,
  cashPercent: number,
  tradePercent: number,
  estimatedCondition?: ConditionEstimate,
): ConditionLadderEntry[] | undefined {
  return tcgConditionLadderFromSnapshot(
    getPrimaryMarketSnapshot(market),
    settings,
    cashPercent,
    tradePercent,
    estimatedCondition,
  );
}
