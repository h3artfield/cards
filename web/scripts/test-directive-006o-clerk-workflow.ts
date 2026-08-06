/**
 * Directive 006O — clerk-first card review workflow.
 * Run: npm run test:directive-006o-clerk-workflow
 */
import {
  resolveAdminCardViewMode,
} from "../src/lib/card-flow-v2/admin-card-view-mode";
import {
  clerkRecommendationShortTitle,
  needsProductionComparison,
  resolveClerkRecommendation,
  showClerkWarningSection,
} from "../src/lib/card-flow-v2/clerk-recommendation";
import {
  buildClerkCardInsightLines,
  clerkShouldShowStoredOfferMismatch,
  clerkShouldShowStaleBuybackWarning,
  formatStoreCondition,
  resolveClerkDisplayOffers,
  resaleAnalysisLikelyStale,
} from "../src/lib/card-flow-v2/clerk-card-insights";
import {
  computeProductionOrderRunningTotals,
  effectiveClerkCardDecision,
} from "../src/lib/processing/card-buy-decision";
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

console.log("Directive 006O — clerk-first workflow\n");

assert(resolveAdminCardViewMode({}) === "clerk", "default view is clerk");
assert(
  resolveAdminCardViewMode({ debugParam: "1" }) === "developer",
  "?debug=1 → developer",
);
assert(
  resolveAdminCardViewMode({ viewParam: "manager" }) === "manager",
  "?view=manager → manager",
);

const ravenous = resolveClerkRecommendation({
  reviewStatus: "v2_production_price_warning",
  productionMarketPrice: 49.99,
  offerPreview: {
    eligible: true,
    previewMarketValue: 7.91,
    marketDecision: { marketValue: 7.91, blockers: [] },
  } as never,
  staffTraining: {
    heading: "Why",
    paragraphs: [
      "The confirmed card is MAR #93.",
      "The old production price appears to match a different #18 printing.",
    ],
  },
});
assert(
  ravenous.title === "Needs manager review",
  "Ravenous recommendation title",
);
assert(
  ravenous.reasonLines.some((l) => l.includes("$7.91")),
  "Ravenous includes V2 value",
);
assert(
  needsProductionComparison({
    reviewStatus: "v2_production_price_warning",
    productionMarketPrice: 49.99,
    v2PreviewMarketPrice: 7.91,
  }),
  "Ravenous needs production comparison",
);
assert(showClerkWarningSection("v2_production_price_warning"), "Ravenous shows warning");

const grusha = resolveClerkRecommendation({
  reviewStatus: "v2_staff_confirmed_ready",
  offerPreview: {
    eligible: true,
    previewMarketValue: 0.125,
    recommendedAction: "staff_confirmed_preview_ready",
    marketDecision: {
      marketValue: 0.125,
      confidence: "low",
      blockers: ["ebay_sold_unavailable"],
    },
  } as never,
});
assert(grusha.title === "Ready low confidence", "Grusha ready low confidence");
assert(
  !needsProductionComparison({
    reviewStatus: "v2_staff_confirmed_ready",
    productionMarketPrice: 0.13,
    v2PreviewMarketPrice: 0.125,
  }),
  "Grusha hides production comparison",
);

const morgan = resolveClerkRecommendation({
  reviewStatus: "v2_source_disagreement",
  offerPreview: {
    eligible: false,
    marketDecision: {
      blockers: ["source_disagreement"],
      explanation: "Sources disagree",
    },
  } as never,
  staffTraining: {
    heading: "Why",
    paragraphs: [
      "Two pricing sources disagree too much.",
      "Disagreeing sources: holofoil: $49.93; Ungraded: $18.48.",
    ],
  },
});
assert(morgan.title === "Needs manager review", "Morgan needs manager review");
assert(
  morgan.reasonLines.some((l) => l.toLowerCase().includes("disagree")),
  "Morgan disagreement reason",
);

assert(
  clerkRecommendationShortTitle(ravenous) === "Needs manager review",
  "short title for queue",
);

