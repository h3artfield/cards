/**
 * V2 offer reason builder tests.
 * Run: npm run test:v2-offer-reason
 */
import { buildV2OfferReason } from "../src/lib/card-flow-v2/v2-offer-reason";
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

const card: ScannedCard = {
  id: "c1",
  orderId: "o1",
  frontImageUrl: "https://example.com/f.jpg",
  backImageUrl: "",
  itemType: "raw",
  status: "manual_review",
  detectedName: "Ravenous Tyrannosaurus",
  marketPrice: 7.57,
  cashOffer: 3.79,
  tradeOffer: 4.92,
  pricingJson: { source: "v2_offer_influence" },
  createdAt: new Date().toISOString(),
  cardFlowV2OfferPreview: {
    enabled: true,
    eligible: true,
    previewMarketValue: 7.57,
    previewCashOffer: 3.79,
    previewTradeOffer: 4.92,
    pricingRuleApplied: "default 50% cash / 65% trade",
    recommendedAction: "eligible_for_future_guarded_offer",
    marketDecision: {
      usableForOfferPreview: true,
      basis: "scryfall_print_price",
      marketValue: 7.57,
      confidence: "high",
      blockers: [],
      warnings: [],
      sourceValues: [
        {
          source: "scryfall_print_price",
          label: "Scryfall print",
          value: 7.57,
          used: true,
        },
      ],
      explanation: "Using exact Scryfall print price for this locked printing.",
    },
    createdAt: new Date().toISOString(),
  },
};

console.log("V2 offer reason tests\n");

const reason = buildV2OfferReason({ card, offerPreview: card.cardFlowV2OfferPreview });
assert(reason != null, "builds reason");
assert(reason!.heading === "Why we offered this price", "production heading");
assert(reason!.marketSource === "Scryfall", "Scryfall source label");
assert(reason!.cashOffer === 3.79, "cash offer");
assert(reason!.summary.includes("Scryfall"), "summary mentions basis");
assert(!reason!.summary.includes("V1"), "no V1 reference");
assert(reason!.isProductionOffer === true, "V2 production flag");

const blocked = buildV2OfferReason({
  card: { ...card, marketPrice: 49.99, cashOffer: 25 },
  offerPreview: {
    ...card.cardFlowV2OfferPreview!,
    eligible: false,
    marketDecision: {
      ...card.cardFlowV2OfferPreview!.marketDecision,
      usableForOfferPreview: false,
      blockers: ["source_disagreement"],
      sourceValues: [
        { source: "tcgplayer", label: "TCGplayer", value: 8, used: false },
        { source: "pricecharting", label: "PriceCharting", value: 49, used: false },
      ],
      explanation: "Sources disagree beyond safe threshold.",
    },
  },
  reviewStatus: "v2_source_disagreement",
});
assert(blocked?.blocked === true, "blocked when disagreement");
assert(blocked?.heading === "Why pricing needs review", "blocked heading");
assert(
  Boolean(
    blocked?.paragraphs.some(
      (p) => p.includes("disagree") || p.includes("Disagree"),
    ),
  ),
  "disagreement explained",
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
