/**
 * Directive 005 — staff-confirmed snapshot promotion tests.
 * Run: npx tsx scripts/test-staff-market-promotion.ts
 */
import type { CardSuspect } from "../src/lib/card-flow-v2/types";
import type {
  CandidateMarketSnapshot,
  CardFlowV2MarketBundle,
} from "../src/lib/card-flow-v2/market/types";
import {
  SNAPSHOT_TTL_MS,
  clearStaffConfirmedMarket,
  evaluateSnapshotReuse,
  promoteStaffConfirmedMarket,
} from "../src/lib/card-flow-v2/market/promote-staff-confirmed-market";
import { stubMarketSnapshotDiagnostics } from "../src/lib/card-flow-v2/market/source-health";
import { buildCardFlowV2AuditRecord } from "../src/lib/card-flow-v2/audit/audit-record";
import { compareV2Pricing } from "../src/lib/card-flow-v2/audit/compare-pricing";
import type { ScannedCard } from "../src/lib/types";

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

function suspect(overrides: Partial<CardSuspect> = {}): CardSuspect {
  return {
    suspectId: "pokemon_tcg:sv2-184:reverse_holo",
    category: "pokemon",
    label: "Grusha 184 reverse holo",
    catalogSource: "pokemon_tcg",
    canonicalName: "Grusha",
    setName: "Paldea Evolved",
    collectorNumber: "184",
    finish: "reverse_holo",
    variantTags: [],
    expectedEvidence: [],
    ...overrides,
  };
}

function snapshot(
  overrides: Partial<CandidateMarketSnapshot> = {},
): CandidateMarketSnapshot {
  return {
    suspectId: "pokemon_tcg:sv2-184:reverse_holo",
    lockedIdentityUsed: false,
    marketProductName: "Grusha 184 reverse holo",
    searchPlan: {
      planId: "suspect:pokemon_tcg:sv2-184:reverse_holo",
      suspectId: "pokemon_tcg:sv2-184:reverse_holo",
      lockedIdentityUsed: false,
      category: "pokemon",
      marketProductName: "Grusha 184 reverse holo",
      gradeContext: "raw",
      exactQueries: [],
      narrowQueries: [],
      broadQueries: [],
      requiredTerms: ["Grusha", "Paldea Evolved", "184", "reverse_holo"],
      forbiddenTerms: [],
      queryExclusionTerms: [],
      identityFinish: "reverse_holo",
      warnings: [],
    },
    rawComps: [],
    compAssessments: [],
    acceptedComps: [
      {
        comp: { source: "ebay_sold", title: "Grusha reverse holo", price: 0.12 },
        status: "accepted",
        matchScore: 0.9,
        acceptedReasons: [],
        rejectionReasons: [],
        notes: [],
      },
      {
        comp: { source: "ebay_sold", title: "Grusha reverseHolofoil", price: 0.13 },
        status: "accepted",
        matchScore: 0.88,
        acceptedReasons: [],
        rejectionReasons: [],
        notes: [],
      },
    ],
    rejectedComps: [],
    maybeComps: [],
    valueLow: 0.12,
    valueMedian: 0.125,
    valueHigh: 0.13,
    confidence: "medium",
    pricingMethod: "accepted_sold_comps_thin",
    warnings: [],
    createdAt: new Date().toISOString(),
    ...stubMarketSnapshotDiagnostics(2),
    ...overrides,
  };
}

function candidateMarket(
  overrides: Partial<CardFlowV2MarketBundle> = {},
): CardFlowV2MarketBundle {
  return {
    mode: "candidate_market_comparison",
    lockedIdentityStatus: "manual_review_recommended",
    identitySource: "candidate",
    snapshots: [
      snapshot(),
      snapshot({
        suspectId: "pokemon_tcg:sv2-184:normal",
        marketProductName: "Grusha 184 normal",
        valueMedian: 0.13,
        acceptedComps: [
          {
            comp: { source: "ebay_sold", title: "Grusha normal", price: 0.13 },
            status: "accepted",
            matchScore: 0.9,
            acceptedReasons: [],
            rejectionReasons: [],
            notes: [],
          },
        ],
      }),
    ],
    recommendedStaffAction: "Pick printing",
    warnings: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

const card: ScannedCard = {
  id: "card-1",
  orderId: "order-1",
  frontImageUrl: "https://example.com/f.jpg",
  backImageUrl: "",
  itemType: "raw",
  status: "processed",
  marketPrice: 0.13,
  createdAt: new Date().toISOString(),
};

async function main() {
  console.log("Directive 005 — staff market promotion tests\n");

  console.log("1. Fresh prepared snapshot is reusable");
  const reuse = evaluateSnapshotReuse({
    snapshot: snapshot(),
    suspect: suspect(),
    marketCreatedAt: new Date().toISOString(),
  });
  assert(reuse.canPromote, "can promote fresh snapshot");
  assert(reuse.promotedFromSnapshot, "marks promotion from snapshot");
  assert(!reuse.marketRefetchRequired, "no refetch required when fresh with comps");

  console.log("\n2. Stale snapshot triggers refetch requirement");
  const staleAt = new Date(Date.now() - SNAPSHOT_TTL_MS - 1000).toISOString();
  const staleReuse = evaluateSnapshotReuse({
    snapshot: snapshot({ createdAt: staleAt }),
    suspect: suspect(),
    marketCreatedAt: staleAt,
    now: new Date(),
  });
  assert(staleReuse.marketRefetchRequired, "flags stale refetch");
  assert(staleReuse.marketRefetchReason === "snapshot_stale", "stale reason");

  console.log("\n3. Staff confirmation promotes without refetch when fresh");
  const { market, promotion } = await promoteStaffConfirmedMarket({
    market: candidateMarket(),
    suspect: suspect(),
    confirmedBy: "staff@test.com",
  });
  assert(market.mode === "staff_confirmed_identity_market", "staff confirmed mode");
  assert(market.selectedSuspectId === suspect().suspectId, "selected suspect set");
  assert(market.snapshots.length === 2, "keeps all prepared candidate snapshots");
  assert(promotion.promotedFromSnapshot, "promoted from prepared snapshot");
  assert(!promotion.marketRefetchRequired, "no blocking refetch on fresh snapshot");

  console.log("\n4. Audit uses selected snapshot after confirmation");
  const comparison = compareV2Pricing({ card, market });
  assert(comparison.v2ValueMedian === 0.125, "audit compares staff-selected median");
  assert(comparison.agreement !== "not_comparable", "becomes comparable after confirm");

  const audit = buildCardFlowV2AuditRecord({ card, market });
  assert(audit.v2MarketMode === "staff_confirmed_identity_market", "audit mode updated");
  assert(audit.acceptedCompCount === 2, "audit counts selected snapshot comps only");
  assert(
    audit.v2StaffMarketPromotion?.promotedFromSnapshot === true,
    "audit records snapshot promotion",
  );

  console.log("\n5. Clear confirmation restores candidate comparison mode");
  const cleared = clearStaffConfirmedMarket(market);
  assert(cleared.mode === "candidate_market_comparison", "restores candidate mode");
  assert(!cleared.selectedSuspectId, "clears selected suspect");
  assert(!cleared.staffConfirmedPromotion, "clears promotion metadata");

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

void main();
