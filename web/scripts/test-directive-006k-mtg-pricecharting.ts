/**
 * Directive 006K — MTG PriceCharting cross-printing pricing bug fix.
 * Run: npm run test:directive-006k-mtg-pricecharting
 */
import {
  assessMtgPriceChartingProductIdentity,
  buildMtgActiveSanityQueries,
  parseCollectorNumbersFromTitle,
} from "../src/lib/card-flow-v2/market/mtg-pricecharting-match";
import {
  buildScryfallPrintPriceComps,
  extractScryfallPrintPrices,
} from "../src/lib/card-flow-v2/market/scryfall-print-price";
import {
  buildSuspectSearchPlan,
  buildLockedIdentitySearchPlan,
} from "../src/lib/card-flow-v2/market/search-plan-builder";
import { assessMarketComp } from "../src/lib/card-flow-v2/market/comp-matcher";
import { calculateShadowMarketValue } from "../src/lib/card-flow-v2/market/value-calculator";
import { buildCardFlowV2AuditRecord } from "../src/lib/card-flow-v2/audit/audit-record";
import type { CardSuspect, LockedCardIdentity } from "../src/lib/card-flow-v2/types";
import type {
  CompMatchAssessment,
  MarketSearchPlan,
  RawMarketComp,
} from "../src/lib/card-flow-v2/market/types";
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

const MAR93_RAW = {
  id: "test-mar-93",
  name: "Ravenous Tyrannosaurus",
  collector_number: "93",
  set: { code: "mar", name: "Marvel Universe" },
  prices: { usd: "7.90", usd_foil: "12.34", eur: "6.50", tix: "0.03" },
  finishes: ["nonfoil", "foil"],
};

const MAR93_SUSPECT: CardSuspect = {
  suspectId: "scryfall:test-mar-93:nonfoil",
  category: "mtg",
  label: "Ravenous Tyrannosaurus · Marvel Universe (mar) · #93 · nonfoil",
  canonicalName: "Ravenous Tyrannosaurus",
  catalogSource: "scryfall",
  catalogId: "test-mar-93",
  setName: "Marvel Universe",
  setCode: "MAR",
  collectorNumber: "93",
  finish: "nonfoil",
  variantTags: ["nonfoil"],
  expectedEvidence: [],
  rawCatalogData: MAR93_RAW,
};

const REX18_RAW = {
  ...MAR93_RAW,
  id: "test-rex-18",
  collector_number: "18",
  set: { code: "rex", name: "Jurassic World Collection" },
  prices: { usd: "47.54", usd_foil: "55.00" },
};

function mar93Plan(): MarketSearchPlan {
  return buildSuspectSearchPlan(MAR93_SUSPECT);
}

function pcComp(
  productName: string,
  price: number,
  product?: Record<string, unknown>,
): RawMarketComp {
  return {
    source: "pricecharting",
    title: `${productName} (Ungraded)`,
    price,
    conditionText: "Ungraded",
    rawData: {
      pricingSignal: true,
      product: { "product-name": productName, ...(product ?? {}) },
    },
  };
}

function assessAll(comps: RawMarketComp[], plan: MarketSearchPlan) {
  return comps.map((c) => assessMarketComp(c, plan));
}

console.log("Directive 006K — MTG PriceCharting cross-printing\n");

console.log("1. PriceCharting #18 rejected for MAR #93");
{
  const plan = mar93Plan();
  const title = "Ravenous Tyrannosaurus [Borderless] #18";
  const identity = assessMtgPriceChartingProductIdentity(plan, title);
  assert(!identity.accepted, "identity assess rejects #18 for MAR #93");
  if (!identity.accepted) {
    assert(
      identity.details.reason === "collector_number_mismatch",
      "rejection reason is collector_number_mismatch",
    );
  }
  const assessment = assessMarketComp(pcComp(title, 49.99), plan);
  assert(assessment.status === "rejected", "comp matcher rejects PC #18");
  assert(
    assessment.rejectionReasons.includes("pricecharting_product_identity_mismatch"),
    "rejection reason pricecharting_product_identity_mismatch",
  );
}

