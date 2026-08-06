/**
 * Directive 006Q — Market Research Assist tests.
 * Run: npm run test:directive-006q-market-research
 */
import { buildMarketResearchAssist } from "../src/lib/card-flow-v2/market/market-research-queries";
import { shouldShowMarketResearchAssist } from "../src/lib/card-flow-v2/market/market-research-eligibility";
import { applyManualCompsToMarketBundle } from "../src/lib/card-flow-v2/market/manual-comp-snapshot";
import { refreshCardAfterManualComps } from "../src/lib/card-flow-v2/market/refresh-card-after-manual-comps";
import { createManualMarketComp } from "../src/lib/card-flow-v2/market/manual-market-comp";
import type { CandidateMarketSnapshot } from "../src/lib/card-flow-v2/market/types";
import type { ScannedCard } from "../src/lib/types";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";

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

const marSuspect = {
  suspectId: "scryfall:mar-93",
  category: "mtg" as const,
  label: "Ravenous Tyrannosaurus (mar) · 93",
  catalogSource: "scryfall" as const,
  canonicalName: "Ravenous Tyrannosaurus",
  setCode: "MAR",
  collectorNumber: "93",
  finish: "nonfoil",
  variantTags: [],
  expectedEvidence: [],
};

const baseSnapshot = {
  suspectId: "scryfall:mar-93",
  lockedIdentityUsed: true,
  marketProductName: "Ravenous Tyrannosaurus",
  searchPlan: {
    planId: "p1",
    suspectId: "scryfall:mar-93",
    lockedIdentityUsed: true,
    category: "mtg" as const,
    marketProductName: "Ravenous Tyrannosaurus",
    gradeContext: "raw" as const,
    exactQueries: [
      {
        query: '"Ravenous Tyrannosaurus" "MAR" "93"',
        purpose: "exact" as const,
        requiredTerms: ["Ravenous Tyrannosaurus", "MAR", "93"],
        forbiddenTerms: ["Jurassic", "foil", "PSA"],
        queryExclusionTerms: ["Jurassic", "foil", "PSA", "lot"],
        notes: [],
      },
    ],
    narrowQueries: [],
    broadQueries: [],
    requiredTerms: ["Ravenous Tyrannosaurus", "MAR", "93"],
    forbiddenTerms: ["Jurassic", "REX", "foil", "PSA", "lot"],
    queryExclusionTerms: ["Jurassic", "foil", "PSA", "lot"],
    warnings: [],
  },
  rawComps: [],
  compAssessments: [],
  acceptedComps: [],
  rejectedComps: [],
  maybeComps: [],
  confidence: "none" as const,
  pricingMethod: "active_listings_only_sanity_check",
  warnings: [],
  sourceHealth: [],
  queryAudits: [],
  marketOutcome: {
    pricingSignals: 0,
    pricingSignalDetails: [],
    soldCompsAccepted: 0,
    soldCompsRejected: 0,
    activeCompsMaybe: 0,
    sourcesAttempted: 0,
    sourcesWithResults: 0,
  },
} as unknown as CandidateMarketSnapshot;

function baseCard(): ScannedCard {
  return {
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
    createdAt: new Date().toISOString(),
    cardFlowV2Identity: {
      category: "mtg",
      suspects: [marSuspect],
      suspectAssessments: [],
      lockedIdentity: {
        locked: true,
        lockStatus: "locked",
        confidence: 0.9,
        category: "mtg",
        canonicalName: "Ravenous Tyrannosaurus",
        setCode: "MAR",
        collectorNumber: "93",
        variantTags: [],
        requiredEvidenceSatisfied: true,
        missingRequiredEvidence: [],
        unresolvedVariantRisks: [],
        staffMessage: "ok",
      },
      candidateGenerationNotes: [],
      createdAt: new Date().toISOString(),
    },
    cardFlowV2Market: {
      mode: "locked_identity_market",
      lockedIdentityStatus: "locked",
      snapshots: [baseSnapshot],
      recommendedStaffAction: "",
      warnings: [],
      createdAt: new Date().toISOString(),
    },
    cardFlowV2OfferPreview: {
      enabled: true,
      eligible: false,
      recommendedAction: "staff_review_required",
      marketDecision: {
        usableForOfferPreview: false,
        basis: "active_sanity_only",
        confidence: "none",
        blockers: ["active_only", "ebay_sold_unavailable"],
        warnings: [],
        sourceValues: [],
        explanation: "Only active listings available.",
      },
      createdAt: new Date().toISOString(),
    },
  };
}

