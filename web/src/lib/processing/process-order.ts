import type {
  BuybackOrder,
  ScannedCard,
  StoreRule,
  StoreSettings,
} from "../types";
import { analyzeCardImages } from "./vision";
import { enrichSportsCardIdentity } from "./enrich-sports-vision";
import { normalizeSportsVisionFields } from "./pricing/sports-search-queries";
import { applySportsVisionToCard } from "./sports-card-fields";
import {
  lookupMarketPrice,
  enrichVisionFromPokemonCard,
} from "./pricing";
import { applyStoreRules, rulePricingOptions } from "./rules-engine";
import {
  applyConditionPricing,
  buildConditionLadder,
  needsManualReview,
} from "./condition-ladder";
import { runFullCardAnalysis } from "./full-analysis";
import { isVerifiedMarketPrice } from "./pricing-verified";
import { applyVisionPricingLayer } from "./pricing/apply-vision-pricing";
import { mergeSlabFields, mergeVisionSlabFields, usesSlabGradePricing, slabLabel } from "./slab-pricing";
import { enrichCardFromSlabLabel } from "./slab-label-read";
import {
  isCardFlowV2EvidenceEnabled,
  isCardFlowV2AuditEnabled,
  isCardFlowV2OfferPreviewEnabled,
  isCardFlowV2StaffConfirmationEnabled,
  isCardFlowV2OfferInfluenceEnabled,
} from "../card-flow-v2/feature-flag";
import { applyV2OfferInfluenceToCard } from "../card-flow-v2/offer/apply-v2-offer-influence";
import { runCardFlowV2, type CardFlowV2Bundle } from "../card-flow-v2/run-card-flow-v2";
import { runCardAuditV2 } from "../card-flow-v2/audit/run-card-audit-v2";
import { runCardOfferPreviewV2 } from "../card-flow-v2/offer/run-card-offer-preview-v2";
import { applyStaffConfirmationPreservation } from "../card-flow-v2/staff-confirmation-preservation";
import { stampCardFlowV2Bundles } from "../card-flow-v2/version-metadata";
import {
  getCardProcessingConcurrency,
  getCardProcessingPipelineMode,
  isV1FullAnalysisOnSubmit,
} from "./processing-config";
import type { CardProcessingPipelineMode, OrderProcessingWorker } from "./processing-config";
import { processCardV2Primary } from "./process-card-v2-primary";
import { cardVisionFallback } from "./card-vision-fallback";
import { isCardProcessingComplete } from "./card-processing-state";

async function runCardFlowV2WithRetry(
  input: Parameters<typeof runCardFlowV2>[0],
  cardId: string,
): Promise<CardFlowV2Bundle> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await runCardFlowV2(input);
    } catch (err) {
      console.error(
        `[card-flow-v2] card ${cardId} attempt ${attempt + 1}:`,
        err,
      );
    }
  }
  return {};
}

async function enrichWithFullAnalysis(
  card: ScannedCard,
  settings: StoreSettings,
  rules: StoreRule[],
): Promise<ScannedCard> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await runFullCardAnalysis(card, {
        rules,
        settings,
      });
      return result.card;
    } catch (err) {
      lastErr = err;
      console.error(
        `[full-analysis] card ${card.id} attempt ${attempt + 1}:`,
        err,
      );
    }
  }

  const message =
    lastErr instanceof Error ? lastErr.message : "Analysis failed";
  return {
    ...card,
    warnings: [
      ...(card.warnings ?? []),
      "Full analysis incomplete — admin will retry automatically",
    ],
    status: card.status === "processed" ? "manual_review" : card.status,
  };
}

