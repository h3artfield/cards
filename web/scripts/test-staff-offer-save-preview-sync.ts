/**
 * Staff offer save refreshes V2 preview even when condition unchanged.
 * Run: npx tsx scripts/test-staff-offer-save-preview-sync.ts
 */
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";

import { applyStaffOfferEditToCard } from "../src/lib/card-flow-v2/apply-staff-offer-edit";
import { resolveClerkDisplayOffers } from "../src/lib/card-flow-v2/clerk-card-insights";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";
import type { ScannedCard } from "../src/lib/types";
import type { CardCandidateBundle } from "../src/lib/card-flow-v2/types";
import { buildV2OfferPreview } from "../src/lib/card-flow-v2/offer/v2-offer-preview";
import { buildMarketValueDecision } from "../src/lib/card-flow-v2/offer/market-value-decision";

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

const settings = { id: "test", ...DEFAULT_STORE_SETTINGS };

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

const market = {
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
        acceptedComps: [
          {
            comp: {
              source: "ebay_sold" as const,
              title: "Test sold",
              price: 1,
              queryUsed: "test",
            },
            assessment: {
              accepted: true,
              confidence: "medium" as const,
              reasons: [],
            },
          },
        ],
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
        conditionLowPrices: { NM: 2.37, LP: 1.9, MP: 1.5, HP: 0.5 },
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

const stalePreview = {
  ...buildV2OfferPreview({
    card: {
      id: "c1",
      orderId: "o1",
      frontImageUrl: "https://example.com/f.jpg",
      backImageUrl: "",
      itemType: "raw",
      status: "manual_review",
      conditionEstimate: "LP",
      marketPrice: 0.8,
      cashOffer: 0.48,
      tradeOffer: 0.56,
      createdAt: new Date().toISOString(),
    },
    decision: buildMarketValueDecision({
      identity,
      market,
      itemType: "raw",
      condition: "NM",
    }),
    settings,
    rules: [],
    identity,
    market,
  }),
  previewMarketValue: 0.8,
  previewCashOffer: 0.48,
  previewTradeOffer: 0.56,
};

const card: ScannedCard = {
  id: "c1",
  orderId: "o1",
  frontImageUrl: "https://example.com/f.jpg",
  backImageUrl: "",
  itemType: "raw",
  status: "manual_review",
  conditionEstimate: "LP",
  marketPrice: 0.8,
  cashOffer: 0.48,
  tradeOffer: 0.56,
  createdAt: new Date().toISOString(),
  cardFlowV2Identity: identity,
  cardFlowV2Market: market,
  cardFlowV2OfferPreview: stalePreview,
  visionJson: {
    category: "pokemon",
    itemType: "raw",
    cardName: "Professor Sada",
    conditionEstimate: "LP",
    confidence: 0.9,
  },
  pricingJson: { marketPrice: 0.8, source: "test" },
};

console.log("\nStaff offer save — preview sync\n");

async function main() {
  const beforeDisplay = resolveClerkDisplayOffers({
    card,
    offerPreview: card.cardFlowV2OfferPreview,
    versionConfirmed: true,
  });
  assert(beforeDisplay.market === 1.9, "card face uses tcg LP low before save");

  const saved = await applyStaffOfferEditToCard({
    card,
    update: {
      marketPrice: 1.9,
      cashOffer: 1.14,
      tradeOffer: 1.33,
      conditionEstimate: "LP",
      lastStaffEdit: {
        changedByName: "Staff",
        changedAt: new Date().toISOString(),
      },
    },
    settings,
    rules: [],
  });

  assert(saved.marketPrice === 1.9, "saved card market matches LP tcg low");
  assert(
    saved.cardFlowV2OfferPreview?.previewMarketValue === 1.9,
    "preview refreshed to LP tcg low",
  );

  const afterDisplay = resolveClerkDisplayOffers({
    card: saved,
    offerPreview: saved.cardFlowV2OfferPreview,
    versionConfirmed: true,
  });
  assert(afterDisplay.market === 1.9, "clerk card face shows refreshed LP market");

  const nmDecision = buildMarketValueDecision({
    identity,
    market,
    itemType: "raw",
    condition: "NM",
  });
  assert(
    nmDecision.marketValue === 2.37,
    "TCG NM low beats eBay sold comps when both exist",
  );
  assert(nmDecision.basis === "tcgplayer_low_listing", "basis stays tcg low listing");

  const staleNmPreview = {
    ...stalePreview,
    previewMarketValue: 1,
    previewCashOffer: 0.6,
    previewTradeOffer: 0.7,
    marketDecision: {
      ...stalePreview.marketDecision,
      basis: "sold_comp_median" as const,
      marketValue: 1,
    },
  };

  const nmCard: ScannedCard = {
    ...card,
    conditionEstimate: "NM",
    conditionOverride: {
      condition: "NM",
      previousCondition: "LP",
      changedByName: "Staff",
      changedAt: new Date().toISOString(),
    },
    cardFlowV2OfferPreview: staleNmPreview,
  };

  const nmDisplay = resolveClerkDisplayOffers({
    card: nmCard,
    offerPreview: staleNmPreview,
    versionConfirmed: true,
  });
  assert(nmDisplay.market === 2.37, "card face uses tcg NM low not stale preview");

  const ladderOnlyCard: ScannedCard = {
    ...card,
    conditionEstimate: "NM",
    cardFlowV2Market: {
      ...market,
      snapshots: [
        {
          ...market.snapshots[0]!,
          tcgplayerMapping: {
            ...market.snapshots[0]!.tcgplayerMapping!,
            conditionLowPrices: undefined,
          },
        },
      ],
    },
    conditionLadder: [
      {
        condition: "NM",
        label: "Near Mint",
        multiplier: 1,
        marketValue: 2.37,
        cashOffer: 1.42,
        tradeOffer: 1.66,
        isEstimated: true,
      },
    ],
    cardFlowV2OfferPreview: staleNmPreview,
  };

  const ladderDisplay = resolveClerkDisplayOffers({
    card: ladderOnlyCard,
    offerPreview: staleNmPreview,
    versionConfirmed: true,
  });
  assert(
    ladderDisplay.market === 2.37,
    "card face uses condition ladder when tcg snapshot lows missing",
  );

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
