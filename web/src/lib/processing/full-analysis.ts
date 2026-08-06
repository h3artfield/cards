import type {
  CardConditionReport,
  CardIdentityVerification,
  CardResaleAnalysis,
  CardSalesComps,
  PricingResult,
  ScannedCard,
  StoreRule,
  StoreSettings,
} from "../types";
import { verifyCardIdentity } from "./card-verification";
import { gradeCardCondition } from "./condition-grade";
import { refreshCardMarketData } from "./refresh-pricing";
import { analyzeCardResale } from "./resale-analysis";
import { fetchSalesComps } from "./sales-comps";
import { applyMarketPricing } from "./apply-market-pricing";
import { prepareSportsCardForAnalysis, applySportsVisionToCard } from "./sports-card-fields";
import {
  clearPricingOnMismatch,
  identityBlocksPricing,
  pricingNeedsVerification,
  sanitizePriceChartingPricing,
} from "./pricing-verified";
import { refineVisionPricingAfterCondition } from "./pricing/apply-vision-pricing";
import { reconcileCardAssessment } from "./reconcile-assessment";
import { statusFromBuybackReport } from "./card-buy-decision";
import { syncCardIdentityFromCatalog } from "./sync-identity-from-catalog";
import { enrichIdentityVerificationFromCatalog } from "./reference-image";
import { mergeSlabFields, usesSlabGradePricing } from "./slab-pricing";
import { enrichCardFromSlabLabel } from "./slab-label-read";

export interface FullCardAnalysis {
  card: ScannedCard;
  identityVerification: CardIdentityVerification;
  conditionReport: CardConditionReport;
  salesComps: CardSalesComps;
  resaleAnalysis: CardResaleAnalysis;
}

export async function runFullCardAnalysis(
  card: ScannedCard,
  options?: {
    rules?: StoreRule[];
    settings?: StoreSettings;
    /** Directive 008 — async V1 must not overwrite V2 production fields. */
    preserveProductionFields?: boolean;
  },
): Promise<FullCardAnalysis> {
  const refreshCtx =
    options?.rules && options?.settings
      ? { rules: options.rules, settings: options.settings }
      : undefined;

  let workingCard = mergeSlabFields(await prepareSportsCardForAnalysis(card));
  if (usesSlabGradePricing(workingCard)) {
    workingCard = await enrichCardFromSlabLabel(workingCard);
  }

  const identityResult = await verifyCardIdentity(workingCard);
  workingCard = identityResult.cardPatch
    ? { ...workingCard, ...identityResult.cardPatch }
    : workingCard;

  let identityVerification = identityResult.verification;
  const identityConfirmed =
    identityVerification.verdict === "confirmed" ||
    identityVerification.verdict === "likely";
  const pricingBlocked = identityBlocksPricing(identityVerification);

  async function refreshAndPrice(card: ScannedCard): Promise<ScannedCard> {
    let next = await refreshCardMarketData(card, refreshCtx);
    next = sanitizePriceChartingPricing(next);
    if (refreshCtx) {
      next = applyMarketPricing(next, refreshCtx.settings, refreshCtx.rules);
    }
    return next;
  }

  if (pricingBlocked) {
    workingCard = clearPricingOnMismatch(workingCard);
    if (refreshCtx) {
      workingCard = applyMarketPricing(
        workingCard,
        refreshCtx.settings,
        refreshCtx.rules,
      );
    }
  } else if (identityConfirmed || identityVerification.correctedMatch) {
    workingCard = await syncCardIdentityFromCatalog(workingCard);
    workingCard = await refreshAndPrice(workingCard);
    const resynced = await syncCardIdentityFromCatalog(workingCard);
    const identityImproved =
      resynced.detectedName !== workingCard.detectedName ||
      resynced.setName !== workingCard.setName ||
      resynced.cardNumber !== workingCard.cardNumber;
    if (identityImproved) {
      workingCard = resynced;
      workingCard = await refreshAndPrice(workingCard);
    }
    identityVerification = await enrichIdentityVerificationFromCatalog(
      identityVerification,
      workingCard,
    );
  } else {
    workingCard = await refreshAndPrice(workingCard);
    identityVerification = await enrichIdentityVerificationFromCatalog(
      identityVerification,
      workingCard,
    );
  }

  const [conditionReport, salesComps] = await Promise.all([
    gradeCardCondition(workingCard),
    fetchSalesComps(workingCard),
  ]);

  workingCard = { ...workingCard, conditionReport, salesComps };

  if (refreshCtx && usesSlabGradePricing(workingCard)) {
    workingCard = applyMarketPricing(
      workingCard,
      refreshCtx.settings,
      refreshCtx.rules,
    );
  } else if (refreshCtx && conditionReport.serviceAvailable) {
    const pricing = workingCard.pricingJson as PricingResult | undefined;
    const slabPricing = usesSlabGradePricing(workingCard);
    if (
      !slabPricing &&
      ((pricing?.marketPrice ?? 0) <= 0 ||
        pricing?.source === "vision_estimate")
    ) {
      workingCard = await refineVisionPricingAfterCondition(
        { ...workingCard, conditionReport },
        conditionReport,
        refreshCtx,
      );
    }
  }

  const enriched: ScannedCard = {
    ...workingCard,
    identityVerification,
    conditionReport,
    salesComps,
  };

  const resaleAnalysis = await analyzeCardResale(enriched, {
    identityVerification,
    conditionReport,
    salesComps,
    rules: options?.rules,
  });

  let updated: ScannedCard = {
    ...enriched,
    resaleAnalysis,
  };

  if (options?.rules && options?.settings && !options.preserveProductionFields) {
    const reconciled = reconcileCardAssessment(
      updated,
      options.rules,
      options.settings,
      pricingNeedsVerification(updated),
    );
    updated = { ...updated, ...reconciled };
  }

  if (!options?.preserveProductionFields) {
    const reportDefault = statusFromBuybackReport(updated);
    if (reportDefault) {
      updated = { ...updated, ...reportDefault };
    }
  }

  return {
    card: updated,
    identityVerification,
    conditionReport,
    salesComps,
    resaleAnalysis,
  };
}
