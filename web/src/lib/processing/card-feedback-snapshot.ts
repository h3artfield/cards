import type { ScannedCard } from "../types";

/** Snapshot of card analysis sent with store feedback. */
export function buildCardFeedbackSnapshot(card: ScannedCard) {
  return {
    category: card.category,
    setName: card.setName,
    cardNumber: card.cardNumber,
    marketPrice: card.marketPrice,
    cashOffer: card.cashOffer,
    tradeOffer: card.tradeOffer,
    warnings: card.warnings,
    staffDecision: card.staffDecision,
    cardStatus: card.status,
    frontImageUrl: card.frontImageUrl,
    resaleAnalysis: card.resaleAnalysis,
    identityVerification: card.identityVerification,
    conditionReport: card.conditionReport,
    salesComps: card.salesComps,
  };
}
