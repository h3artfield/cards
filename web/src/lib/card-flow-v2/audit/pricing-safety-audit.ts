import { getPrimaryMarketSnapshot } from "../market/promote-staff-confirmed-market";
import type { CardFlowV2MarketBundle } from "../market/types";
import type { PriceChartingMappingAudit } from "../market/source-health-types";
import { computeCardOfferPreviewV2 } from "../offer/run-card-offer-preview-v2";
import type { V2OfferPreview } from "../offer/types";
import { runCardAuditV2 } from "./run-card-audit-v2";
import type { CardFlowV2AuditRecord } from "./types";
import type { ScannedCard, StoreRule } from "../../types";
import { DEFAULT_STORE_SETTINGS } from "../../constants";
import { getStaffSelectedSuspect } from "../staff-suspect-selection";

export type PricingSafetyRiskBucket = "critical" | "high" | "medium" | "low";

export type PricingSafetySignal =
  | "v1_possible_wrong_pricecharting_mapping"
  | "v2_rejects_pricecharting_product"
  | "large_percent_disagreement"
  | "large_absolute_disagreement"
  | "pricecharting_collector_mismatch"
  | "set_code_mismatch"
  | "finish_mismatch"
  | "scryfall_exact_print_disagreement"
  | "same_name_multi_printing_spread";

export type PricingSafetyFinding = {
  cardId: string;
  orderId?: string;
  cardName: string;
  confirmedIdentity: string;
  productionMarketPrice?: number;
  v2PreviewMarket?: number;
  percentDifference?: number;
  absoluteDifference?: number;
  suspectedBadSource?: string;
  reason: string;
  recommendedStaffAction: string;
  riskBucket: PricingSafetyRiskBucket;
  signals: PricingSafetySignal[];
  productionStatus?: string;
};

const CUSTOMER_FACING_STATUSES = new Set([
  "approved",
  "complete",
  "completed",
  "accepted",
  "paid",
  "purchased",
]);

const MANUAL_REVIEW_STATUSES = new Set([
  "pending",
  "review",
  "do_not_buy",
  "rejected",
  "declined",
  "hold",
]);

