/**
 * Directive 006L — pricing safety audit unit tests.
 * Run: npm run test:directive-006l-pricing-safety
 */
import { analyzePricingSafety } from "../src/lib/card-flow-v2/audit/pricing-safety-audit";
import { buildProductionPriceWarning } from "../src/lib/card-flow-v2/audit/production-price-warning";
import { runCardAuditV2 } from "../src/lib/card-flow-v2/audit/run-card-audit-v2";
import type { CardSuspect, LockedCardIdentity } from "../src/lib/card-flow-v2/types";
import type { ScannedCard } from "../src/lib/types";

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ ${msg}`);
  }
}

const MAR93_SUSPECT: CardSuspect = {
  suspectId: "scryfall:mar-93:nonfoil",
  category: "mtg",
  label: "Ravenous Tyrannosaurus · Marvel Universe (mar) · #93 · nonfoil",
  canonicalName: "Ravenous Tyrannosaurus",
  catalogSource: "scryfall",
  setCode: "MAR",
  setName: "Marvel Universe",
  collectorNumber: "93",
  finish: "nonfoil",
  variantTags: ["nonfoil"],
  expectedEvidence: [],
};

function tyrannosaurusCard(): ScannedCard {
  const locked: LockedCardIdentity = {
    locked: false,
    lockStatus: "not_locked_variant_uncertainty",
    confidence: 0.9,
    category: "mtg",
    canonicalName: "Ravenous Tyrannosaurus",
    setName: "Marvel Universe",
    setCode: "MAR",
    collectorNumber: "93",
    finish: "nonfoil",
    variantTags: [],
    requiredEvidenceSatisfied: true,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    staffMessage: "Staff confirmed",
    winningSuspectId: MAR93_SUSPECT.suspectId,
  };
  return {
    id: "579ba1f4-6106-4716-9c94-a0130be39ea3",
    orderId: "49e5b55e-fc9d-4bcf-b505-fda9976f880d",
    detectedName: "Ravenous Tyrannosaurus",
    category: "mtg",
    marketPrice: 49.99,
    cashOffer: 25,
    tradeOffer: 32.49,
    status: "approved",
    pricingJson: { source: "pricecharting" },
    cardFlowV2Identity: {
      category: "mtg",
      suspects: [MAR93_SUSPECT],
      lockedIdentity: locked,
      staffSelection: { suspectId: MAR93_SUSPECT.suspectId },
    },
    cardFlowV2Market: {
      mode: "staff_confirmed_identity_market",
      lockedIdentityStatus: "not_locked_variant_uncertainty",
      selectedSuspectId: MAR93_SUSPECT.suspectId,
      snapshots: [
        {
          suspectId: MAR93_SUSPECT.suspectId,
          lockedIdentityUsed: true,
          marketProductName: MAR93_SUSPECT.label!,
          searchPlan: {} as never,
          rawComps: [],
          compAssessments: [],
          acceptedComps: [
            {
              comp: {
                source: "scryfall_print_price",
                title: "Ravenous Tyrannosaurus MAR #93",
                price: 7.91,
                conditionText: "scryfall_usd",
              },
              status: "accepted",
              matchScore: 1,
              acceptedReasons: ["scryfall_print_price"],
              rejectionReasons: [],
              notes: [],
            },
          ],
          rejectedComps: [],
          maybeComps: [],
          valueMedian: 7.91,
          valueLow: 7.91,
          valueHigh: 7.91,
          confidence: "low",
          pricingMethod: "price_signal_only_scryfall_print_price",
          warnings: [],
          sourceHealth: [],
          queryAudits: [],
          marketOutcome: {
            acceptedSoldComps: 0,
            maybeListings: 0,
            rejectedListings: 0,
            pricingSignals: 1,
            summaryLabel: "Scryfall signal",
          },
          priceChartingMapping: {
            attempted: true,
            tiersExcluded: [],
            warnings: [],
            reasonIfSkipped: "pricecharting_product_identity_mismatch",
            identityMismatch: {
              expectedSetCode: "MAR",
              expectedCollectorNumber: "93",
              priceChartingTitle: "Ravenous Tyrannosaurus [Borderless] #18",
              parsedCollectorNumber: "18",
              reason: "collector_number_mismatch",
            },
          },
        },
      ],
      recommendedStaffAction: "review",
      warnings: [],
      createdAt: new Date().toISOString(),
    },
    cardFlowV2OfferPreview: {
      enabled: true,
      eligible: true,
      previewMarketValue: 7.91,
      currentMarketPrice: 49.99,
      recommendedAction: "staff_review_required",
      createdAt: new Date().toISOString(),
      marketDecision: {
        usableForOfferPreview: true,
        basis: "scryfall_print_price",
        marketValue: 7.91,
        confidence: "low",
        blockers: ["ebay_sold_unavailable"],
        warnings: [],
        sourceValues: [],
        explanation: "",
      },
    } as ScannedCard["cardFlowV2OfferPreview"],
  } as unknown as ScannedCard;
}

console.log("Directive 006L — pricing safety audit tests\n");

console.log("1. Ravenous Tyrannosaurus reported as critical mismatch");
{
  const card = tyrannosaurusCard();
  const audit = runCardAuditV2({ card });
  const finding = analyzePricingSafety({ card, audit });
  assert(finding != null, "finding exists");
  assert(finding!.riskBucket === "critical", "critical risk bucket");
  assert(
    finding!.signals.includes("v1_possible_wrong_pricecharting_mapping"),
    "v1_possible_wrong_pricecharting_mapping signal",
  );
  assert(
    (finding!.percentDifference ?? 0) > 0.8,
    "large percent disagreement",
  );
  assert(finding!.productionMarketPrice === 49.99, "production $49.99");
  assert(finding!.v2PreviewMarket === 7.91, "V2 $7.91");
}

console.log("\n2. Production price warning banner message");
{
  const card = tyrannosaurusCard();
  const audit = runCardAuditV2({ card });
  const snap = card.cardFlowV2Market?.snapshots[0];
  const warning = buildProductionPriceWarning({
    audit,
    priceChartingMapping: snap?.priceChartingMapping,
  });
  assert(warning != null, "warning generated");
  assert(
    warning!.title.includes("Production price may be wrong"),
    "warning title",
  );
  assert(
    warning!.detail.includes("expected MAR #93"),
    "expected MAR #93 in detail",
  );
  assert(
    warning!.detail.includes("#18"),
    "rejected #18 in detail",
  );
  assert(
    warning!.footer.includes("not changed automatically"),
    "no auto-change footer",
  );
}

console.log(`\n006L safety: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${passed} checks)`);
process.exit(failed > 0 ? 1 : 0);