{
  const staleCard = {
    id: "stale-1",
    detectedName: "Flareon VMAX",
    conditionEstimate: "NM",
    conditionReport: { estimatedGrade: "9.0", gradeRange: "8-10" },
    resaleAnalysis: {
      summary:
        "The Charizard V from the SWSH Black Star Promos set has a market estimate of $6.",
      salesFrequency: "medium",
      liquidityNotes: "Sales frequency is medium.",
      risks: ["Store policy prohibits buying cards under $10."],
    },
  } as unknown as ScannedCard;

  assert(
    resaleAnalysisLikelyStale(staleCard, 55.91) === true,
    "stale buyback when name/price mismatch",
  );

  const insight = buildClerkCardInsightLines(staleCard, {
    v2Market: 55.91,
    includeCondition: false,
  });
  assert(insight.staleBuybackReport === true, "flags stale buyback report");
  assert(
    insight.lines.every((l) => !l.toLowerCase().includes("charizard")),
    "stale Charizard narrative suppressed",
  );

  assert(
    formatStoreCondition({
      ...staleCard,
      conditionEstimate: "NM",
    } as ScannedCard)?.includes("NM") === true,
    "formatStoreCondition includes store grade",
  );

  const mismatchCard = {
    id: "mismatch-1",
    marketPrice: 5,
    cashOffer: 2.5,
    tradeOffer: 3.25,
    cardFlowV2OfferPreview: {
      previewMarketValue: 55.91,
      previewCashOffer: 27.95,
      previewTradeOffer: 36.34,
      marketDecision: { marketValue: 55.91, basis: "tcgplayer_pricecharting_blend" },
    },
  } as unknown as ScannedCard;

  const display = resolveClerkDisplayOffers({
    card: mismatchCard,
    offerPreview: mismatchCard.cardFlowV2OfferPreview,
    versionConfirmed: true,
  });
  assert(display.market === 55.91, "clerk display uses V2 market when confirmed");
  assert(display.cash === 27.95, "clerk display uses V2 cash when confirmed");
  assert(display.storedOfferMismatch === true, "flags stored offer mismatch");
  assert(
    clerkShouldShowStoredOfferMismatch({
      storedOfferMismatch: true,
      versionConfirmed: true,
      reviewStatus: "v2_staff_confirmed_ready",
    }) === false,
    "hides stored mismatch when V2 ready",
  );
  assert(
    clerkShouldShowStaleBuybackWarning({
      card: staleCard,
      v2Market: 55.91,
      versionConfirmed: true,
      reviewStatus: "v2_staff_confirmed_ready",
    }) === false,
    "hides stale buyback banner when V2 ready",
  );
  const readyInsight = buildClerkCardInsightLines(staleCard, {
    v2Market: 55.91,
    includeCondition: false,
    versionConfirmed: true,
    reviewStatus: "v2_staff_confirmed_ready",
  });
  assert(
    readyInsight.staleBuybackReport === false,
    "no stale buyback flag when V2 authoritative",
  );

  const charizardPass = {
    id: "charizard-pass",
    status: "do_not_buy",
    resaleAnalysis: { recommendation: "pass" as const },
    cardFlowV2Identity: { staffSelection: { suspectId: "swsh260" } },
  } as unknown as ScannedCard;
  assert(
    effectiveClerkCardDecision(charizardPass, "v2_staff_confirmed_ready") === "yes",
    "V2 ready overrides stale V1 pass / do_not_buy",
  );

  assert(
    effectiveClerkCardDecision(
      charizardPass,
      "v2_staff_confirmed_ready",
      true,
    ) === "no",
    "store rule block overrides V2 ready",
  );
}

{
  const underTenRule = {
    title: "under 10 dollars",
    active: true,
    priority: 10,
    appliesToCategories: ["Pokémon"],
    ruleType: "do_not_buy",
    ruleText: "not accepting any card with a value under 10 dollars",
  } as unknown as import("../src/lib/types").StoreRule;

  const yesCard = {
    id: "charizard",
    category: "pokemon",
    marketPrice: 55.91,
    cashOffer: 27.95,
    tradeOffer: 36.34,
    status: "processed",
    cardFlowV2Identity: { staffSelection: { suspectId: "swsh260" } },
    cardFlowV2OfferPreview: {
      previewMarketValue: 55.91,
      eligible: true,
      recommendedAction: "staff_confirmed_preview_ready",
    },
  } as unknown as ScannedCard;

  const noCard = {
    id: "cinderace",
    category: "pokemon",
    marketPrice: 2.24,
    cashOffer: 1.12,
    tradeOffer: 1.45,
    status: "processed",
    cardFlowV2Identity: { staffSelection: { suspectId: "sf-19" } },
    cardFlowV2OfferPreview: {
      previewMarketValue: 2.24,
      eligible: true,
      recommendedAction: "staff_confirmed_preview_ready",
    },
  } as unknown as ScannedCard;

  const totals = computeProductionOrderRunningTotals(
    [yesCard, noCard],
    [underTenRule],
  );
  assert(totals.includedCount === 1, "running total counts clerk-yes cards only");
  assert(
    Math.abs(totals.cash - 27.95) < 0.01,
    "running total uses production cash offers",
  );
}

console.log(`\n006O clerk workflow: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
