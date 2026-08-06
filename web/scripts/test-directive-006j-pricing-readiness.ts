/**
 * Directive 006J — pricing readiness sprint tests.
 * Run: npm run test:directive-006j-pricing-readiness
 */
import {
  SNAPSHOT_TTL_MS,
  evaluateSnapshotReuse,
  promoteStaffConfirmedMarket,
} from "../src/lib/card-flow-v2/market/promote-staff-confirmed-market";
import {
  selectMarketSnapshotSuspects,
  getInspectorFavoredSuspectIds,
} from "../src/lib/card-flow-v2/market/select-market-snapshot-suspects";
import { stubMarketSnapshotDiagnostics } from "../src/lib/card-flow-v2/market/source-health";
import { applyStaffConfirmPricingRefresh } from "../src/lib/card-flow-v2/staff-confirm-pricing";
import { applyStaffSuspectSelection } from "../src/lib/card-flow-v2/staff-suspect-selection";
import { applyStaffConfirmedVariantResolution } from "../src/lib/card-flow-v2/variant-uncertainty";
import { resolvePricingReadinessState } from "../src/lib/card-flow-v2/offer/pricing-readiness";
import { buildStaffConfirmationQueueItem } from "../src/lib/card-flow-v2/staff-confirmation-queue";
import {
  buildMorganRegressionCard,
  buildCjStroudRegressionCard,
} from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";
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

process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
process.env.CARD_FLOW_V2_AUDIT_ENABLED = "true";
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";

const testSettings = { ...DEFAULT_STORE_SETTINGS, id: "test-store" };

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

function grushaSnapshot(suspectId: string): CandidateMarketSnapshot {
  const stub = stubMarketSnapshotDiagnostics(2);
  return {
    suspectId,
    marketSnapshotReason: "top_score",
    lockedIdentityUsed: false,
    marketProductName: "Grusha reverse holo",
    searchPlan: {
      planId: `plan:${suspectId}`,
      suspectId,
      lockedIdentityUsed: false,
      category: "pokemon",
      marketProductName: "Grusha",
      gradeContext: "raw",
      identityFinish: suspectId.includes("reverse") ? "reverse_holo" : "normal",
      exactQueries: [],
      narrowQueries: [],
      broadQueries: [],
      requiredTerms: ["Grusha", "184"],
      forbiddenTerms: [],
      queryExclusionTerms: [],
      warnings: [],
    },
    rawComps: [],
    compAssessments: [],
    acceptedComps: [],
    rejectedComps: [],
    maybeComps: [],
    valueLow: 0.12,
    valueMedian: 0.125,
    valueHigh: 0.13,
    confidence: "medium",
    pricingMethod: "tcgplayer_pricecharting_blend",
    warnings: [],
    createdAt: new Date().toISOString(),
    ...stub,
    tcgplayerMapping: {
      attempted: true,
      availableVariantNames: ["reverseHolofoil"],
      variantsFound: ["reverseHolofoil"],
      marketPrice: 0.12,
      selectedVariantName: "reverseHolofoil",
    },
    priceChartingMapping: {
      attempted: true,
      tierSelected: "Ungraded",
      tiersExcluded: [],
      loosePrice: 0.13,
      warnings: [],
    },
    marketOutcome: {
      ...stub.marketOutcome,
      pricingSignals: 2,
      summaryLabel: "TCGplayer + PriceCharting blend",
    },
  };
}

function candidateMarket(): CardFlowV2MarketBundle {
  return {
    mode: "candidate_market_comparison",
    lockedIdentityStatus: "manual_review_recommended",
    identitySource: "candidate",
    snapshots: [grushaSnapshot(GRUSHA_REVERSE.suspectId), grushaSnapshot(GRUSHA_NORMAL.suspectId)],
    recommendedStaffAction: "Pick printing",
    warnings: [],
    createdAt: new Date().toISOString(),
  };
}