export async function processCard(
  card: ScannedCard,
  settings: StoreSettings,
  rules: StoreRule[],
): Promise<ScannedCard> {
  const v2Enabled = isCardFlowV2EvidenceEnabled();
  const v2Promise: Promise<CardFlowV2Bundle> = v2Enabled
    ? runCardFlowV2WithRetry({
        frontImageUrl: card.frontImageUrl,
        backImageUrl: card.backImageUrl,
        declaredItemType: card.itemType,
        visionFallback: cardVisionFallback(card),
      }, card.id)
    : Promise.resolve({});

  const rawVision = await analyzeCardImages(
    card.frontImageUrl,
    card.backImageUrl,
    card.itemType,
    rules,
  );

  let vision =
    rawVision.category === "sports"
      ? normalizeSportsVisionFields(
          await enrichSportsCardIdentity(rawVision, {
            frontImageUrl: card.frontImageUrl,
            backImageUrl: card.backImageUrl,
          }),
        )
      : rawVision;

  let cardWithVision = mergeSlabFields({
    ...card,
    visionJson: vision as unknown as Record<string, unknown>,
    itemType: vision.itemType,
    slabCompany: vision.slabCompany,
    slabGrade: vision.slabGrade,
    slabCertNumber: vision.slabCertNumber,
  });
  if (usesSlabGradePricing(cardWithVision)) {
    cardWithVision = await enrichCardFromSlabLabel(cardWithVision);
    vision = cardWithVision.visionJson as unknown as typeof vision;
  } else {
    vision = cardWithVision.visionJson as unknown as typeof vision;
  }

  let pricing = await lookupMarketPrice(vision, { card: cardWithVision });
  if (
    vision.category === "pokemon" &&
    pricing.raw &&
    !pricing.estimated &&
    !usesSlabGradePricing(cardWithVision)
  ) {
    const priorVision = vision;
    vision = mergeVisionSlabFields(enrichVisionFromPokemonCard(vision, pricing.raw));
    // Re-price with enriched set/number if identification improved
    if (
      vision.setName !== priorVision.setName ||
      vision.cardNumber !== priorVision.cardNumber
    ) {
      pricing = await lookupMarketPrice(vision, { card: cardWithVision });
      if (pricing.raw && !pricing.estimated) {
        vision = mergeVisionSlabFields(
          enrichVisionFromPokemonCard(vision, pricing.raw),
        );
      }
    }
  }

  const visionPricing = await applyVisionPricingLayer(
    { ...card, visionJson: vision as unknown as Record<string, unknown> },
    vision,
    pricing,
  );
  vision = visionPricing.vision;
  pricing = visionPricing.pricing;

  const merged = mergeSlabFields({
    ...cardWithVision,
    visionJson: vision as unknown as Record<string, unknown>,
    itemType: vision.itemType,
    slabCompany: vision.slabCompany,
    slabGrade: vision.slabGrade,
    slabCertNumber: vision.slabCertNumber,
  });
  vision = merged.visionJson as unknown as typeof vision;
  cardWithVision = merged;

  const ruleResult = applyStoreRules(rules, vision, pricing.marketPrice);

  const isSlab = usesSlabGradePricing(merged);
  let cashPercent = isSlab
    ? settings.slabCashPercent
    : settings.defaultCashPercent;
  let tradePercent = isSlab
    ? settings.slabTradePercent
    : settings.defaultTradePercent;

  if (ruleResult.cashPercentOverride != null)
    cashPercent = ruleResult.cashPercentOverride;
  if (ruleResult.tradePercentOverride != null)
    tradePercent = ruleResult.tradePercentOverride;

  const slabPricing = usesSlabGradePricing({
    itemType: vision.itemType,
    slabCompany: vision.slabCompany,
    slabGrade: vision.slabGrade,
    visionJson: vision as unknown as Record<string, unknown>,
  });
  const gradedLabel = slabPricing ? slabLabel({
    slabCompany: vision.slabCompany,
    slabGrade: vision.slabGrade,
    visionJson: vision as unknown as Record<string, unknown>,
  }) : undefined;
  const pricingCondition = slabPricing ? "NM" as const : vision.conditionEstimate;

  const { marketValue, cashOffer, tradeOffer } = applyConditionPricing(
    pricing.marketPrice,
    pricingCondition,
    settings,
    cashPercent,
    tradePercent,
    {
      skipConditionMultiplier: slabPricing,
      ...rulePricingOptions(ruleResult),
    },
  );

  const ladder = buildConditionLadder(
    pricing.marketPrice,
    settings,
    cashPercent,
    tradePercent,
    pricingCondition,
    gradedLabel ? { slabLabel: gradedLabel } : undefined,
  );

  const warnings: string[] = [];
  if (vision.confidence < 0.6) warnings.push("Low identification confidence");
  if (pricing.source === "vision_estimate") {
    warnings.push("AI market estimate from photos — verify on eBay before offer");
  } else if (!isVerifiedMarketPrice(pricing) && (pricing.marketPrice ?? 0) <= 0) {
    warnings.push("No market comp found — verify price before making an offer");
  }
  if (vision.visibleDamage) warnings.push(`Damage: ${vision.visibleDamage}`);
  warnings.push(...ruleResult.notes);

  let status: ScannedCard["status"] = "processed";
  if (ruleResult.doNotBuy) {
    status = "do_not_buy";
    warnings.push("Store policy: do not buy");
  } else if (
    ruleResult.manualReview ||
    needsManualReview(
      vision,
      pricing.marketPrice,
      settings,
      !isVerifiedMarketPrice(pricing) && pricing.marketPrice <= 0,
    )
  ) {
    status = "manual_review";
    warnings.push("Flagged for manual review");
  }

  const v2Result = v2Enabled ? await v2Promise : {};

  let v2Identity = v2Result.identity;
  let v2Market = v2Result.market;
  if (v2Identity && isCardFlowV2StaffConfirmationEnabled()) {
    const preserved = await applyStaffConfirmationPreservation({
      previousIdentity: card.cardFlowV2Identity,
      previousMarket: card.cardFlowV2Market,
      identity: v2Identity,
      market: v2Market,
      imageRefs: {
        frontImageUrl: card.frontImageUrl,
        backImageUrl: card.backImageUrl,
      },
    });
    v2Identity = preserved.identity;
    v2Market = preserved.market;
  }

  const cardFlowV2Audit = isCardFlowV2AuditEnabled()
    ? runCardAuditV2({
        card: {
          ...merged,
          id: card.id,
          orderId: card.orderId,
          frontImageUrl: card.frontImageUrl,
          backImageUrl: card.backImageUrl,
          category: vision.category,
          itemType: vision.itemType,
          detectedName: merged.detectedName ?? card.detectedName,
          marketPrice: marketValue,
          cashOffer: ruleResult.doNotBuy ? 0 : cashOffer,
          tradeOffer: ruleResult.doNotBuy ? 0 : tradeOffer,
          status,
          pricingJson: pricing as unknown as Record<string, unknown>,
          cardFlowV2Evidence: v2Result.evidence,
          cardFlowV2Identity: v2Identity,
          cardFlowV2Market: v2Market,
          createdAt: card.createdAt,
        },
        evidence: v2Result.evidence,
        identity: v2Identity,
        market: v2Market,
      })
    : undefined;

  const previewCard = {
    ...merged,
    id: card.id,
    orderId: card.orderId,
    frontImageUrl: card.frontImageUrl,
    backImageUrl: card.backImageUrl,
    category: vision.category,
    itemType: vision.itemType,
    detectedName: merged.detectedName ?? card.detectedName,
    marketPrice: marketValue,
    cashOffer: ruleResult.doNotBuy ? 0 : cashOffer,
    tradeOffer: ruleResult.doNotBuy ? 0 : tradeOffer,
    status,
    visionJson: vision as unknown as Record<string, unknown>,
    pricingJson: pricing as unknown as Record<string, unknown>,
    cardFlowV2Evidence: v2Result.evidence,
    cardFlowV2Identity: v2Identity,
    cardFlowV2Market: v2Market,
    cardFlowV2Audit,
    createdAt: card.createdAt,
  };

  const cardFlowV2OfferPreview = isCardFlowV2OfferPreviewEnabled()
    ? runCardOfferPreviewV2({
        card: previewCard,
        identity: v2Identity,
        market: v2Market,
        evidence: v2Result.evidence,
        settings,
        rules,
      })
    : undefined;

  const stampedV2 = stampCardFlowV2Bundles(
    {
      evidence: v2Result.evidence,
      identity: v2Identity,
      market: v2Market,
      audit: cardFlowV2Audit,
      offerPreview: cardFlowV2OfferPreview,
    },
    vision.category,
  );

  let resultCard = applySportsVisionToCard(
    {
      ...merged,
      category: vision.category,
      itemType: vision.itemType,
      variant: vision.variant,
      parallel: vision.parallel,
      autograph: vision.autograph,
      relicPatch: vision.relicPatch,
      serialNumbered: vision.serialNumbered,
      slabCompany: vision.slabCompany,
      slabGrade: vision.slabGrade,
      slabCertNumber: vision.slabCertNumber,
      conditionEstimate: pricingCondition,
      conditionConfidence: vision.confidence,
      visionJson: vision as unknown as Record<string, unknown>,
      pricingJson: pricing as unknown as Record<string, unknown>,
      marketPrice: marketValue,
      cashOffer: ruleResult.doNotBuy ? 0 : cashOffer,
      tradeOffer: ruleResult.doNotBuy ? 0 : tradeOffer,
      conditionLadder: ladder,
      status,
      warnings,
      ruleMatches: ruleResult.matchedRules,
      cardFlowV2VersionMetadata: stampedV2.cardFlowV2VersionMetadata,
      cardFlowV2Evidence: stampedV2.evidence,
      cardFlowV2Identity: stampedV2.identity,
      cardFlowV2Market: stampedV2.market,
      cardFlowV2Audit: stampedV2.audit,
      cardFlowV2OfferPreview: stampedV2.offerPreview,
    },
    vision,
  );

  if (isCardFlowV2OfferInfluenceEnabled()) {
    resultCard = applyV2OfferInfluenceToCard(resultCard).card;
  }

  return resultCard;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (limit <= 1 || items.length <= 1) {
    for (let i = 0; i < items.length; i++) {
      await fn(items[i]!, i);
    }
    return;
  }

  const workers = Math.min(limit, items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const index = nextIndex++;
      if (index >= items.length) return;
      await fn(items[index]!, index);
    }
  }

  await Promise.all(Array.from({ length: workers }, () => worker()));
}

