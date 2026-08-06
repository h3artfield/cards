/**
 * Phase 3 tests — search plans, comp matcher, tier guard, value calc (no live API).
 * Run: npm run test:card-flow-v2-market
 */
import {
  isCardFlowV2MarketEnabled,
  isCardFlowV2EvidenceEnabled,
  isCardFlowV2IdentityEnabled,
} from "../src/lib/card-flow-v2/feature-flag";
import {
  buildLockedIdentitySearchPlan,
  buildSuspectSearchPlan,
  identityFieldsFromSuspect,
} from "../src/lib/card-flow-v2/market/search-plan-builder";
import { assessMarketComp } from "../src/lib/card-flow-v2/market/comp-matcher";
import { pickPriceChartingTiersForPlan } from "../src/lib/card-flow-v2/market/pricecharting-tier";
import { calculateShadowMarketValue } from "../src/lib/card-flow-v2/market/value-calculator";
import { runCardMarketV2 } from "../src/lib/card-flow-v2/market/run-card-market-v2";
import type { CardSuspect, LockedCardIdentity } from "../src/lib/card-flow-v2/types";
import type { MarketSearchPlan, RawMarketComp } from "../src/lib/card-flow-v2/market/types";

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

function locked(overrides: Partial<LockedCardIdentity>): LockedCardIdentity {
  return {
    locked: true,
    lockStatus: "locked",
    confidence: 0.92,
    category: "pokemon",
    canonicalName: "Morgan",
    setName: "Team Up",
    collectorNumber: "178/167",
    variantTags: [],
    requiredEvidenceSatisfied: true,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    staffMessage: "Locked",
    ...overrides,
  };
}

function suspect(overrides: Partial<CardSuspect>): CardSuspect {
  return {
    suspectId: "test:1",
    category: "pokemon",
    label: "Test",
    catalogSource: "pokemon_tcg",
    variantTags: [],
    expectedEvidence: [],
    ...overrides,
  };
}

function comp(
  title: string,
  price: number,
  source: RawMarketComp["source"] = "ebay_sold",
): RawMarketComp {
  return { source, title, price };
}

function planFromLocked(l: LockedCardIdentity): MarketSearchPlan {
  return buildLockedIdentitySearchPlan(l);
}

console.log("Card Flow V2 Phase 3 — market tests\n");

console.log("Feature flag");
const prev = {
  e: process.env.CARD_FLOW_V2_EVIDENCE_ENABLED,
  i: process.env.CARD_FLOW_V2_IDENTITY_ENABLED,
  m: process.env.CARD_FLOW_V2_MARKET_ENABLED,
};
process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "false";
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "false";
process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
assert(isCardFlowV2MarketEnabled() === false, "market requires evidence+identity");
process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
assert(isCardFlowV2MarketEnabled() === true, "market on when all flags true");
process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = prev.e;
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = prev.i;
process.env.CARD_FLOW_V2_MARKET_ENABLED = prev.m;

console.log("\n1. Locked Pokémon raw search forbids graded terms");
const rawPlan = planFromLocked(
  locked({ finish: "normal", gradingCompany: undefined, grade: undefined }),
);
assert(rawPlan.gradeContext === "raw", "raw grade context");
assert(
  rawPlan.forbiddenTerms.some((t) => t.includes("psa")),
  "forbids PSA for raw",
);
assert(
  rawPlan.queryExclusionTerms.some((t) => t.toLowerCase() === "psa"),
  "queryExclusionTerms includes PSA for raw",
);
const rawExact = rawPlan.exactQueries.find((q) => q.purpose === "exact");
assert(
  Boolean(rawExact?.query.includes("-PSA")),
  "eBay exact query uses minus PSA exclusion",
);
assert(
  !rawPlan.broadQueries[0]?.query.includes("-PSA"),
  "broad discovery query skips minus exclusions",
);

