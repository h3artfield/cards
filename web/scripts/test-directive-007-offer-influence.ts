/**
 * Directive 007 — V2 offer influence (production ownership).
 * Run: npm run test:directive-007-offer-influence
 */
import {
  applyV2OfferInfluenceToCard,
  canApplyV2OfferInfluence,
} from "../src/lib/card-flow-v2/offer/apply-v2-offer-influence";
import type { ScannedCard } from "../src/lib/types";
import type { V2OfferPreview } from "../src/lib/card-flow-v2/offer/types";

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

process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
process.env.CARD_FLOW_V2_AUDIT_ENABLED = "true";
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";
process.env.CARD_FLOW_V2_OFFER_INFLUENCE = "true";

function ravenousPreview(): V2OfferPreview {
  return {
    enabled: true,
    eligible: true,
    previewMarketValue: 7.91,
    previewCashOffer: 3.96,
    previewTradeOffer: 5.14,
    recommendedAction: "staff_review_required",
    identityBasis: "staff_confirmed",
    variantUncertaintyStatus: "resolved_by_staff_confirmation",
    marketDecision: {
      usableForOfferPreview: true,
      basis: "scryfall_print_price",
      marketValue: 7.91,
      confidence: "low",
      blockers: ["ebay_sold_unavailable"],
      warnings: [],
      sourceValues: [],
      explanation: "Scryfall exact print",
    },
    createdAt: new Date().toISOString(),
  };
}

function morganPreview(): V2OfferPreview {
  return {
    enabled: true,
    eligible: false,
    recommendedAction: "staff_review_required",
    identityBasis: "staff_confirmed",
    marketDecision: {
      usableForOfferPreview: false,
      basis: "none",
      confidence: "none",
      blockers: ["source_disagreement", "no_market_data"],
      warnings: [],
      sourceValues: [],
      explanation: "Sources disagree",
    },
    createdAt: new Date().toISOString(),
  };
}

function baseCard(overrides: Partial<ScannedCard> = {}): ScannedCard {
  return {
    id: "test",
    orderId: "order",
    frontImageUrl: "https://example.com/f.jpg",
    backImageUrl: "",
    itemType: "raw",
    createdAt: new Date().toISOString(),
    marketPrice: 49.99,
    cashOffer: 25,
    tradeOffer: 32.49,
    status: "approved",
    ...overrides,
  } as ScannedCard;
}

console.log("Directive 007 — V2 offer influence\n");

assert(canApplyV2OfferInfluence(ravenousPreview()), "Ravenous eligible for influence");

const ravenousResult = applyV2OfferInfluenceToCard(
  baseCard({ cardFlowV2OfferPreview: ravenousPreview() }),
);
assert(ravenousResult.applied, "Ravenous influence applied");
assert(ravenousResult.card.marketPrice === 7.91, "Ravenous market → 7.91");
assert(ravenousResult.card.cashOffer === 3.96, "Ravenous cash → 3.96");
assert(ravenousResult.card.status === "manual_review", "Ravenous → manual_review");
assert(
  (ravenousResult.card.pricingJson as { source?: string }).source ===
    "v2_offer_influence",
  "pricingJson source tagged",
);

assert(!canApplyV2OfferInfluence(morganPreview()), "Morgan blocked — source disagreement");
const morganResult = applyV2OfferInfluenceToCard(
  baseCard({
    marketPrice: 0,
    cashOffer: 0,
    tradeOffer: 0,
    cardFlowV2OfferPreview: morganPreview(),
  }),
);
assert(!morganResult.applied, "Morgan influence not applied");
assert(morganResult.card.marketPrice === 0, "Morgan production unchanged");

const stalePass = applyV2OfferInfluenceToCard(
  baseCard({
    status: "do_not_buy",
    marketPrice: 5,
    cashOffer: 2.5,
    cardFlowV2OfferPreview: {
      ...ravenousPreview(),
      previewMarketValue: 55.91,
      previewCashOffer: 27.95,
      previewTradeOffer: 36.34,
      recommendedAction: "staff_confirmed_preview_ready",
      marketDecision: {
        ...ravenousPreview().marketDecision,
        marketValue: 55.91,
      },
    },
  }),
);
assert(stalePass.applied, "stale do_not_buy card gets influence");
assert(stalePass.card.status === "processed", "clears stale V1 do_not_buy when V2 has offers");
assert(stalePass.card.marketPrice === 55.91, "stale pass market updated");

process.env.CARD_FLOW_V2_OFFER_INFLUENCE = "false";
assert(!canApplyV2OfferInfluence(ravenousPreview()), "disabled when flag off");

console.log(`\n007 offer influence: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
console.log(`  ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