console.log("\n2. PriceCharting #43 rejected for MAR #93");
{
  const plan = mar93Plan();
  const title = "Ravenous Tyrannosaurus #43";
  const identity = assessMtgPriceChartingProductIdentity(plan, title);
  assert(!identity.accepted, "identity assess rejects #43 for MAR #93");
  const assessment = assessMarketComp(pcComp(title, 120), plan);
  assert(assessment.status === "rejected", "comp matcher rejects PC #43");
}

console.log("\n3. Scryfall MAR #93 price accepted as pricing signal");
{
  const comps = buildScryfallPrintPriceComps({
    category: "mtg",
    canonicalName: "Ravenous Tyrannosaurus",
    setCode: "MAR",
    setName: "Marvel Universe",
    collectorNumber: "93",
    finish: "nonfoil",
    scryfallCatalogData: MAR93_RAW,
  });
  assert(comps.length === 1, "one scryfall comp for nonfoil");
  assert(Math.abs(comps[0]!.price - 7.9) < 0.01, "scryfall usd ~7.90");
  const plan = mar93Plan();
  const assessment = assessMarketComp(comps[0]!, plan);
  assert(assessment.status === "accepted", "scryfall print price accepted");
  assert(
    assessment.acceptedReasons.includes("scryfall_print_price"),
    "accepted reason scryfall_print_price",
  );
}

console.log("\n4. Scryfall other print rows not used for MAR #93");
{
  const rexPrices = extractScryfallPrintPrices(REX18_RAW, "nonfoil");
  assert(rexPrices[0]?.price === 47.54, "REX #18 scryfall price is separate");
  const marComps = buildScryfallPrintPriceComps({
    category: "mtg",
    canonicalName: "Ravenous Tyrannosaurus",
    setCode: "MAR",
    collectorNumber: "93",
    finish: "nonfoil",
    scryfallCatalogData: MAR93_RAW,
  });
  assert(
    !marComps.some((c) => c.price > 40),
    "MAR #93 suspect does not pull REX #18 price",
  );
}

console.log("\n5. Same name different set/collector rejected");
{
  const plan = mar93Plan();
  const title = "Ravenous Tyrannosaurus Jurassic World Collection #18";
  const identity = assessMtgPriceChartingProductIdentity(plan, title);
  assert(!identity.accepted, "Jurassic #18 rejected for MAR #93");
}

console.log("\n6. eBay active listings remain sanity only");
{
  const plan = mar93Plan();
  const active: RawMarketComp = {
    source: "ebay_active",
    title: "Ravenous Tyrannosaurus MAR 93",
    price: 7.85,
  };
  const assessment = assessMarketComp(active, plan);
  assert(assessment.status === "maybe", "active listing is maybe");
  assert(
    assessment.rejectionReasons.includes("active_listing_not_sold"),
    "active not sold comp",
  );
}

console.log("\n7. Active sanity can flag PriceCharting outlier");
{
  const plan = mar93Plan();
  const assessments = assessAll(
    [
      pcComp("Ravenous Tyrannosaurus [Borderless] #18", 49.99),
      { source: "ebay_active", title: "MAR 93", price: 6.99 },
      { source: "ebay_active", title: "MAR 93", price: 10.0 },
    ],
    plan,
  );
  // Force-accept PC for outlier test (bypass identity by using matching #93 title but wrong price)
  const forcedPc: CompMatchAssessment = {
    comp: pcComp("Ravenous Tyrannosaurus MAR #93", 49.99),
    status: "accepted",
    matchScore: 1,
    acceptedReasons: ["pricecharting_pricing_signal"],
    rejectionReasons: [],
    notes: [],
  };
  const withActive = [
    ...assessments.filter((a) => a.comp.source === "ebay_active"),
    forcedPc,
  ];
  const shadow = calculateShadowMarketValue({
    plan,
    assessments: withActive,
    lockedIdentityUsed: true,
    fetchWarnings: [],
  });
  const outlierRejected = shadow.rejectedComps.some((a) =>
    a.rejectionReasons.includes("pricing_signal_outlier"),
  );
  assert(outlierRejected, "PC outlier blocked vs active sanity range");
}