function cardProcessingFailed(
  card: ScannedCard,
  err: unknown,
  attemptId?: string,
): ScannedCard {
  const message = err instanceof Error ? err.message : String(err);
  return {
    ...card,
    status: "manual_review",
    processingAttemptId: attemptId ?? card.processingAttemptId,
    lastCompletedStep: "card_processing_failed",
    warnings: [
      ...(card.warnings ?? []),
      `Processing failed — admin can reprocess: ${message}`,
    ],
  };
}

export async function processOrderCards(
  cards: ScannedCard[],
  settings: StoreSettings,
  rules: StoreRule[],
  hooks?: {
    workerMode?: OrderProcessingWorker;
    pipelineMode?: CardProcessingPipelineMode;
    attemptId?: string;
    skipFullAnalysis?: boolean;
    onCardProcessing?: (
      card: ScannedCard,
      index: number,
      total: number,
    ) => void | Promise<void>;
    onCardComplete?: (
      card: ScannedCard,
      index: number,
      total: number,
    ) => void | Promise<void>;
    onCardSkipped?: (card: ScannedCard) => void;
    onCardFailed?: (card: ScannedCard, err: unknown) => void;
    onCardFailedSave?: (
      card: ScannedCard,
      index: number,
      total: number,
    ) => void | Promise<void>;
  },
): Promise<{ cards: ScannedCard[]; orderTotals: Partial<BuybackOrder> }> {
  const processedById = new Map<string, ScannedCard>();
  const pipelineMode =
    hooks?.pipelineMode ?? getCardProcessingPipelineMode();
  const workerMode = hooks?.workerMode ?? "after";
  const concurrency = getCardProcessingConcurrency();
  const total = cards.length;

  const pending: Array<{ card: ScannedCard; index: number }> = [];

  for (let index = 0; index < cards.length; index++) {
    const card = cards[index]!;
    if (isCardProcessingComplete(card)) {
      processedById.set(card.id, card);
      hooks?.onCardSkipped?.(card);
      continue;
    }
    pending.push({ card, index });
  }

  await runWithConcurrency(pending, concurrency, async ({ card, index }) => {
    try {
      if (hooks?.onCardProcessing) {
        await hooks.onCardProcessing(
          { ...card, status: "processing", processingAttemptId: hooks.attemptId },
          index,
          total,
        );
      }

      let analyzed: ScannedCard;
      if (pipelineMode === "v2_primary") {
        analyzed = await processCardV2Primary(card, settings, rules, workerMode);
      } else {
        const base = await processCard(card, settings, rules);
        analyzed =
          hooks?.skipFullAnalysis || !isV1FullAnalysisOnSubmit()
            ? base
            : await enrichWithFullAnalysis(base, settings, rules);
      }

      processedById.set(card.id, analyzed);
      if (hooks?.onCardComplete) {
        await hooks.onCardComplete(analyzed, index, total);
      }
    } catch (err) {
      hooks?.onCardFailed?.(card, err);
      console.error(`[processOrderCards] card ${card.id}:`, err);
      const failed = cardProcessingFailed(card, err, hooks?.attemptId);
      processedById.set(card.id, failed);
      if (hooks?.onCardFailedSave) {
        await hooks.onCardFailedSave(failed, index, total);
      }
    }
  });

  const processed = cards
    .map((card) => processedById.get(card.id))
    .filter((card): card is ScannedCard => card != null);

  const eligible = processed.filter((c) => c.status !== "do_not_buy");
  const manualReviewCount = processed.filter(
    (c) => c.status === "manual_review" || c.status === "do_not_buy",
  ).length;

  return {
    cards: processed,
    orderTotals: {
      totalMarketEstimate: eligible.reduce(
        (sum, c) => sum + (c.marketPrice ?? 0),
        0,
      ),
      totalCashOffer: eligible.reduce((sum, c) => sum + (c.cashOffer ?? 0), 0),
      totalTradeOffer: eligible.reduce(
        (sum, c) => sum + (c.tradeOffer ?? 0),
        0,
      ),
      manualReviewCount,
    },
  };
}

export function resolveOrderStatus(
  manualReviewCount: number,
  cardCount: number,
): BuybackOrder["status"] {
  if (manualReviewCount > 0) return "under_review";
  if (cardCount === 0) return "under_review";
  return "offer_ready";
}
