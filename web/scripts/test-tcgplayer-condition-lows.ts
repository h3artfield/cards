/**
 * Per-condition TCG lowest listing pricing.
 * Run: npx tsx scripts/test-tcgplayer-condition-lows.ts
 */
process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
process.env.CARD_FLOW_V2_AUDIT_ENABLED = "true";
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";

import { buildMarketValueDecision } from "../src/lib/card-flow-v2/offer/market-value-decision";
import { buildV2OfferPreview } from "../src/lib/card-flow-v2/offer/v2-offer-preview";
import { refreshCardV2PreviewAfterStaffEdit } from "../src/lib/card-flow-v2/refresh-card-after-staff-edit";
import { buildTcgConditionLadder } from "../src/lib/card-flow-v2/market/tcg-condition-pricing";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";
import type { ScannedCard } from "../src/lib/types";
import type { CardCandidateBundle } from "../src/lib/card-flow-v2/types";

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

const settings = {
  id: "test",
  ...DEFAULT_STORE_SETTINGS,
};

const identity: CardCandidateBundle = {
  category: "pokemon",
  suspects: [],
  suspectAssessments: [],
  staffSelection: {
    suspectId: "pokemon:test",
    confirmedAt: new Date().toISOString(),
    confirmedBy: "staff@test.com",
  },
  lockedIdentity: {
    locked: true,
    lockStatus: "locked",
    confidence: 0.9,
    category: "pokemon",
    variantTags: [],
    requiredEvidenceSatisfied: true,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    staffMessage: "ok",
  },
  candidateGenerationNotes: [],
  createdAt: new Date().toISOString(),
};

function marketWithConditionLows() {
  return {
    mode: "staff_confirmed_identity_market" as const,
    selectedSuspectId: "pokemon:test",
    snapshots: [
      {
        suspectId: "pokemon:test",
        lockedIdentityUsed: true,
        marketProductName: "Professor Sada",
        searchPlan: {
          planId: "p",
          lockedIdentityUsed: true,
          category: "pokemon" as const,
          marketProductName: "Professor Sada",
          gradeContext: "raw" as const,
          exactQueries: [],
          narrowQueries: [],
          broadQueries: [],
          requiredTerms: [],
          forbiddenTerms: [],
          queryExclusionTerms: [],
          warnings: [],
        },
        rawComps: [],
        compAssessments: [],
        acceptedComps: [],
        rejectedComps: [],
        maybeComps: [],
        confidence: "medium" as const,
        pricingMethod: "price_signal_only_tcgplayer",
        warnings: [],
        tcgplayerMapping: {
          attempted: true,
          productId: "528517",
          availableVariantNames: ["normal"],
          variantsFound: ["normal"],
          selectedVariantName: "normal",
          finishMatched: "normal",
          lowPrice: 0.8,
          marketPrice: 0.8,
          conditionLowPrices: {
            NM: 0.8,
            LP: 1.9,
            MP: 1.5,
            HP: 0.5,
          },
          conditionLowPrinting: "Unlimited",
        },
        marketOutcome: {
          pricingSignals: 1,
          pricingSignalDetails: [],
          soldCompsAccepted: 0,
          soldCompsRejected: 0,
          activeCompsMaybe: 0,
          sourcesAttempted: 1,
          sourcesWithResults: 1,
        },
        sourceHealth: [],
        queryAudits: [],
      },
    ],
    createdAt: new Date().toISOString(),
    recommendedStaffAction: "",
    warnings: [],
  };
}

console.log("\nTCG per-condition lowest listing pricing\n");

const market = marketWithConditionLows();

const lpDecision = buildMarketValueDecision({
  identity,
  market,
  itemType: "raw",
  condition: "LP",
});
assert(lpDecision.marketValue === 1.9, "LP market uses TCG LP lowest listing");
assert(lpDecision.tcgConditionApplied === "LP", "LP decision marks tcg condition");

const nmDecision = buildMarketValueDecision({
  identity,
  market,
  itemType: "raw",
  condition: "NM",
});
assert(nmDecision.marketValue === 0.8, "NM market uses TCG NM lowest listing");

const lpPreview = buildV2OfferPreview({
  card: {
    id: "c1",
    orderId: "o1",
    frontImageUrl: "https://example.com/f.jpg",
    backImageUrl: "",
    itemType: "raw",
    status: "manual_review",
    conditionEstimate: "LP",
    marketPrice: 0.8,
    cashOffer: 0.4,
    tradeOffer: 0.52,
    createdAt: new Date().toISOString(),
  },
  decision: lpDecision,
  settings,
  rules: [],
  identity,
  market,
});
assert(
  lpPreview.previewMarketValue === 1.9,
  "LP preview market skips store multiplier",
);
assert(
  Math.abs((lpPreview.previewCashOffer ?? 0) - 1.9 * settings.defaultCashPercent) < 0.01,
  "LP cash derived from TCG LP market",
);

const ladder = buildTcgConditionLadder({
  conditionLowPrices: market.snapshots[0]!.tcgplayerMapping!.conditionLowPrices!,
  cashPercent: settings.defaultCashPercent,
  tradePercent: settings.defaultTradePercent,
  settings,
  estimatedCondition: "LP",
});
assert(ladder.find((r) => r.condition === "LP")?.marketValue === 1.9, "TCG ladder LP row");

const lpCard: ScannedCard = {
  id: "c1",
  orderId: "o1",
  frontImageUrl: "https://example.com/f.jpg",
  backImageUrl: "",
  itemType: "raw",
  status: "manual_review",
  conditionEstimate: "LP",
  marketPrice: lpPreview.previewMarketValue ?? 0,
  cashOffer: lpPreview.previewCashOffer ?? 0,
  tradeOffer: lpPreview.previewTradeOffer ?? 0,
  createdAt: new Date().toISOString(),
  cardFlowV2Identity: identity,
  cardFlowV2Market: market,
  cardFlowV2OfferPreview: lpPreview,
  visionJson: {
    category: "pokemon",
    itemType: "raw",
    cardName: "Test",
    conditionEstimate: "LP",
    confidence: 0.9,
  },
  pricingJson: { marketPrice: 0.8, source: "test" },
};

const nmCard = refreshCardV2PreviewAfterStaffEdit({
  card: {
    ...lpCard,
    conditionEstimate: "NM",
    conditionOverride: {
      condition: "NM",
      previousCondition: "LP",
      changedByName: "Staff",
      changedAt: new Date().toISOString(),
    },
    visionJson: {
      ...(lpCard.visionJson as object),
      conditionEstimate: "NM",
    },
  },
  settings,
  rules: [],
});

assert(
  nmCard.cardFlowV2OfferPreview?.previewMarketValue === 0.8,
  "NM refresh uses TCG NM low not LP",
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