console.log("\n2. Locked graded search forbids raw terms");
const gradedPlan = planFromLocked(
  locked({
    gradingCompany: "PSA",
    grade: "10",
  }),
);
assert(gradedPlan.gradeContext === "graded", "graded context");
assert(
  gradedPlan.forbiddenTerms.some((t) => t === "raw"),
  "forbids raw for graded plan",
);
assert(
  gradedPlan.exactQueries.some((q) => q.purpose === "graded_exact"),
  "has graded exact query",
);

console.log("\n3. MTG foil suspect requires foil and rejects nonfoil listing");
const foilPlan = buildSuspectSearchPlan(
  suspect({
    category: "mtg",
    canonicalName: "Sol Ring",
    setCode: "LTC",
    collectorNumber: "408",
    finish: "foil",
    label: "Sol Ring LTC 408 foil",
  }),
);
const foilReject = assessMarketComp(
  comp("Sol Ring LTC 408 nonfoil", 5),
  foilPlan,
);
assert(
  foilReject.status === "rejected" || foilReject.rejectionReasons.includes("wrong_finish"),
  "rejects nonfoil listing for foil plan",
);

console.log("\n4. MTG nonfoil suspect rejects foil listing");
const nonfoilPlan = buildSuspectSearchPlan(
  suspect({
    category: "mtg",
    canonicalName: "Sol Ring",
    setCode: "LTC",
    collectorNumber: "408",
    finish: "nonfoil",
  }),
);
const foilListingReject = assessMarketComp(
  comp("Sol Ring LTC 408 foil etched", 12),
  nonfoilPlan,
);
assert(
  foilListingReject.status === "rejected",
  "rejects foil listing for nonfoil plan",
);

console.log("\n5. Yu-Gi-Oh 1st edition rejects unlimited");
const ygoPlan = buildSuspectSearchPlan(
  suspect({
    category: "yugioh",
    canonicalName: "Blue-Eyes White Dragon",
    setCode: "SDK",
    edition: "1st Edition",
    label: "BEWD SDK 1st",
  }),
);
const ygoReject = assessMarketComp(
  comp("Blue-Eyes White Dragon SDK Unlimited", 20),
  ygoPlan,
);
assert(
  ygoReject.rejectionReasons.includes("wrong_edition") ||
    ygoReject.status === "rejected",
  "rejects unlimited for 1st edition plan",
);

console.log("\n6. Sports silver parallel rejects base listing");
const silverPlan = buildSuspectSearchPlan(
  suspect({
    category: "sports",
    canonicalName: "CJ Stroud",
    setName: "2023 Panini Prizm",
    cardNumber: "339",
    finish: "Silver Prizm",
    variantTags: ["Silver Prizm"],
    label: "2023 Prizm CJ Stroud #339 Silver",
  }),
);
const baseReject = assessMarketComp(
  comp("2023 Panini Prizm CJ Stroud #339 RC Base", 8),
  silverPlan,
);
assert(
  baseReject.rejectionReasons.includes("wrong_parallel") ||
    baseReject.status === "rejected",
  "rejects base for silver parallel plan",
);

console.log("\n7. Sports raw rejects PSA listing");
const sportsRawPlan = buildSuspectSearchPlan(
  suspect({
    category: "sports",
    canonicalName: "CJ Stroud",
    setName: "2023 Panini Prizm",
    cardNumber: "339",
    finish: "raw",
  }),
);
const psaReject = assessMarketComp(
  comp("2023 Panini Prizm CJ Stroud #339 PSA 10", 100),
  sportsRawPlan,
);
assert(
  psaReject.rejectionReasons.includes("raw_vs_graded_mismatch"),
  "raw plan rejects PSA listing",
);

console.log("\n8. Sports graded rejects raw listing");
const sportsGradedPlan = buildSuspectSearchPlan(
  suspect({
    category: "sports",
    canonicalName: "CJ Stroud",
    setName: "2023 Panini Prizm",
    cardNumber: "339",
    gradingCompany: "PSA",
    grade: "10",
    finish: "graded",
  }),
);
const rawListingReject = assessMarketComp(
  comp("2023 Panini Prizm CJ Stroud #339 raw", 15),
  sportsGradedPlan,
);
assert(
  rawListingReject.rejectionReasons.includes("raw_vs_graded_mismatch"),
  "graded plan rejects raw listing",
);