console.log("\n8. V2 shadow median for MAR #93 does not use #18 value");
{
  const plan = mar93Plan();
  const scryfall = buildScryfallPrintPriceComps({
    category: "mtg",
    canonicalName: "Ravenous Tyrannosaurus",
    setCode: "MAR",
    collectorNumber: "93",
    finish: "nonfoil",
    scryfallCatalogData: MAR93_RAW,
  })[0]!;
  const assessments = assessAll(
    [
      pcComp("Ravenous Tyrannosaurus [Borderless] #18", 49.99),
      scryfall,
    ],
    plan,
  );
  const shadow = calculateShadowMarketValue({
    plan,
    assessments,
    lockedIdentityUsed: true,
    fetchWarnings: [],
  });
  assert(
    shadow.valueMedian != null && shadow.valueMedian < 15,
    `shadow median ~$7.90 not $49.99 (got ${shadow.valueMedian})`,
  );
  assert(
    !shadow.acceptedComps.some(
      (a) => a.comp.source === "pricecharting" && a.comp.price > 40,
    ),
    "no accepted PC #18 comp in shadow",
  );
}

console.log("\n9. Audit flags production price if V1 used mismatched PC");
{
  const locked: LockedCardIdentity = {
    locked: true,
    lockStatus: "locked",
    confidence: 0.95,
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
    staffMessage: "Staff confirmed MAR #93",
    winningSuspectId: MAR93_SUSPECT.suspectId,
  };
  const plan = buildLockedIdentitySearchPlan(locked);
  const assessments = assessAll(
    [pcComp("Ravenous Tyrannosaurus [Borderless] #18", 49.99)],
    plan,
  );
  const card = {
    id: "card-1",
    orderId: "order-1",
    marketPrice: 49.99,
    cashOffer: 25,
    tradeOffer: 32.49,
    pricingJson: { source: "pricecharting" },
    cardFlowV2Identity: {
      category: "mtg" as const,
      suspects: [MAR93_SUSPECT],
      lockedIdentity: locked,
      staffSelection: { suspectId: MAR93_SUSPECT.suspectId },
    },
    cardFlowV2Market: {
      mode: "staff_confirmed_identity_market" as const,
      lockedIdentityStatus: "locked" as const,
      selectedSuspectId: MAR93_SUSPECT.suspectId,
      snapshots: [
        {
          suspectId: MAR93_SUSPECT.suspectId,
          lockedIdentityUsed: true,
          marketProductName: MAR93_SUSPECT.label!,
          searchPlan: plan,
          rawComps: [],
          compAssessments: assessments,
          acceptedComps: [],
          rejectedComps: assessments,
          maybeComps: [],
          confidence: "low" as const,
          pricingMethod: "no_market_data",
          warnings: [],
          sourceHealth: [],
          queryAudits: [],
          marketOutcome: {
            acceptedSoldComps: 0,
            maybeListings: 0,
            rejectedListings: 1,
            pricingSignals: 0,
            summaryLabel: "No accepted comps",
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
  } as unknown as ScannedCard;

  const audit = buildCardFlowV2AuditRecord({ card });
  assert(
    audit.issues.includes("v1_possible_wrong_pricecharting_mapping"),
    "audit flags v1_possible_wrong_pricecharting_mapping",
  );
  assert(
    audit.recommendedStaffAction.includes("mismatched PriceCharting"),
    "staff action mentions mismatched PriceCharting",
  );
}

console.log("\n10. MTG active sanity queries omit nonfoil term");
{
  const queries = buildMtgActiveSanityQueries({
    category: "mtg",
    canonicalName: "Ravenous Tyrannosaurus",
    setCode: "MAR",
    setName: "Marvel Universe",
    collectorNumber: "93",
    finish: "nonfoil",
  });
  assert(queries.length >= 2, "multiple active sanity queries");
  assert(
    queries.every((q) => !q.query.toLowerCase().includes("nonfoil")),
    "active sanity queries omit nonfoil",
  );
  assert(
    queries.some((q) => q.query.includes("MAR") && q.query.includes("93")),
    'includes "MAR" and "93" query',
  );
  assert(
    queries.some((q) => q.query.includes("M 0093")),
    'includes M 0093 format query',
  );
}

console.log("\n11. Collector number parser");
{
  assert(
    parseCollectorNumbersFromTitle("Ravenous Tyrannosaurus [Borderless] #18")[0] ===
      "18",
    "parses #18",
  );
  assert(
    parseCollectorNumbersFromTitle("MAR M 0093")[0] === "93",
    "parses M 0093",
  );
}

console.log(`\n006K: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`} (${passed} checks)`);
process.exit(failed > 0 ? 1 : 0);
