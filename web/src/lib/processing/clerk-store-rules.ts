import type { CardCategory, ScannedCard, StoreRule, VisionResult } from "../types";
import {
  applyStoreRules,
  enrichVisionForStoreRules,
  normalizeRuleCategory,
  type RuleEngineResult,
} from "./rules-engine";

export { normalizeRuleCategory };

export function visionForStoreRules(card: ScannedCard): VisionResult {
  const existing = card.visionJson as VisionResult | undefined;
  const base =
    existing?.category
      ? existing
      : {
          category: card.category ?? "other",
          itemType: card.itemType === "graded" ? "graded" : "raw",
          cardName: card.detectedName ?? "",
          setName: card.setName,
          year: card.year,
          conditionEstimate: card.conditionEstimate ?? "LP",
          confidence: 0.7,
        };
  return enrichVisionForStoreRules(base as VisionResult, card);
}

/** Re-evaluate store rules against clerk-facing market (V2 preview when confirmed). */
export function evaluateClerkStoreRules(
  card: ScannedCard,
  rules: StoreRule[],
  marketPrice: number,
): RuleEngineResult {
  return applyStoreRules(rules, visionForStoreRules(card), marketPrice, {
    resaleAnalysis: card.resaleAnalysis,
  });
}

export function clerkStoreRuleBlocksBuy(result: RuleEngineResult): boolean {
  return result.doNotBuy;
}