console.log("\n9. Lot/bundle listings rejected");
const lotReject = assessMarketComp(
  comp("Pokemon lot of 50 cards Morgan", 10),
  rawPlan,
);
assert(
  lotReject.rejectionReasons.includes("lot_or_bundle"),
  "rejects lot listing",
);

console.log("\n10. Active listings not accepted as sold comps");
const active = assessMarketComp(
  comp("Morgan Team Up 178/167", 40, "ebay_active"),
  rawPlan,
);
assert(active.status === "maybe", "active listing is maybe not accepted");
assert(
  active.rejectionReasons.includes("active_listing_not_sold"),
  "flags active listing reason",
);

console.log("\n11. PriceCharting wrong tier excluded for raw");
const tiers = pickPriceChartingTiersForPlan(
  {
    "loose-price": 4000,
    "manual-only-price": 20000,
    "graded-price": 5000,
  },
  rawPlan,
);
assert(
  tiers.find((t) => t.label === "Ungraded")?.accepted === true,
  "accepts ungraded tier",
);
assert(
  tiers.find((t) => t.label === "Manual-only")?.accepted === false,
  "excludes manual-only for raw",
);

console.log("\n12. Unlocked identity → separate plans per suspect");
const s1 = buildSuspectSearchPlan(
  suspect({ suspectId: "a", label: "Base", finish: "normal" }),
);
const s2 = buildSuspectSearchPlan(
  suspect({ suspectId: "b", label: "Holo", finish: "holofoil" }),
);
assert(s1.planId !== s2.planId, "separate plan ids per suspect");

