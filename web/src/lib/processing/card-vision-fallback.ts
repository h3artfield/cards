import type { ScannedCard, VisionResult } from "../types";

/** Card-level name/set/number when evidence slots are empty or catalog fails. */
export function cardVisionFallback(card: ScannedCard): Partial<VisionResult> {
  const vision = card.visionJson as VisionResult | undefined;
  return {
    cardName: card.detectedName ?? vision?.cardName,
    setName: card.setName ?? vision?.setName,
    setCode: vision?.setCode,
    cardNumber: card.cardNumber ?? vision?.cardNumber,
    category: card.category ?? vision?.category,
  };
}
