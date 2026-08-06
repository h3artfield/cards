import type {
  CardFlowV2AuditRecord,
  V2AuditAgreement,
  V2AuditIssue,
  V2AuditRiskLevel,
  V2AuditSummary,
  V2IdentityBasis,
} from "./types";
import {
  printMarketDataCoverage,
  printSourceHealthBatchSummary,
  summarizeMarketDataCoverage,
  summarizeSourceHealthBatch,
} from "../market/source-health";
import {
  printOfferPreviewSummary,
  summarizeOfferPreviews,
} from "../offer/offer-preview-summary";
import type { V2OfferPreview } from "../offer/types";
import { summarizeStaffConfirmationCoverage } from "../staff-confirmation-queue";
import type { ScannedCard } from "../../types";

const ALL_AGREEMENTS: V2AuditAgreement[] = [
  "matches_current",
  "v2_higher",
  "v2_lower",
  "current_has_price_v2_none",
  "v2_has_price_current_none",
  "both_no_price",
  "not_comparable",
];

const ALL_RISKS: V2AuditRiskLevel[] = ["low", "medium", "high", "critical"];

const ALL_IDENTITY_BASIS: V2IdentityBasis[] = [
  "vision_locked",
  "staff_confirmed",
  "unlocked_candidates",
  "no_candidates",
];

export function summarizeV2Audits(
  records: CardFlowV2AuditRecord[],
  snapshots: Array<{
    sourceHealth?: import("../market/source-health-types").MarketSourceHealth[];
    marketOutcome?: import("../market/source-health-types").MarketOutcomeSummary;
    pricingMethod?: string;
    valueMedian?: number;
  }> = [],
  offerPreviews: V2OfferPreview[] = [],
  cards: ScannedCard[] = [],
): V2AuditSummary {
  const agreementCounts = Object.fromEntries(
    ALL_AGREEMENTS.map((a) => [a, 0]),
  ) as Record<V2AuditAgreement, number>;
  const riskCounts = Object.fromEntries(
    ALL_RISKS.map((r) => [r, 0]),
  ) as Record<V2AuditRiskLevel, number>;

  const issueCounts = new Map<V2AuditIssue, number>();
  const identityBasisCounts = Object.fromEntries(
    ALL_IDENTITY_BASIS.map((b) => [b, 0]),
  ) as Record<V2IdentityBasis, number>;

  let lockedCount = 0;
  let highConfidenceMarketCount = 0;
  let mediumConfidenceMarketCount = 0;
  let lowConfidenceMarketCount = 0;
  let noMarketCount = 0;

  const examples = {
    largeDisagreements: [] as string[],
    identityNotLocked: [] as string[],
    noAcceptedComps: [] as string[],
    slabMismatches: [] as string[],
    pricechartingWarnings: [] as string[],
  };

  for (const record of records) {
    if (record.v2Locked) lockedCount++;
    identityBasisCounts[record.v2IdentityBasis]++;
    agreementCounts[record.priceComparison.agreement]++;
    riskCounts[record.riskLevel]++;

    switch (record.v2MarketConfidence) {
      case "high":
        highConfidenceMarketCount++;
        break;
      case "medium":
        mediumConfidenceMarketCount++;
        break;
      case "low":
        lowConfidenceMarketCount++;
        break;
      default:
        noMarketCount++;
    }

    for (const issue of record.issues) {
      issueCounts.set(issue, (issueCounts.get(issue) ?? 0) + 1);
    }

    if (record.issues.includes("large_price_disagreement")) {
      examples.largeDisagreements.push(record.cardId);
    }
    if (record.issues.includes("identity_not_locked")) {
      examples.identityNotLocked.push(record.cardId);
    }
    if (record.issues.includes("no_accepted_comps")) {
      examples.noAcceptedComps.push(record.cardId);
    }
    if (record.issues.includes("slab_label_mismatch")) {
      examples.slabMismatches.push(record.cardId);
    }
    if (record.issues.includes("pricecharting_tier_warning")) {
      examples.pricechartingWarnings.push(record.cardId);
    }
  }

  const topIssues = [...issueCounts.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalCards: records.length,
    lockedCount,
    unlockedCount: records.length - lockedCount,
    highConfidenceMarketCount,
    mediumConfidenceMarketCount,
    lowConfidenceMarketCount,
    noMarketCount,
    agreementCounts,
    riskCounts,
    topIssues,
    examples: {
      largeDisagreements: examples.largeDisagreements.slice(0, 10),
      identityNotLocked: examples.identityNotLocked.slice(0, 10),
      noAcceptedComps: examples.noAcceptedComps.slice(0, 10),
      slabMismatches: examples.slabMismatches.slice(0, 10),
      pricechartingWarnings: examples.pricechartingWarnings.slice(0, 10),
    },
    avgIdentityConfidence:
      records.length > 0
        ? records.reduce((s, r) => s + r.v2IdentityConfidence, 0) / records.length
        : undefined,
    identityBasisCounts,
    sourceHealthStats: summarizeSourceHealthBatch(snapshots),
    marketDataCoverage: summarizeMarketDataCoverage(snapshots),
    offerPreviewSummary:
      offerPreviews.length > 0
        ? summarizeOfferPreviews(offerPreviews)
        : undefined,
    staffConfirmationMetrics:
      cards.length > 0
        ? summarizeStaffConfirmationCoverage(cards, offerPreviews)
        : undefined,
  };
}