function identityWithSuspects(suspects: CardSuspect[]): CardCandidateBundle {
  return {
    category: "pokemon",
    suspects,
    suspectAssessments: suspects.map((s, i) => ({
      suspectId: s.suspectId,
      matchScore: 0.9 - i * 0.05,
      supportingEvidence: [],
      contradictingEvidence: [],
      missingEvidence: [],
      variantRisks: [],
      reasoning: "",
      canEliminate: false,
      canConfirm: false,
    })),
    lockedIdentity: {
      locked: false,
      lockStatus: "manual_review_recommended",
      confidence: 0.7,
      category: "pokemon",
      variantTags: [],
      requiredEvidenceSatisfied: false,
      missingRequiredEvidence: ["finish"],
      unresolvedVariantRisks: ["foil unclear"],
      staffMessage: "Pick finish",
    },
    candidateGenerationNotes: [],
    createdAt: new Date().toISOString(),
  };
}

const baseCard: ScannedCard = {
  id: "card-grusha",
  orderId: "order-1",
  frontImageUrl: "https://example.com/f.jpg",
  backImageUrl: "",
  itemType: "raw",
  status: "processed",
  marketPrice: 0.13,
  cashOffer: 0.06,
  tradeOffer: 0.08,
  createdAt: new Date().toISOString(),
};

