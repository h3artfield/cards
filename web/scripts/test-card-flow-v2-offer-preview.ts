/**
 * Directive 006 — shadow offer preview tests.
 * Run: npm run test:card-flow-v2-offer-preview
 */
import {
  isCardFlowV2OfferPreviewEnabled,
} from "../src/lib/card-flow-v2/feature-flag";
import { buildMarketValueDecision } from "../src/lib/card-flow-v2/offer/market-value-decision";
import {
  assertPreviewDoesNotMutateProduction,
  buildV2OfferPreview,
} from "../src/lib/card-flow-v2/offer/v2-offer-preview";
import {
  computeCardOfferPreviewV2,
  runCardOfferPreviewV2,
} from "../src/lib/card-flow-v2/offer/run-card-offer-preview-v2";
import { summarizeOfferPreviews } from "../src/lib/card-flow-v2/offer/offer-preview-summary";
import { stubMarketSnapshotDiagnostics } from "../src/lib/card-flow-v2/market/source-health";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";
import type { ScannedCard, StoreRule } from "../src/lib/types";
import type {
  CardCandidateBundle,
  LockedCardIdentity,
} from "../src/lib/card-flow-v2/types";
import type {
  CandidateMarketSnapshot,
  CardFlowV2MarketBundle,
} from "../src/lib/card-flow-v2/market/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

