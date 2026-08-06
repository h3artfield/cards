/**
 * Directive 006C — staff confirmation preservation tests.
 * Run: npm run test:staff-confirmation-preservation
 */
import {
  applyStaffConfirmationPreservation,
  fingerprintFromSuspect,
  normalizeFinishForRematch,
  rematchStaffConfirmedSuspect,
} from "../src/lib/card-flow-v2/staff-confirmation-preservation";
import { applyStaffSuspectSelection } from "../src/lib/card-flow-v2/staff-suspect-selection";
import { promoteStaffConfirmedMarket } from "../src/lib/card-flow-v2/market/promote-staff-confirmed-market";
import { stubMarketSnapshotDiagnostics } from "../src/lib/card-flow-v2/market/source-health";
import { buildMarketValueDecision } from "../src/lib/card-flow-v2/offer/market-value-decision";
import { assertPreviewDoesNotMutateProduction } from "../src/lib/card-flow-v2/offer/v2-offer-preview";
import type {
  CardCandidateBundle,
  CardSuspect,
  LockedCardIdentity,
} from "../src/lib/card-flow-v2/types";
import type {
  CandidateMarketSnapshot,
  CardFlowV2MarketBundle,
} from "../src/lib/card-flow-v2/market/types";
import type { ScannedCard } from "../src/lib/types";
import {
  buildMorganRegressionCard,
  buildCjStroudRegressionCard,
} from "../src/lib/card-flow-v2/regression/live-audit-fixtures";

process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
process.env.CARD_FLOW_V2_AUDIT_ENABLED = "true";
process.env.CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED = "true";
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";

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

const GRUSHA_REVERSE: CardSuspect = {
  suspectId: "pokemon_tcg:sv2-184:reverse_holo",
  category: "pokemon",
  label: "Grusha 184 reverse holo",
  catalogSource: "pokemon_tcg",
  catalogId: "sv2-184-reverse",
  canonicalName: "Grusha",
  setCode: "sv2",
  setName: "Paldea Evolved",
  collectorNumber: "184",
  finish: "reverse_holo",
  variantTags: ["reverse_holo"],
  expectedEvidence: [],
};

const GRUSHA_NORMAL: CardSuspect = {
  ...GRUSHA_REVERSE,
  suspectId: "pokemon_tcg:sv2-184:normal",
  label: "Grusha 184 normal",
  finish: "normal",
  variantTags: [],
};

function locked(overrides: Partial<LockedCardIdentity> = {}): LockedCardIdentity {
  return {
    locked: false,
    lockStatus: "not_locked_no_candidates",
    confidence: 0.5,
    category: "pokemon",
    canonicalName: "Grusha",
    variantTags: [],
    requiredEvidenceSatisfied: false,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    staffMessage: "test",
    ...overrides,
  };
}

function identityWithSuspects(
  suspects: CardSuspect[],
  staffSelection?: CardCandidateBundle["staffSelection"],
): CardCandidateBundle {
  return {
    category: "pokemon",
    suspects,
    suspectAssessments: [],
    lockedIdentity: locked(),
    staffSelection,
    candidateGenerationNotes: [],
    createdAt: new Date().toISOString(),
  };
}

function grushaSnapshot(suspectId: string): CandidateMarketSnapshot {
  const stub = stubMarketSnapshotDiagnostics(0);
  return {
    suspectId,
    lockedIdentityUsed: true,
    marketProductName: "Grusha reverse holo",
    searchPlan: {
      planId: "g1",
      suspectId,
      lockedIdentityUsed: true,
      category: "pokemon",
      marketProductName: "Grusha",
      gradeContext: "raw",
      identityFinish: "reverse_holo",
      exactQueries: [],
      narrowQueries: [],
      broadQueries: [],
      requiredTerms: ["Grusha"],
      forbiddenTerms: [],
      queryExclusionTerms: [],
      warnings: [],
    },
    rawComps: [],
    compAssessments: [],
    acceptedComps: [],
    rejectedComps: [],
    maybeComps: [],
    confidence: "medium",
    pricingMethod: "price_signal_blend_tcgplayer_pricecharting",
    warnings: [],
    valueMedian: 0.125,
    valueLow: 0.12,
    valueHigh: 0.13,
    tcgplayerMapping: {
      attempted: true,
      availableVariantNames: [],
      variantsFound: [],
      marketPrice: 0.13,
    },
    priceChartingMapping: {
      attempted: true,
      tierSelected: "Ungraded",
      tiersExcluded: [],
      loosePrice: 0.12,
      warnings: [],
    },
    ...stub,
    marketOutcome: {
      ...stub.marketOutcome,
      pricingSignals: 2,
      summaryLabel: "blend",
      pricingSignalDetails: [
        { source: "tcgplayer", label: "reverseHolofoil", price: 0.13 },
        { source: "pricecharting", label: "Ungraded", price: 0.12 },
      ],
    },
  };
}