console.log("Directive 006Q — Market Research Assist\n");

console.log("1. Eligibility");
assert(
  shouldShowMarketResearchAssist({
    reviewStatus: "v2_needs_pricing_review",
    offerPreview: baseCard().cardFlowV2OfferPreview,
    primarySnap: baseSnapshot,
  }),
  "shows when active_only + ebay unavailable",
);

console.log("\n2. Query builder");
const assist = buildMarketResearchAssist({
  card: baseCard(),
  suspect: marSuspect,
  snapshot: baseSnapshot,
});
assert(assist.positiveQuery.includes("Ravenous"), "positive query has card name");
assert(assist.positiveQuery.includes("MAR"), "positive query has set");
assert(assist.negativeTerms.some((t) => /Jurassic/i.test(t)), "negative has Jurassic");
assert(assist.links.ebaySold.includes("LH_Sold=1"), "ebay sold link");
assert(Boolean(assist.links.scryfall?.includes("scryfall.com")), "scryfall link for MTG");

console.log("\n2b. TCGplayer link uses catalog product URL, not Pokémon API id");
const tcgAssist = buildMarketResearchAssist({
  card: baseCard(),
  suspect: marSuspect,
  snapshot: {
    ...baseSnapshot,
    tcgplayerMapping: {
      attempted: true,
      availableVariantNames: ["normal"],
      variantsFound: ["normal"],
      productUrl: "https://prices.tcgplayer.com/price/product/42346?id=42346",
      productId: "neo-genesis-abc-uuid-should-not-be-used",
    },
  } as CandidateMarketSnapshot,
});
assert(
  tcgAssist.links.tcgplayer === "https://www.tcgplayer.com/product/42346",
  "TCGplayer link normalized from prices.tcgplayer.com URL",
);

const tcgNumeric = buildMarketResearchAssist({
  card: baseCard(),
  suspect: marSuspect,
  snapshot: {
    ...baseSnapshot,
    tcgplayerMapping: {
      attempted: true,
      availableVariantNames: [],
      variantsFound: [],
      productId: "87654",
    },
  } as CandidateMarketSnapshot,
});
assert(
  tcgNumeric.links.tcgplayer === "https://www.tcgplayer.com/product/87654",
  "numeric TCGplayer product id link",
);

const tcgBadId = buildMarketResearchAssist({
  card: baseCard(),
  suspect: marSuspect,
  snapshot: {
    ...baseSnapshot,
    tcgplayerMapping: {
      attempted: true,
      availableVariantNames: [],
      variantsFound: [],
      productId: "sv3pt5-110",
    },
  } as CandidateMarketSnapshot,
});
assert(
  Boolean(tcgBadId.links.tcgplayer?.includes("tcgplayer.com/search")),
  "non-numeric product id falls back to search URL",
);

console.log("\n3. Manual comp merge");
const manual = createManualMarketComp({
  source: "ebay_sold_manual",
  title: "Ravenous Tyrannosaurus MAR 93 NM",
  soldPrice: 7.25,
  accepted: true,
  reviewedBy: "test@example.com",
  suspectId: "scryfall:mar-93",
});
const market = applyManualCompsToMarketBundle(
  baseCard().cardFlowV2Market,
  [manual],
  "scryfall:mar-93",
);
const snap = market?.snapshots[0];
assert(
  Boolean(
    snap?.acceptedComps.some((a) => a.notes.some((n) => n.includes("human-reviewed"))),
  ),
  "manual comp marked human-reviewed",
);
assert(snap?.valueMedian === 7.25, "median from manual comp");

console.log("\n4. Production unchanged after refresh");
const card = baseCard();
const refreshed = refreshCardAfterManualComps({
  card: { ...card, cardFlowV2ManualComps: [manual] },
  settings: { id: "t", ...DEFAULT_STORE_SETTINGS },
  rules: [],
});
assert(refreshed.marketPrice === 7.57, "marketPrice unchanged");
assert(refreshed.cashOffer === 3.79, "cashOffer unchanged");
assert(refreshed.cardFlowV2ManualComps?.length === 1, "manual comps saved");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