console.log("\n13. No identity bundle → no_market_run");
void runCardMarketV2({}).then((noId) => {
  assert(noId.mode === "no_market_run", "no identity returns no_market_run");

  console.log("\n14. No accepted comps → confidence none");
  const noneVal = calculateShadowMarketValue({
    plan: rawPlan,
    assessments: [assessMarketComp(comp("Wrong Card Lot", 1), rawPlan)],
    lockedIdentityUsed: true,
    fetchWarnings: [],
  });
  assert(noneVal.confidence === "none", "no accepted comps → none confidence");
  assert(
    noneVal.pricingMethod === "no_market_data" ||
      noneVal.pricingMethod === "active_listings_only_sanity_check",
    "no sold/signal data → no_market_data or active-only",
  );

  console.log("\n15. Three accepted sold comps → median value");
  const threeSold = calculateShadowMarketValue({
    plan: rawPlan,
    assessments: [
      {
        ...assessMarketComp(comp("Morgan Team Up 178/167", 38), rawPlan),
        status: "accepted" as const,
      },
      {
        ...assessMarketComp(comp("Morgan 178/167 Team Up", 42), rawPlan),
        status: "accepted" as const,
      },
      {
        ...assessMarketComp(comp("Morgan Team Up 178/167 NM", 45), rawPlan),
        status: "accepted" as const,
      },
    ],
    lockedIdentityUsed: true,
    fetchWarnings: [],
  });
  assert(threeSold.valueMedian === 42, "median of 38/42/45 is 42");
  assert(
    threeSold.confidence === "high" || threeSold.confidence === "medium",
    "multiple comps yield medium/high confidence",
  );

  console.log("\n16. Pokémon reverse holo — accept title without collector #");
  const grushaReversePlan = buildSuspectSearchPlan(
    suspect({
      category: "pokemon",
      canonicalName: "Grusha",
      setName: "Paldea Evolved",
      collectorNumber: "184",
      finish: "reverse_holo",
      label: "Grusha 184 reverse holo",
    }),
  );
  const grushaReverseComp = assessMarketComp(
    comp("Grusha (reverseHolofoil)", 0.12),
    grushaReversePlan,
  );
  assert(
    grushaReverseComp.status === "accepted" || grushaReverseComp.status === "maybe",
    "accepts Grusha reverseHolofoil without 184 in title",
  );
  assert(
    !grushaReverseComp.rejectionReasons.includes("wrong_number"),
    "does not reject wrong_number when # omitted",
  );
  const grushaWrongNum = assessMarketComp(
    comp("Grusha 268 reverse holo", 0.5),
    grushaReversePlan,
  );
  assert(
    grushaWrongNum.rejectionReasons.includes("wrong_number"),
    "rejects when title states a different collector number",
  );
  const grushaWrongFinish = assessMarketComp(
    comp("Grusha (normal)", 0.1),
    grushaReversePlan,
  );
  assert(
    grushaWrongFinish.rejectionReasons.includes("wrong_finish"),
    "rejects normal listing for reverse holo plan",
  );
  const grushaHoloNotReverse = assessMarketComp(
    comp("Grusha (holofoil)", 0.15),
    grushaReversePlan,
  );
  assert(
    grushaHoloNotReverse.rejectionReasons.includes("wrong_finish"),
    "rejects regular holofoil for reverse holo plan",
  );
  const grushaPlain = assessMarketComp(
    comp("Grusha NM", 0.12),
    grushaReversePlan,
  );
  assert(
    grushaPlain.status !== "accepted",
    "name-only listing without finish is not accepted for reverse holo",
  );

  console.log("\n17. Normal suspect must not steal reverse holo comps");
  const grushaNormalPlan = buildSuspectSearchPlan(
    suspect({
      category: "pokemon",
      canonicalName: "Grusha",
      setName: "Paldea Evolved",
      collectorNumber: "184",
      finish: "normal",
      label: "Grusha 184 normal",
    }),
  );
  const reverseOnNormal = assessMarketComp(
    comp("Grusha (reverseHolofoil)", 0.12),
    grushaNormalPlan,
  );
  assert(
    reverseOnNormal.rejectionReasons.includes("wrong_finish"),
    "rejects reverse holo comp on normal plan",
  );
  const normalOnNormal = assessMarketComp(
    comp("Grusha 184/193 Paldea Evolved", 0.08),
    grushaNormalPlan,
  );
  assert(
    normalOnNormal.status === "accepted" || normalOnNormal.status === "maybe",
    "accepts normal listing with collector number",
  );
  const reverseTitleMatch = assessMarketComp(
    comp(
      "Grusha 184/193 Uncommon Paldea Evolved Pokemon Reverse Holo Near Mint",
      0.12,
    ),
    grushaReversePlan,
  );
  assert(
    reverseTitleMatch.status === "accepted",
    "accepts reverse holo listing with full title",
  );
  const reverseOnReverse = assessMarketComp(
    comp("Grusha (reverseHolofoil)", 0.12),
    grushaReversePlan,
  );
  assert(
    reverseOnReverse.status === "accepted",
    "accepts tcgplayer reverseHolofoil title on reverse holo plan",
  );

  console.log("\n18. eBay query exclusions vary by category and finish");
  const sportsRawPlan = buildSuspectSearchPlan(
    suspect({
      category: "sports",
      canonicalName: "CJ Stroud",
      setName: "2023 Panini Prizm",
      cardNumber: "339",
      finish: "Silver Prizm",
      label: "CJ Stroud Silver Prizm",
    }),
  );
  assert(
    sportsRawPlan.queryExclusionTerms.some((t) => t === "break"),
    "sports plan excludes break",
  );
  assert(
    grushaReversePlan.queryExclusionTerms.includes("normal"),
    "reverse holo plan excludes normal finish in query",
  );
  assert(
    grushaNormalPlan.queryExclusionTerms.includes("reverse"),
    "normal plan excludes reverse finish in query",
  );
  const mtgFoilPlan = buildSuspectSearchPlan(
    suspect({
      category: "mtg",
      canonicalName: "Lightning Bolt",
      setCode: "MH2",
      collectorNumber: "254",
      finish: "foil",
      label: "Lightning Bolt foil",
    }),
  );
  assert(
    mtgFoilPlan.queryExclusionTerms.includes("nonfoil"),
    "MTG foil plan excludes nonfoil in query",
  );
  assert(
    mtgFoilPlan.queryExclusionTerms.includes("arena"),
    "MTG plan excludes arena",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
});