function marketBundle(suspectId: string): CardFlowV2MarketBundle {
  return {
    mode: "candidate_market_comparison",
    lockedIdentityStatus: "not_locked_no_candidates",
    snapshots: [grushaSnapshot(suspectId), grushaSnapshot(GRUSHA_NORMAL.suspectId)],
    recommendedStaffAction: "",
    warnings: [],
    createdAt: new Date().toISOString(),
  };
}

const IMAGE = {
  frontImageUrl: "https://example.com/grusha-front.jpg",
  backImageUrl: "",
};

console.log("Staff confirmation preservation tests\n");

async function main() {
console.log("1. Rematch by fingerprint when suspectId changes");
const rematch = rematchStaffConfirmedSuspect({
  fingerprint: fingerprintFromSuspect(GRUSHA_REVERSE),
  suspects: [
    { ...GRUSHA_REVERSE, suspectId: "pokemon_tcg:sv2-184:reverseHolofoil_v2" },
  ],
  previousSuspectId: GRUSHA_REVERSE.suspectId,
});
assert(rematch.matchType === "fingerprint", "rematched by fingerprint");
assert(
  normalizeFinishForRematch("reverseHolofoil") === "reverse_holo",
  "finish normalization",
);

console.log("\n2. Staff confirmation survives reprocess (same suspect)");
const prevIdentity = applyStaffSuspectSelection(
  identityWithSuspects([GRUSHA_REVERSE, GRUSHA_NORMAL]),
  {
    suspectId: GRUSHA_REVERSE.suspectId,
    confirmedBy: "staff@test",
    imageRefs: IMAGE,
  },
);
const prevMarket = marketBundle(GRUSHA_REVERSE.suspectId);
const preserved = await applyStaffConfirmationPreservation({
  previousIdentity: prevIdentity,
  previousMarket: prevMarket,
  identity: identityWithSuspects([GRUSHA_REVERSE, GRUSHA_NORMAL]),
  market: marketBundle(GRUSHA_REVERSE.suspectId),
  imageRefs: IMAGE,
});
assert(
  preserved.identity?.staffSelection?.suspectId === GRUSHA_REVERSE.suspectId,
  "staff selection preserved",
);
assert(
  preserved.preservation.status === "preserved" ||
    preserved.preservation.status === "rematched",
  "preservation status ok",
);
assert(
  preserved.market?.mode === "staff_confirmed_identity_market",
  "market promoted to staff_confirmed",
);

console.log("\n3. Does not auto-switch reverse holo to normal");
const stale = await applyStaffConfirmationPreservation({
  previousIdentity: prevIdentity,
  identity: identityWithSuspects([GRUSHA_NORMAL]),
  market: marketBundle(GRUSHA_NORMAL.suspectId),
  imageRefs: IMAGE,
});
assert(
  stale.preservation.status === "stale_needs_review",
  "stale when only normal remains",
);

console.log("\n4. Image change marks stale_needs_review");
const imageChange = await applyStaffConfirmationPreservation({
  previousIdentity: prevIdentity,
  identity: identityWithSuspects([GRUSHA_REVERSE]),
  market: marketBundle(GRUSHA_REVERSE.suspectId),
  imageRefs: { frontImageUrl: "https://example.com/new-front.jpg", backImageUrl: "" },
});
assert(
  imageChange.preservation.status === "stale_needs_review",
  "image change stale",
);

console.log("\n5. Offer preview from preserved staff-confirmed identity");
const md = buildMarketValueDecision({
  identity: preserved.identity,
  market: preserved.market,
  itemType: "raw",
});
assert(md.usableForOfferPreview === true, "Grusha preview eligible after preserve");
assert(md.basis === "tcgplayer_pricecharting_blend", "blend basis");
assert(Math.abs((md.marketValue ?? 0) - 0.125) < 0.001, "market ~0.125");

console.log("\n6. Morgan live fixture blocks source_disagreement");
const morgan = buildMorganRegressionCard();
const morganMd = morgan.cardFlowV2OfferPreview!.marketDecision;
assert(morganMd.blockers.includes("source_disagreement"), "Morgan source_disagreement");
assert(morgan.cardFlowV2OfferPreview!.eligible === false, "Morgan not eligible");

console.log("\n7. CJ Stroud live fixture blocks sports/active");
const cj = buildCjStroudRegressionCard();
const cjMd = cj.cardFlowV2OfferPreview!.marketDecision;
assert(
  cjMd.blockers.includes("active_only") ||
    cjMd.blockers.includes("sports_parallel_uncertainty") ||
    cjMd.blockers.includes("no_market_data"),
  "CJ Stroud blocked",
);
assert(cj.cardFlowV2OfferPreview!.eligible === false, "CJ not eligible");

console.log("\n8. Production fields unchanged by preview");
const card: ScannedCard = {
  id: "c1",
  orderId: "o1",
  frontImageUrl: IMAGE.frontImageUrl,
  backImageUrl: "",
  itemType: "raw",
  status: "processed",
  marketPrice: 1,
  cashOffer: 0.5,
  tradeOffer: 0.65,
  createdAt: new Date().toISOString(),
};
const before = assertPreviewDoesNotMutateProduction(card);
assert(
  before.marketPrice === 1 && before.cashOffer === 0.5,
  "production unchanged",
);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