async function main() {
  console.log("Directive 006J — Pricing Readiness\n");

  console.log("1. Staff confirmation recomputes offer preview immediately");
  let identity = applyStaffSuspectSelection(
    identityWithSuspects([GRUSHA_REVERSE, GRUSHA_NORMAL]),
    { suspectId: GRUSHA_REVERSE.suspectId, confirmedBy: "staff@test.com" },
  );
  identity = applyStaffConfirmedVariantResolution(identity);
  const result = await applyStaffConfirmPricingRefresh({
    card: baseCard,
    identity,
    market: candidateMarket(),
    settings: testSettings,
    rules: [],
    confirmedBy: "staff@test.com",
  });
  assert(Boolean(result.cardFlowV2OfferPreview), "offer preview computed");
  assert(
    result.cardFlowV2OfferPreview!.recommendedAction === "staff_confirmed_preview_ready",
    "Grusha staff_confirmed_preview_ready",
  );
  assert(
    result.cardFlowV2OfferPreview!.marketDecision.basis === "tcgplayer_pricecharting_blend",
    "Grusha blend basis",
  );
  assert(
    Math.abs((result.cardFlowV2OfferPreview!.marketDecision.marketValue ?? 0) - 0.125) < 0.02,
    "Grusha shadow median ~0.125",
  );

  console.log("\n2. Production fields unchanged");
  assert(result.productionUnchanged === true, "productionUnchanged flag");
  assert(result.productionFields.marketPrice === 0.13, "marketPrice unchanged");
  assert(result.productionFields.cashOffer === 0.06, "cashOffer unchanged");
  assert(result.productionFields.tradeOffer === 0.08, "tradeOffer unchanged");
  assert(result.productionFields.status === "processed", "status unchanged");

  console.log("\n3. Fresh prepared snapshot reused on confirm");
  assert(
    result.staffMarketPromotion?.promotedFromSnapshot === true,
    "promoted from prepared snapshot",
  );
  assert(
    result.cardFlowV2Market?.mode === "staff_confirmed_identity_market",
    "staff confirmed market mode",
  );

  console.log("\n4. Stale snapshot refetches selected suspect only");
  const staleAt = new Date(Date.now() - SNAPSHOT_TTL_MS - 5000).toISOString();
  const staleMarket = candidateMarket();
  staleMarket.snapshots = staleMarket.snapshots.map((s) =>
    s.suspectId === GRUSHA_REVERSE.suspectId
      ? { ...s, createdAt: staleAt }
      : s,
  );
  const staleReuse = evaluateSnapshotReuse({
    snapshot: staleMarket.snapshots[0],
    suspect: GRUSHA_REVERSE,
    marketCreatedAt: staleAt,
  });
  assert(staleReuse.marketRefetchRequired, "stale flags refetch");

  console.log("\n5. Morgan blocks source_disagreement after staff confirm");
  const morgan = buildMorganRegressionCard();
  const morganIdentity = morgan.cardFlowV2Identity!;
  const morganResult = await applyStaffConfirmPricingRefresh({
    card: morgan,
    identity: morganIdentity,
    market: morgan.cardFlowV2Market,
    settings: testSettings,
    rules: [],
    confirmedBy: "staff@test.com",
  });
  assert(
    morganResult.cardFlowV2OfferPreview!.eligible === false,
    "Morgan not eligible",
  );
  assert(
    morganResult.cardFlowV2OfferPreview!.marketDecision.blockers.includes(
      "source_disagreement",
    ),
    "Morgan source_disagreement blocker",
  );
  assert(
    resolvePricingReadinessState({
      preview: morganResult.cardFlowV2OfferPreview,
      identity: morganIdentity,
      market: morganResult.cardFlowV2Market,
    }) === "blocked_source_disagreement",
    "Morgan readiness state",
  );

  console.log("\n6. CJ Stroud blocks sports/active uncertainty");
  const cj = buildCjStroudRegressionCard();
  const cjResult = await applyStaffConfirmPricingRefresh({
    card: cj,
    identity: cj.cardFlowV2Identity!,
    market: cj.cardFlowV2Market,
    settings: testSettings,
    rules: [],
    confirmedBy: "staff@test.com",
  });
  assert(cjResult.cardFlowV2OfferPreview!.eligible === false, "CJ not eligible");
  const cjBlockers = cjResult.cardFlowV2OfferPreview!.marketDecision.blockers;
  assert(
    cjBlockers.includes("active_only") ||
      cjBlockers.includes("sports_parallel_uncertainty") ||
      cjBlockers.includes("no_market_data"),
    "CJ Stroud blocked",
  );

  console.log("\n7. Inspector-favored suspect included in market snapshot picks");
  const listIdentity: CardCandidateBundle = {
    ...identityWithSuspects([
      {
        suspectId: "afc:198",
        category: "mtg",
        label: "Argentum Armor AFC",
        catalogSource: "scryfall",
        canonicalName: "Argentum Armor",
        setCode: "afc",
        collectorNumber: "198",
        variantTags: [],
        expectedEvidence: [],
      },
      {
        suspectId: "plst:afc-198",
        category: "mtg",
        label: "The List PLST",
        catalogSource: "scryfall",
        canonicalName: "Argentum Armor",
        setCode: "plst",
        collectorNumber: "AFC-198",
        variantTags: ["the_list"],
        expectedEvidence: [],
      },
    ]),
    category: "mtg",
    mtgListMarkInspection: {
      attempted: true,
      listMarkVisible: "yes",
      confidence: 0.9,
      cropQuality: "clear",
      inspectedRegions: [],
      evidenceNotes: [],
    },
    suspectAssessments: [
      { suspectId: "afc:198", matchScore: 0.88, supportingEvidence: [], contradictingEvidence: [], missingEvidence: [], variantRisks: [], reasoning: "", canEliminate: false, canConfirm: false },
      { suspectId: "plst:afc-198", matchScore: 0.86, supportingEvidence: [], contradictingEvidence: [], missingEvidence: [], variantRisks: [], reasoning: "", canEliminate: false, canConfirm: false },
      { suspectId: "low:3", matchScore: 0.3, supportingEvidence: [], contradictingEvidence: [], missingEvidence: [], variantRisks: [], reasoning: "", canEliminate: false, canConfirm: false },
    ],
  };
  const favored = getInspectorFavoredSuspectIds(listIdentity);
  assert(favored.includes("plst:afc-198"), "List inspector favors PLST");
  const picks = selectMarketSnapshotSuspects(listIdentity, 3);
  assert(
    picks.some((p) => p.suspect.suspectId === "plst:afc-198"),
    "PLST included in snapshot picks",
  );
  const plstPick = picks.find((p) => p.suspect.suspectId === "plst:afc-198");
  assert(
    plstPick?.reason === "inspector_favored" ||
      plstPick?.reason === "variant_trap" ||
      plstPick?.reason === "top_score",
    "PLST pick has snapshot reason",
  );

  console.log("\n8. Queue removes staff-confirmed cards");
  const unconfirmedIdentity = identityWithSuspects([GRUSHA_REVERSE, GRUSHA_NORMAL]);
  const queueCard: ScannedCard = {
    ...baseCard,
    cardFlowV2Identity: unconfirmedIdentity,
    cardFlowV2Market: candidateMarket(),
  };
  assert(Boolean(buildStaffConfirmationQueueItem(queueCard)), "unconfirmed in queue");
  const confirmedCard: ScannedCard = {
    ...queueCard,
    cardFlowV2Identity: result.cardFlowV2Identity,
    cardFlowV2OfferPreview: result.cardFlowV2OfferPreview,
  };
  assert(!buildStaffConfirmationQueueItem(confirmedCard), "confirmed leaves queue");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