export { printMarketDataCoverage, printSourceHealthBatchSummary, printOfferPreviewSummary };

export function printAuditSummary(summary: V2AuditSummary): void {
  console.log("\n=== V2 Audit Summary ===");
  console.log(`Total cards audited: ${summary.totalCards}`);
  console.log(`V2 locked: ${summary.lockedCount}`);
  console.log(`V2 not locked: ${summary.unlockedCount}`);
  if (summary.avgIdentityConfidence != null) {
    console.log(
      `Avg identity confidence: ${(summary.avgIdentityConfidence * 100).toFixed(1)}%`,
    );
  }
  console.log(
    `Market confidence — high: ${summary.highConfidenceMarketCount}, medium: ${summary.mediumConfidenceMarketCount}, low: ${summary.lowConfidenceMarketCount}, none: ${summary.noMarketCount}`,
  );
  console.log("\nIdentity basis:");
  for (const [k, v] of Object.entries(summary.identityBasisCounts)) {
    if (v > 0) console.log(`  ${k}: ${v}`);
  }
  console.log("\nAgreement counts:");
  for (const [k, v] of Object.entries(summary.agreementCounts)) {
    if (v > 0) console.log(`  ${k}: ${v}`);
  }
  console.log("\nRisk counts:");
  for (const [k, v] of Object.entries(summary.riskCounts)) {
    if (v > 0) console.log(`  ${k}: ${v}`);
  }
  if (summary.topIssues.length) {
    console.log("\nTop issues:");
    for (const { issue, count } of summary.topIssues) {
      console.log(`  ${issue}: ${count}`);
    }
  }
  console.log("\nExample card IDs:");
  for (const [label, ids] of Object.entries(summary.examples)) {
    if (ids.length) console.log(`  ${label}: ${ids.join(", ")}`);
  }
  if (summary.sourceHealthStats) {
    printSourceHealthBatchSummary(summary.sourceHealthStats);
  }
  if (summary.marketDataCoverage) {
    printMarketDataCoverage(summary.marketDataCoverage);
  }
  if (summary.offerPreviewSummary) {
    printOfferPreviewSummary(summary.offerPreviewSummary);
  }
  if (summary.staffConfirmationMetrics) {
    const m = summary.staffConfirmationMetrics;
    console.log("\n=== Staff confirmation coverage ===");
    console.log(`Variant unresolved: ${m.variantUnresolved}`);
    console.log(`Variant resolved by staff: ${m.variantResolvedByStaff}`);
    console.log(`Preview eligible (staff-confirmed): ${m.previewEligibleStaffConfirmed}`);
    console.log(`Preview blocked despite staff-confirmed: ${m.previewBlockedDespiteStaffConfirmed}`);
    console.log("Coverage targets:", JSON.stringify(m.coverageTargets, null, 2));
    console.log("Staff-confirmed by category:", m.staffConfirmedByCategory);
  }
}
