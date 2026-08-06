/**
 * Staff condition edit refreshes V2 offer preview.
 * Run: npx tsx scripts/test-staff-condition-v2-preview-refresh.ts
 */
process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
process.env.CARD_FLOW_V2_AUDIT_ENABLED = "true";
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";

import { refreshCardV2PreviewAfterStaffEdit } from "../src/lib/card-flow-v2/refresh-card-after-staff-edit";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";
import type { ScannedCard } from "../src/lib/types";
import type { CardCandidateBundle } from "../src/lib/card-flow-v2/types";
import { buildMarketValueDecision } from "../src/lib/card-flow-v2/offer/market-value-decision";
import { buildV2OfferPreview } from "../src/lib/card-flow-v2/offer/v2-offer-preview";

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
  conditionMultipliers: { NM: 1, LP: 0.85, MP: 0.7, HP: 0.5, DMG: 0.3 },
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

function marketBundle() {
  return {
    mode: "staff_confirmed_identity_market" as const,
    selectedSuspectId: "pokemon:test",
    snapshots: [
      {
        suspectId: "pokemon:test",
        lockedIdentityUsed: true,
        marketProductName: "Test",
        searchPlan: {
          planId: "p",
          lockedIdentityUsed: true,
          category: "pokemon" as const,
          marketProductName: "Test",
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
          availableVariantNames: ["normal"],
          variantsFound: ["normal"],
          lowPrice: 1,
          marketPrice: 1,
          selectedVariantName: "normal",
          conditionLowPrices: { NM: 1, LP: 0.85 },
        },
        marketOutcome: {
          pricingSignals: 1,
          pricingSignalDetails: [
            { source: "tcgplayer" as const, label: "normal (lowest listing)", price: 1 },
          ],
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

function baseCard(condition: "LP" | "NM"): ScannedCard {
  const market = marketBundle();
  const decision = buildMarketValueDecision({
    identity,
    market,
    itemType: "raw",
  });

  const preview = buildV2OfferPreview({
    card: {
      id: "c1",
      orderId: "o1",
      frontImageUrl: "https://example.com/f.jpg",
      backImageUrl: "",
      itemType: "raw",
      status: "manual_review",
      conditionEstimate: condition,
      marketPrice: condition === "NM" ? 1 : 0.85,
      cashOffer: condition === "NM" ? 0.5 : 0.43,
      tradeOffer: condition === "NM" ? 0.65 : 0.55,
      createdAt: new Date().toISOString(),
    },
    decision,
    settings,
    rules: [],
    identity,
  });

  return {
    id: "c1",
    orderId: "o1",
    frontImageUrl: "https://example.com/f.jpg",
    backImageUrl: "",
    itemType: "raw",
    status: "manual_review",
    conditionEstimate: condition,
    conditionOverride:
      condition === "NM"
        ? {
            condition: "NM",
            previousCondition: "LP",
            changedByName: "Staff",
            changedAt: new Date().toISOString(),
          }
        : undefined,
    marketPrice: preview.previewMarketValue ?? 0,
    cashOffer: preview.previewCashOffer ?? 0,
    tradeOffer: preview.previewTradeOffer ?? 0,
    createdAt: new Date().toISOString(),
    cardFlowV2Identity: identity,
    cardFlowV2Market: market,
    cardFlowV2OfferPreview: preview,
    visionJson: {
      category: "pokemon",
      itemType: "raw",
      cardName: "Test",
      conditionEstimate: condition,
      confidence: 0.9,
    },
    pricingJson: { marketPrice: 1, source: "test" },
  };
}

console.log("\nStaff condition edit — V2 preview refresh\n");

const lpCard = baseCard("LP");
const lpCash = lpCard.cardFlowV2OfferPreview?.previewCashOffer ?? 0;

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

const nmCash = nmCard.cardFlowV2OfferPreview?.previewCashOffer ?? 0;
assert(nmCash > lpCash, "NM cash offer higher than LP after preview refresh");
assert(
  nmCard.cardFlowV2OfferPreview?.previewMarketValue === 1,
  "NM market value uses full TCG base",
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
