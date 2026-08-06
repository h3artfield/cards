import type {
  ConditionEstimate,
  ConditionLadderEntry,
  StoreSettings,
  VisionResult,
} from "../types";
import { CONDITION_LABELS } from "../constants";
import { pokemonIdentificationComplete } from "./pokemon-utils";

/** Cash/trade from a pre-built condition ladder row. */
export function offersFromLadder(
  ladder: ConditionLadderEntry[] | undefined,
  condition: ConditionEstimate,
): { cashOffer: number; tradeOffer: number; marketValue: number } | null {
  const row = ladder?.find((r) => r.condition === condition);
  if (!row) return null;
  return {
    cashOffer: row.cashOffer,
    tradeOffer: row.tradeOffer,
    marketValue: row.marketValue,
  };
}

export function buildConditionLadder(
  marketPrice: number,
  settings: StoreSettings,
  cashPercent: number,
  tradePercent: number,
  estimatedCondition?: ConditionEstimate,
  options?: { slabLabel?: string },
): ConditionLadderEntry[] {
  if (options?.slabLabel) {
    return [
      {
        condition: "NM",
        label: options.slabLabel,
        multiplier: 1,
        marketValue: marketPrice,
        cashOffer: marketPrice * cashPercent,
        tradeOffer: marketPrice * tradePercent,
        isEstimated: true,
      },
    ];
  }

  const conditions: ConditionEstimate[] = ["NM", "LP", "MP", "HP", "DMG"];

  return conditions.map((condition) => {
    const multiplier = settings.conditionMultipliers[condition] ?? 0;
    const marketValue = marketPrice * multiplier;
    return {
      condition,
      label: CONDITION_LABELS[condition],
      multiplier,
      marketValue,
      cashOffer: marketValue * cashPercent,
      tradeOffer: marketValue * tradePercent,
      isEstimated: condition === estimatedCondition,
    };
  });
}

export function applyConditionPricing(
  marketPrice: number,
  condition: ConditionEstimate,
  settings: StoreSettings,
  cashPercent: number,
  tradePercent: number,
  options?: {
    skipConditionMultiplier?: boolean;
    skipMinimumOffer?: boolean;
    roundOffersToWholeDollar?: boolean;
  },
): { marketValue: number; cashOffer: number; tradeOffer: number } {
  const multiplier = options?.skipConditionMultiplier
    ? 1
    : (settings.conditionMultipliers[condition] ?? 1);
  const marketValue = marketPrice * multiplier;

  let cashOffer = marketValue * cashPercent;
  let tradeOffer = marketValue * tradePercent;

  if (!options?.skipMinimumOffer) {
    cashOffer = Math.max(cashOffer, settings.minimumOffer);
    tradeOffer = Math.max(tradeOffer, settings.minimumOffer);
  }

  if (options?.roundOffersToWholeDollar) {
    cashOffer = roundOfferUpToWholeDollar(cashOffer);
    tradeOffer = roundOfferUpToWholeDollar(tradeOffer);
  }

  return { marketValue, cashOffer, tradeOffer };
}

function roundOfferUpToWholeDollar(amount: number): number {
  if (amount <= 0) return amount;
  return Math.ceil(amount);
}

export function needsManualReview(
  vision: VisionResult,
  marketPrice: number,
  settings: StoreSettings,
  pricingEstimated?: boolean,
): boolean {
  if (pricingEstimated && marketPrice <= 0) return true;
  if (vision.confidence < 0.55) return true;
  if (vision.itemType === "unknown") return true;
  if (vision.category === "other") return true;

  const weakPokemonId =
    vision.category === "pokemon" && !pokemonIdentificationComplete(vision);

  if (weakPokemonId) return true;

  // High-value cards with confident ID still get an offer; admin can review later.
  if (
    marketPrice >= settings.manualReviewThreshold &&
    vision.confidence < 0.8
  ) {
    return true;
  }

  return false;
}
