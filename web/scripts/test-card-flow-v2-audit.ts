/**
 * Phase 4 tests — pricing comparison, risk scoring, audit summary.
 * Run: npm run test:card-flow-v2-audit
 */
import { isCardFlowV2AuditEnabled } from "../src/lib/card-flow-v2/feature-flag";
import { compareV2Pricing } from "../src/lib/card-flow-v2/audit/compare-pricing";
import { buildCardFlowV2AuditRecord } from "../src/lib/card-flow-v2/audit/audit-record";
import { summarizeV2Audits } from "../src/lib/card-flow-v2/audit/audit-summary";
import { stubMarketSnapshotDiagnostics } from "../src/lib/card-flow-v2/market/source-health";
import type { ScannedCard } from "../src/lib/types";
import type {
  CardCandidateBundle,
  LockedCardIdentity,
} from "../src/lib/card-flow-v2/types";
import type {
  CardFlowV2MarketBundle,
  CandidateMarketSnapshot,
  CompMatchAssessment,
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

function identityBundle(
  locked: LockedCardIdentity,
  overrides: Partial<CardCandidateBundle> = {},
): CardCandidateBundle {
  return {
    category: "pokemon",
    suspects: [],
    suspectAssessments: [],
    lockedIdentity: locked,
    candidateGenerationNotes: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function compAssessment(): CompMatchAssessment {
  return {
    comp: { source: "ebay_sold", title: "Test", price: 10 },
    status: "accepted",
    matchScore: 0.9,
    acceptedReasons: ["match"],
    rejectionReasons: [],
    notes: [],
  };
}

function snapshot(
  overrides: Partial<CandidateMarketSnapshot> = {},
): CandidateMarketSnapshot {
  return {
    lockedIdentityUsed: true,
    marketProductName: "Test Card",
    searchPlan: {
      planId: "p1",
      lockedIdentityUsed: true,
      category: "pokemon",
      marketProductName: "Test Card",
      gradeContext: "raw",
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
    acceptedComps: [compAssessment(), compAssessment(), compAssessment()],
    rejectedComps: [],
    maybeComps: [],
    valueLow: 90,
    valueMedian: 100,
    valueHigh: 110,
    confidence: "high",
    pricingMethod: "median",
    warnings: [],
    ...stubMarketSnapshotDiagnostics(3),
    ...overrides,
  };
}

function marketBundle(
  overrides: Partial<CardFlowV2MarketBundle> = {},
): CardFlowV2MarketBundle {
  return {
    mode: "locked_identity_market",
    lockedIdentityStatus: "locked",
    snapshots: [snapshot()],
    recommendedStaffAction: "",
    warnings: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

console.log("Card Flow V2 Phase 4 — audit tests\n");

console.log("Feature flag");
const prev = {
  e: process.env.CARD_FLOW_V2_EVIDENCE_ENABLED,
  i: process.env.CARD_FLOW_V2_IDENTITY_ENABLED,
  m: process.env.CARD_FLOW_V2_MARKET_ENABLED,
  a: process.env.CARD_FLOW_V2_AUDIT_ENABLED,
};
process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "false";
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "false";
process.env.CARD_FLOW_V2_MARKET_ENABLED = "false";
process.env.CARD_FLOW_V2_AUDIT_ENABLED = "true";
assert(isCardFlowV2AuditEnabled() === false, "audit requires all V2 flags");
process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
assert(isCardFlowV2AuditEnabled() === true, "audit on when all flags true");
process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = prev.e;
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = prev.i;
process.env.CARD_FLOW_V2_MARKET_ENABLED = prev.m;
process.env.CARD_FLOW_V2_AUDIT_ENABLED = prev.a;

console.log("\n1. Current and V2 within 20% = matches_current");
const c1 = compareV2Pricing({
  card: baseCard({ marketPrice: 100 }),
  identity: identityBundle(lockedIdentity()),
  market: marketBundle({ snapshots: [snapshot({ valueMedian: 115 })] }),
});
assert(c1.agreement === "matches_current", "within 20%");

console.log("\n2. V2 more than 20% higher = v2_higher");
const c2 = compareV2Pricing({
  card: baseCard({ marketPrice: 100 }),
  identity: identityBundle(lockedIdentity()),
  market: marketBundle({ snapshots: [snapshot({ valueMedian: 130 })] }),
});
assert(c2.agreement === "v2_higher", "v2 higher");

console.log("\n3. V2 more than 20% lower = v2_lower");
const c3 = compareV2Pricing({
  card: baseCard({ marketPrice: 100 }),
  identity: identityBundle(lockedIdentity()),
  market: marketBundle({ snapshots: [snapshot({ valueMedian: 70 })] }),
});
assert(c3.agreement === "v2_lower", "v2 lower");

console.log("\n4. Difference over 50% adds large_price_disagreement");
const r4 = buildCardFlowV2AuditRecord({
  card: baseCard({ marketPrice: 100 }),
  identity: identityBundle(lockedIdentity()),
  market: marketBundle({ snapshots: [snapshot({ valueMedian: 40 })] }),
});
assert(r4.issues.includes("large_price_disagreement"), "large disagreement issue");

console.log("\n5. Current price but V2 no accepted comps");
const c5 = compareV2Pricing({
  card: baseCard({ marketPrice: 50 }),
  identity: identityBundle(lockedIdentity()),
  market: marketBundle({
    snapshots: [snapshot({ valueMedian: undefined, acceptedComps: [] })],
  }),
});
assert(c5.agreement === "current_has_price_v2_none", "current has price v2 none");

console.log("\n6. V2 price but current none");
const c6 = compareV2Pricing({
  card: baseCard({ marketPrice: 0 }),
  identity: identityBundle(lockedIdentity()),
  market: marketBundle(),
});
assert(c6.agreement === "v2_has_price_current_none", "v2 has price current none");

console.log("\n7. Unlocked identity with candidate snapshots = not_comparable");
const c7 = compareV2Pricing({
  card: baseCard({ marketPrice: 80 }),
  identity: identityBundle(
    lockedIdentity({ locked: false, lockStatus: "not_locked_variant_uncertainty" }),
  ),
  market: marketBundle({
    mode: "candidate_market_comparison",
    snapshots: [snapshot(), snapshot({ marketProductName: "Alt" })],
  }),
});
assert(c7.agreement === "not_comparable", "not comparable when unlocked");

console.log("\n8. Slab mismatch = critical risk");
const r8 = buildCardFlowV2AuditRecord({
  card: baseCard({ marketPrice: 120 }),
  identity: identityBundle(
    lockedIdentity({
      locked: false,
      lockStatus: "manual_review_recommended",
      staffMessage: "Slab label mismatch — manual review",
    }),
  ),
  market: marketBundle(),
});
assert(r8.riskLevel === "critical", "slab mismatch critical");
assert(r8.issues.includes("slab_label_mismatch"), "slab issue");

console.log("\n9. Raw/graded mismatch risk = critical risk");
const r9 = buildCardFlowV2AuditRecord({
  card: baseCard({ marketPrice: 80 }),
  identity: identityBundle(
    lockedIdentity({
      locked: false,
      unresolvedVariantRisks: ["raw vs graded mismatch on title"],
    }),
  ),
  market: marketBundle(),
});
assert(r9.riskLevel === "critical", "raw graded critical");
assert(r9.issues.includes("raw_graded_mismatch_risk"), "raw graded issue");

console.log("\n10. Variant uncertainty = high risk");
const r10 = buildCardFlowV2AuditRecord({
  card: baseCard(),
  identity: identityBundle(
    lockedIdentity({
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      unresolvedVariantRisks: ["parallel finish unknown"],
    }),
  ),
  market: marketBundle({
    mode: "candidate_market_comparison",
    snapshots: [snapshot()],
  }),
});
assert(r10.riskLevel === "high", "variant uncertainty high");
assert(r10.issues.includes("variant_uncertainty"), "variant issue");

console.log("\n11. V2 locked + 3 comps + agreement = low risk");
const r11 = buildCardFlowV2AuditRecord({
  card: baseCard({ marketPrice: 100 }),
  identity: identityBundle(lockedIdentity()),
  market: marketBundle({
    snapshots: [
      snapshot({
        valueMedian: 105,
        acceptedComps: [
          compAssessment(),
          compAssessment(),
          compAssessment(),
        ],
      }),
    ],
  }),
});
assert(r11.riskLevel === "low", "aligned locked low risk");
assert(r11.priceComparison.agreement === "matches_current", "matches");

console.log("\n12. Audit summary counts risk levels and top issues");
const records = [r4, r8, r9, r10, r11];
const summary = summarizeV2Audits(records);
assert(summary.totalCards === 5, "total cards");
assert((summary.riskCounts.critical ?? 0) >= 2, "critical count");
assert((summary.riskCounts.low ?? 0) >= 1, "low count");
assert(summary.topIssues.length > 0, "top issues");
assert(summary.examples.slabMismatches.includes("card-1"), "slab example id");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