function resolveIdentityLabel(card: ScannedCard): string {
  const identity = card.cardFlowV2Identity;
  const staff = identity ? getStaffSelectedSuspect(identity) : undefined;
  if (staff?.label) return staff.label;
  if (identity?.lockedIdentity.locked && identity.lockedIdentity.canonicalName) {
    const l = identity.lockedIdentity;
    return [
      l.canonicalName,
      l.setName ?? l.setCode,
      l.collectorNumber ? `#${l.collectorNumber}` : undefined,
      l.finish,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  const top = identity?.suspects[0];
  return top?.label ?? card.detectedName ?? "Unknown";
}

function pricingSourceLabel(card: ScannedCard): string | undefined {
  const src = (card.pricingJson as { source?: string } | undefined)?.source;
  if (!src) return undefined;
  if (/pricecharting/i.test(src)) return "pricecharting";
  if (/tcgplayer/i.test(src)) return "tcgplayer";
  if (/scryfall/i.test(src)) return "scryfall";
  return src;
}

function pctDiff(production?: number, v2?: number): number | undefined {
  if (production == null || production <= 0 || v2 == null || v2 <= 0) {
    return undefined;
  }
  return Math.abs(production - v2) / production;
}

function absDiff(production?: number, v2?: number): number | undefined {
  if (production == null || v2 == null) return undefined;
  return Math.abs(production - v2);
}

function scryfallExactPrintPrice(market?: CardFlowV2MarketBundle): number | undefined {
  const snap = getPrimaryMarketSnapshot(market);
  const sig = snap?.acceptedComps.find((a) => a.comp.source === "scryfall_print_price");
  return sig?.comp.price;
}

function sameNameMultiPrintingSpread(card: ScannedCard): boolean {
  const suspects = card.cardFlowV2Identity?.suspects ?? [];
  if (suspects.length < 2) return false;
  const byName = new Map<string, number[]>();
  for (const s of suspects) {
    const name = (s.canonicalName ?? "").toLowerCase();
    if (!name) continue;
    const raw = s.rawCatalogData as { prices?: { usd?: string; usd_foil?: string } } | undefined;
    const finish = (s.finish ?? "").toLowerCase();
    const priceStr =
      finish.includes("foil") && !finish.includes("non")
        ? raw?.prices?.usd_foil
        : raw?.prices?.usd;
    const price = priceStr ? parseFloat(priceStr) : NaN;
    if (!Number.isFinite(price) || price <= 0) continue;
    const list = byName.get(name) ?? [];
    list.push(price);
    byName.set(name, list);
  }
  for (const prices of byName.values()) {
    if (prices.length < 2) continue;
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    if (max > min * 3 && max - min > 10) return true;
  }
  return false;
}

function classifyRisk(
  signals: PricingSafetySignal[],
  card: ScannedCard,
  percentDifference?: number,
): PricingSafetyRiskBucket {
  const status = (card.status ?? "").toLowerCase();
  const customerFacing = CUSTOMER_FACING_STATUSES.has(status);
  const manualReview = MANUAL_REVIEW_STATUSES.has(status);

  if (
    signals.includes("v1_possible_wrong_pricecharting_mapping") &&
    customerFacing
  ) {
    return "critical";
  }
  if ((percentDifference ?? 0) >= 0.5 && customerFacing) {
    return "critical";
  }
  if (
    signals.includes("v1_possible_wrong_pricecharting_mapping") ||
    (percentDifference ?? 0) >= 0.5
  ) {
    return "high";
  }
  if (manualReview || signals.includes("v2_rejects_pricecharting_product")) {
    return "medium";
  }
  return "low";
}

function recommendedAction(
  risk: PricingSafetyRiskBucket,
  signals: PricingSafetySignal[],
): string {
  if (risk === "critical") {
    return "Staff review production offer immediately — V1 price likely wrong.";
  }
  if (signals.includes("v1_possible_wrong_pricecharting_mapping")) {
    return "Staff review production offer — rejected PriceCharting mapping.";
  }
  if (risk === "high") {
    return "Staff review production vs V2 preview before customer-facing use.";
  }
  if (risk === "medium") {
    return "Verify pricing source before approving offer.";
  }
  return "Optional spot check — low-confidence V2 disagreement.";
}

function buildReason(
  signals: PricingSafetySignal[],
  pcMapping?: PriceChartingMappingAudit,
  pricingSource?: string,
): string {
  if (signals.includes("v1_possible_wrong_pricecharting_mapping")) {
    const mm = pcMapping?.identityMismatch;
    if (mm?.reason === "collector_number_mismatch") {
      return `PriceCharting #${mm.parsedCollectorNumber ?? "?"} rejected for ${mm.expectedSetCode ?? "?"} #${mm.expectedCollectorNumber ?? "?"}`;
    }
    if (mm) {
      return `PriceCharting product rejected (${mm.reason.replace(/_/g, " ")})`;
    }
    return "V2 rejected PriceCharting product that likely supports V1 production price";
  }
  if (signals.includes("pricecharting_collector_mismatch")) {
    return "PriceCharting collector number does not match confirmed identity";
  }
  if (signals.includes("set_code_mismatch")) {
    return "Set mismatch between confirmed identity and pricing source";
  }
  if (signals.includes("finish_mismatch")) {
    return "Finish mismatch between confirmed identity and pricing source";
  }
  if (signals.includes("scryfall_exact_print_disagreement")) {
    return "V1 price differs from Scryfall exact-print signal";
  }
  if (signals.includes("same_name_multi_printing_spread")) {
    return "Same card name has multiple printings with very different prices";
  }
  if (signals.includes("large_percent_disagreement")) {
    return `Production vs V2 preview differs by >30%${pricingSource ? ` (V1 source: ${pricingSource})` : ""}`;
  }
  if (signals.includes("large_absolute_disagreement")) {
    return "Production vs V2 preview differs by >$10";
  }
  return "Pricing safety signal detected";
}

export function analyzePricingSafety(input: {
  card: ScannedCard;
  audit?: CardFlowV2AuditRecord;
  preview?: V2OfferPreview;
}): PricingSafetyFinding | null {
  const audit = input.audit ?? runCardAuditV2({ card: input.card });
  const preview =
    input.preview ??
    input.card.cardFlowV2OfferPreview ??
    computeCardOfferPreviewV2({
      card: input.card,
      settings: { id: "pricing-safety", ...DEFAULT_STORE_SETTINGS },
      rules: [] as StoreRule[],
    });

  const production = input.card.marketPrice;
  const v2Preview = preview.previewMarketValue ?? preview.marketDecision.marketValue;
  const percentDifference = pctDiff(production, v2Preview);
  const absoluteDifference = absDiff(production, v2Preview);

  const snap = getPrimaryMarketSnapshot(input.card.cardFlowV2Market);
  const pcMapping = snap?.priceChartingMapping;
  const mm = pcMapping?.identityMismatch;
  const pricingSource = pricingSourceLabel(input.card);

  const signals: PricingSafetySignal[] = [];

  if (audit.issues.includes("v1_possible_wrong_pricecharting_mapping")) {
    signals.push("v1_possible_wrong_pricecharting_mapping");
  }
  if (
    pcMapping?.reasonIfSkipped === "pricecharting_product_identity_mismatch" ||
    snap?.rejectedComps.some((a) =>
      a.rejectionReasons.includes("pricecharting_product_identity_mismatch"),
    )
  ) {
    signals.push("v2_rejects_pricecharting_product");
  }
  if (mm?.reason === "collector_number_mismatch") {
    signals.push("pricecharting_collector_mismatch");
  }
  if (mm?.reason === "set_mismatch") {
    signals.push("set_code_mismatch");
  }
  if (mm?.reason === "finish_mismatch") {
    signals.push("finish_mismatch");
  }
  if (percentDifference != null && percentDifference > 0.3) {
    signals.push("large_percent_disagreement");
  }
  if (absoluteDifference != null && absoluteDifference > 10) {
    signals.push("large_absolute_disagreement");
  }
  const scryfallPrice = scryfallExactPrintPrice(input.card.cardFlowV2Market);
  if (
    scryfallPrice != null &&
    production != null &&
    production > 0 &&
    (production > scryfallPrice * 2.5 || production < scryfallPrice / 2.5) &&
    Math.abs(production - scryfallPrice) > 5
  ) {
    signals.push("scryfall_exact_print_disagreement");
  }
  if (sameNameMultiPrintingSpread(input.card)) {
    signals.push("same_name_multi_printing_spread");
  }

  if (!signals.length) return null;

  const riskBucket = classifyRisk(signals, input.card, percentDifference);
  const reason = buildReason(signals, pcMapping, pricingSource);

  return {
    cardId: input.card.id,
    orderId: input.card.orderId,
    cardName: input.card.detectedName ?? resolveIdentityLabel(input.card),
    confirmedIdentity: resolveIdentityLabel(input.card),
    productionMarketPrice: production,
    v2PreviewMarket: v2Preview,
    percentDifference,
    absoluteDifference,
    suspectedBadSource: pricingSource ?? (pcMapping?.productName ? "pricecharting" : undefined),
    reason,
    recommendedStaffAction: recommendedAction(riskBucket, signals),
    riskBucket,
    signals: [...new Set(signals)],
    productionStatus: input.card.status,
  };
}

export function runPricingSafetyAudit(
  cards: ScannedCard[],
  options?: { limit?: number },
): PricingSafetyFinding[] {
  const findings: PricingSafetyFinding[] = [];
  for (const card of cards) {
    const finding = analyzePricingSafety({ card });
    if (finding) findings.push(finding);
  }
  const order: PricingSafetyRiskBucket[] = ["critical", "high", "medium", "low"];
  findings.sort((a, b) => {
    const ri = order.indexOf(a.riskBucket) - order.indexOf(b.riskBucket);
    if (ri !== 0) return ri;
    return (b.percentDifference ?? 0) - (a.percentDifference ?? 0);
  });
  if (options?.limit != null) {
    return findings.slice(0, options.limit);
  }
  return findings;
}

export function bucketCounts(
  findings: PricingSafetyFinding[],
): Record<PricingSafetyRiskBucket, number> {
  return {
    critical: findings.filter((f) => f.riskBucket === "critical").length,
    high: findings.filter((f) => f.riskBucket === "high").length,
    medium: findings.filter((f) => f.riskBucket === "medium").length,
    low: findings.filter((f) => f.riskBucket === "low").length,
  };
}