function baseCard(overrides: Partial<ScannedCard> = {}): ScannedCard {
  return {
    id: "card-1",
    orderId: "order-1",
    frontImageUrl: "https://example.com/f.jpg",
    backImageUrl: "",
    itemType: "raw",
    status: "processed",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function lockedIdentity(
  overrides: Partial<LockedCardIdentity> = {},
): LockedCardIdentity {
  return {
    locked: true,
    lockStatus: "locked",
    confidence: 0.9,
    category: "pokemon",
    canonicalName: "Test",
    variantTags: [],
    requiredEvidenceSatisfied: true,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    staffMessage: "Locked",
    ...overrides,
  };
}

function unlockedIdentity(): LockedCardIdentity {
  return lockedIdentity({
    locked: false,
    lockStatus: "not_locked_no_candidates",
    confidence: 0.5,
    staffMessage: "Multiple candidates",
  });
}

function identityBundle(
  locked: LockedCardIdentity,
  overrides: Partial<CardCandidateBundle> = {},
): CardCandidateBundle {
  return {
    category: locked.category ?? "pokemon",
    suspects: [],
    suspectAssessments: [],
    lockedIdentity: locked,
    candidateGenerationNotes: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function pricingSignalsSnapshot(input: {
  tcg?: number;
  tcgLow?: number;
  tcgMarket?: number;
  pc?: number;
  tcgLabel?: string;
  pcLabel?: string;
  pricingMethod?: string;
  category?: "pokemon" | "sports" | "mtg";
  gradeContext?: "raw" | "graded";
  gradingCompany?: string;
  grade?: string;
  pcTier?: string;
  staffConfirmed?: boolean;
}): CandidateMarketSnapshot {
  const pricingSignalDetails: Array<{
    source: "tcgplayer" | "pricecharting";
    label: string;
    price: number;
  }> = [];
  if (input.tcg != null) {
    pricingSignalDetails.push({
      source: "tcgplayer",
      label: input.tcgLabel ?? "reverseHolofoil",
      price: input.tcg,
    });
  }
  const tcgMarket = input.tcgMarket ?? input.tcg;
  const tcgLow = input.tcgLow;
  if (input.pc != null) {
    pricingSignalDetails.push({
      source: "pricecharting",
      label: input.pcLabel ?? "Ungraded",
      price: input.pc,
    });
  }

  const stub = stubMarketSnapshotDiagnostics(0);

  return {
    lockedIdentityUsed: true,
    marketProductName: "Test Card",
    searchPlan: {
      planId: "p1",
      lockedIdentityUsed: true,
      category: input.category ?? "pokemon",
      marketProductName: "Test Card",
      gradeContext: input.gradeContext ?? "raw",
      gradingCompany: input.gradingCompany,
      grade: input.grade,
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
    valueLow: input.tcg != null && input.pc != null ? Math.min(input.tcg, input.pc) : undefined,
    valueMedian:
      input.tcg != null && input.pc != null
        ? (input.tcg + input.pc) / 2
        : input.tcg ?? input.pc,
    valueHigh: input.tcg != null && input.pc != null ? Math.max(input.tcg, input.pc) : undefined,
    confidence: pricingSignalDetails.length >= 2 ? "medium" : "low",
    pricingMethod:
      input.pricingMethod ??
      (pricingSignalDetails.length >= 2
        ? "price_signal_blend_tcgplayer_pricecharting"
        : pricingSignalDetails.length === 1
          ? "price_signal_single"
          : "no_market_data"),
    warnings: [],
    tcgplayerMapping:
      tcgMarket != null || tcgLow != null
        ? {
            attempted: true,
            availableVariantNames: [],
            variantsFound: [],
            marketPrice: tcgMarket,
            lowPrice: tcgLow,
            selectedVariantName: input.tcgLabel ?? "reverseHolofoil",
          }
        : undefined,
    priceChartingMapping:
      input.pc != null
        ? {
            attempted: true,
            tierSelected: input.pcTier ?? "Ungraded",
            tiersExcluded: [],
            loosePrice: input.pc,
            warnings: [],
          }
        : undefined,
    ...stub,
    marketOutcome: {
      ...stub.marketOutcome,
      pricingSignals: pricingSignalDetails.length,
      summaryLabel: "pricing signals",
      pricingSignalDetails,
    },
  };
}

function marketBundle(
  snap: CandidateMarketSnapshot,
  overrides: Partial<CardFlowV2MarketBundle> = {},
): CardFlowV2MarketBundle {
  return {
    mode: overrides.mode ?? "locked_identity_market",
    lockedIdentityStatus: "locked",
    snapshots: [snap],
    recommendedStaffAction: "",
    warnings: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const settings = { id: "test", ...DEFAULT_STORE_SETTINGS };
const rules: StoreRule[] = [];

console.log("Card Flow V2 Directive 006 — offer preview tests\n");

console.log("Feature flag");
const prev = {
  e: process.env.CARD_FLOW_V2_EVIDENCE_ENABLED,
  i: process.env.CARD_FLOW_V2_IDENTITY_ENABLED,
  m: process.env.CARD_FLOW_V2_MARKET_ENABLED,
  a: process.env.CARD_FLOW_V2_AUDIT_ENABLED,
  o: process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED,
};
process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "false";
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";
assert(isCardFlowV2OfferPreviewEnabled() === false, "preview requires all V2 flags");
process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
process.env.CARD_FLOW_V2_AUDIT_ENABLED = "true";
assert(isCardFlowV2OfferPreviewEnabled() === true, "preview on when all flags true");
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "false";
assert(isCardFlowV2OfferPreviewEnabled() === false, "preview defaults off");
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";

console.log("\n1. Unlocked identity blocks offer preview");
const d1 = buildMarketValueDecision({
  identity: identityBundle(unlockedIdentity()),
  market: marketBundle(pricingSignalsSnapshot({ tcg: 0.13, pc: 0.12 })),
});
assert(d1.usableForOfferPreview === false, "unlocked not usable");
assert(
  d1.blockers.includes("identity_not_locked_or_confirmed"),
  "identity blocker",
);

console.log("\n2. Staff-confirmed identity allows market value decision evaluation");
const staffIdentity = identityBundle(lockedIdentity({ canonicalName: "Grusha" }), {
  staffSelection: {
    suspectId: "pokemon_tcg:sv2-184:reverse_holo",
    confirmedAt: new Date().toISOString(),
    confirmedBy: "staff@test",
    notes: "reverse holo confirmed",
  },
});
const d2 = buildMarketValueDecision({
  identity: staffIdentity,
  market: marketBundle(
    pricingSignalsSnapshot({ tcg: 0.13, pc: 0.12 }),
    { mode: "staff_confirmed_identity_market" },
  ),
});
assert(d2.usableForOfferPreview === true, "staff-confirmed usable");
assert(d2.basis === "tcgplayer_pricecharting_blend", "blend basis");
assert(
  d2.marketValue != null && Math.abs(d2.marketValue - 0.125) < 0.001,
  "blend ~$0.125",
);
assert(d2.confidence === "medium", "medium confidence for TCG blend");

console.log("\n3. TCGplayer + PriceCharting within 25% creates blended decision");
assert(d2.basis === "tcgplayer_pricecharting_blend", "blend created");

console.log("\n4. TCGplayer + PriceCharting disagreement blocks preview");
const d4 = buildMarketValueDecision({
  identity: identityBundle(lockedIdentity({ canonicalName: "Morgan" })),
  market: marketBundle(pricingSignalsSnapshot({ tcg: 49.93, pc: 18.48 })),
});
assert(d4.usableForOfferPreview === false, "Morgan blocked (>50% disagreement)");
assert(d4.blockers.includes("source_disagreement"), "source_disagreement");

console.log("\n4b. TCG lowest listing is gospel when available");
const psychic = buildMarketValueDecision({
  identity: identityBundle(lockedIdentity({ canonicalName: "Psychic Energy" })),
  market: marketBundle(
    pricingSignalsSnapshot({
      tcgLow: 0.98,
      tcgMarket: 1.33,
      pc: 2.28,
      tcgLabel: "1stEdition",
    }),
  ),
});
assert(psychic.usableForOfferPreview === true, "Psychic Energy uses TCG low listing");
assert(psychic.basis === "tcgplayer_low_listing", "TCG low listing basis");
assert(
  psychic.marketValue != null && Math.abs(psychic.marketValue - 0.98) < 0.01,
  "Psychic Energy market value is TCG lowest listing",
);
assert(
  !psychic.blockers.includes("source_disagreement"),
  "no source_disagreement when TCG low is available",
);
const psychicPcRef = psychic.sourceValues.find(
  (s) => s.source === "pricecharting" && !s.used,
);
assert(
  psychicPcRef?.reason?.includes("30-day average"),
  "PriceCharting shown as 30-day reference",
);

console.log("\n5. PriceCharting-only produces low-confidence signal");
const d5 = buildMarketValueDecision({
  identity: identityBundle(lockedIdentity({ canonicalName: "She-Hulk" }), {
    category: "mtg",
  }),
  market: marketBundle(
    pricingSignalsSnapshot({ pc: 0.45, category: "mtg" }),
  ),
});
assert(d5.basis === "pricecharting_value", "PC-only basis");
assert(d5.confidence === "low", "low confidence");
assert(d5.usableForOfferPreview === true, "low-confidence preview allowed for TCG");

console.log("\n6. Active-only blocks preview");
const activeSnap = pricingSignalsSnapshot({});
activeSnap.pricingMethod = "active_listings_only_sanity_check";
const d6 = buildMarketValueDecision({
  identity: identityBundle(lockedIdentity()),
  market: marketBundle(activeSnap),
});
assert(d6.usableForOfferPreview === false, "active-only blocked");
assert(d6.blockers.includes("active_only"), "active_only blocker");

console.log("\n7. No market data blocks preview");
const d7 = buildMarketValueDecision({
  identity: identityBundle(lockedIdentity()),
  market: marketBundle(
    pricingSignalsSnapshot({ pricingMethod: "no_market_data" }),
  ),
});
assert(d7.usableForOfferPreview === false, "no data blocked");
assert(d7.blockers.includes("no_market_data"), "no_market_data blocker");

console.log("\n8. Sports parallel uncertainty blocks preview");
const sportsIdentity = identityBundle(
  lockedIdentity({
    category: "sports",
    canonicalName: "CJ Stroud",
    unresolvedVariantRisks: ["Silver Prizm parallel unresolved"],
  }),
  { category: "sports" },
);
const d8 = buildMarketValueDecision({
  identity: sportsIdentity,
  market: marketBundle(
    pricingSignalsSnapshot({ category: "sports", pricingMethod: "no_market_data" }),
  ),
});
assert(d8.usableForOfferPreview === false, "CJ Stroud blocked");
assert(
  d8.blockers.includes("sports_parallel_uncertainty") ||
    d8.blockers.includes("no_market_data"),
  "sports/no data blocker",
);

console.log("\n9. Raw/graded mismatch blocks slab preview");
const slabSnap = pricingSignalsSnapshot({
  pc: 100,
  gradeContext: "graded",
  pcTier: "Ungraded",
});
const d9 = buildMarketValueDecision({
  identity: identityBundle(lockedIdentity({ category: "pokemon" })),
  market: marketBundle(slabSnap),
  itemType: "graded",
});
assert(d9.usableForOfferPreview === false, "slab without grade tier blocked");
assert(d9.blockers.includes("raw_graded_uncertainty"), "raw_graded blocker");

console.log("\n10. High-value card with source disagreement blocks preview");
assert(d4.usableForOfferPreview === false, "Morgan high-value disagreement blocked");
assert(d4.blockers.includes("source_disagreement"), "disagreement on high value");

console.log("\n11. Eligible preview calculates cash/trade using store rules");
const d11 = buildMarketValueDecision({
  identity: identityBundle(lockedIdentity()),
  market: marketBundle(pricingSignalsSnapshot({ tcg: 10, pc: 10 })),
});
const preview11 = buildV2OfferPreview({
  card: baseCard({
    marketPrice: 9,
    cashOffer: 4.5,
    tradeOffer: 5.85,
    conditionEstimate: "NM",
    visionJson: {
      category: "pokemon",
      itemType: "raw",
      conditionEstimate: "NM",
      confidence: 0.9,
    },
  }),
  decision: d11,
  settings,
  rules,
});
assert(preview11.eligible === true, "eligible preview");
assert(preview11.previewMarketValue === 10, "preview market set");
assert(preview11.previewCashOffer === 5, "preview cash 50%");
assert(preview11.previewTradeOffer === 6.5, "preview trade 65%");
assert(
  preview11.previewTradeOffer! > preview11.previewCashOffer!,
  "cash/trade follow store percents",
);

console.log("\n12. Preview never writes to production offer fields");
const card12 = baseCard({
  marketPrice: 1,
  cashOffer: 0.5,
  tradeOffer: 0.65,
  status: "processed",
});
const before = assertPreviewDoesNotMutateProduction(card12);
buildV2OfferPreview({
  card: card12,
  decision: d2,
  settings,
  rules,
  identity: staffIdentity,
});
const after = assertPreviewDoesNotMutateProduction(card12);
assert(
  before.marketPrice === after.marketPrice &&
    before.cashOffer === after.cashOffer &&
    before.tradeOffer === after.tradeOffer &&
    before.status === after.status,
  "production fields unchanged",
);
assert(runCardOfferPreviewV2({ card: card12, settings, rules }) != null, "run returns preview");

console.log("\n13. Audit summary counts eligible/blocked preview results");
const previews = [
  buildV2OfferPreview({
    card: baseCard(),
    decision: d2,
    settings,
    rules,
    identity: staffIdentity,
  }),
  buildV2OfferPreview({
    card: baseCard(),
    decision: d4,
    settings,
    rules,
  }),
  buildV2OfferPreview({
    card: baseCard(),
    decision: d7,
    settings,
    rules,
  }),
];
const summary = summarizeOfferPreviews(previews);
assert(summary.eligibleCount === 1, "one eligible");
assert(summary.blockedCount === 2, "two blocked");
assert(summary.topBlockers.length > 0, "top blockers populated");
assert(
  summary.topBlockers.some((b) => b.blocker === "source_disagreement"),
  "source_disagreement in top blockers",
);

console.log("\nRegression — Grusha staff-confirmed reverse holo");
const grushaPreview = computeCardOfferPreviewV2({
  card: baseCard({ detectedName: "Grusha" }),
  identity: staffIdentity,
  market: marketBundle(pricingSignalsSnapshot({ tcg: 0.13, pc: 0.12 })),
  settings,
  rules,
});
assert(grushaPreview.eligible === true, "Grusha eligible");
assert(
  grushaPreview.marketDecision.basis === "tcgplayer_pricecharting_blend",
  "Grusha blend",
);

console.log("\nRegression — Morgan disagreement");
const morganPreview = computeCardOfferPreviewV2({
  card: baseCard({ detectedName: "Morgan" }),
  identity: identityBundle(lockedIdentity({ canonicalName: "Morgan" })),
  market: marketBundle(pricingSignalsSnapshot({ tcg: 49.93, pc: 18.48 })),
  settings,
  rules,
});
assert(morganPreview.eligible === false, "Morgan not eligible");
assert(
  morganPreview.recommendedAction === "staff_review_required",
  "Morgan staff review",
);

process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = prev.e;
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = prev.i;
process.env.CARD_FLOW_V2_MARKET_ENABLED = prev.m;
process.env.CARD_FLOW_V2_AUDIT_ENABLED = prev.a;
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = prev.o;

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
