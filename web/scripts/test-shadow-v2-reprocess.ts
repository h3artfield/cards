/**
 * Directive 006E — shadow V2 reprocess + variant resolution tests.
 * Run: npm run test:shadow-v2-reprocess
 */
import {
  compareProductionFields,
  reprocessCardV2ShadowOnly,
  snapshotProductionFields,
} from "../src/lib/card-flow-v2/shadow-v2-reprocess";
import { applyStaffSuspectSelection } from "../src/lib/card-flow-v2/staff-suspect-selection";
import { applyStaffConfirmationPreservation } from "../src/lib/card-flow-v2/staff-confirmation-preservation";
import { buildV2OfferPreview } from "../src/lib/card-flow-v2/offer/v2-offer-preview";
import { buildMarketValueDecision } from "../src/lib/card-flow-v2/offer/market-value-decision";
import {
  applyStaffConfirmedVariantResolution,
  resolveVariantUncertaintyStatus,
} from "../src/lib/card-flow-v2/variant-uncertainty";
import { buildMorganRegressionCard } from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import { stubMarketSnapshotDiagnostics } from "../src/lib/card-flow-v2/market/source-health";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";
import type { ScannedCard } from "../src/lib/types";
import type { CardCandidateBundle, CardSuspect } from "../src/lib/card-flow-v2/types";
import type { CardFlowV2MarketBundle, CandidateMarketSnapshot } from "../src/lib/card-flow-v2/market/types";

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
process.env.CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED = "true";
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";

const GRUSHA_REVERSE: CardSuspect = {
  suspectId: "pokemon_tcg:sv2-184:reverse_holo",
  category: "pokemon",
  label: "Grusha 184 reverse holo",
  catalogSource: "pokemon_tcg",
  canonicalName: "Grusha",
  setCode: "sv2",
  collectorNumber: "184",
  finish: "reverse_holo",
  variantTags: ["reverse_holo"],
  expectedEvidence: [],
};

function baseCard(overrides: Partial<ScannedCard> = {}): ScannedCard {
  return {
    id: "c1",
    orderId: "o1",
    frontImageUrl: "https://example.com/f.jpg",
    backImageUrl: "",
    itemType: "raw",
    status: "processed",
    marketPrice: 0.13,
    cashOffer: 0.25,
    tradeOffer: 0.25,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function grushaSnapshot(): CandidateMarketSnapshot {
  const stub = stubMarketSnapshotDiagnostics(0);
  return {
    suspectId: GRUSHA_REVERSE.suspectId,
    lockedIdentityUsed: true,
    marketProductName: "Grusha",
    searchPlan: {
      planId: "g1",
      suspectId: GRUSHA_REVERSE.suspectId,
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
      pricingSignalDetails: [
        { source: "tcgplayer", label: "reverseHolofoil", price: 0.13 },
        { source: "pricecharting", label: "Ungraded", price: 0.12 },
      ],
    },
  };
}

async function main() {
  console.log("Shadow V2 reprocess tests\n");

  console.log("1–4. Production field snapshot guard");
  const before = { marketPrice: 0.13, cashOffer: 0.25, tradeOffer: 0.25, status: "processed" as const };
  const after = { ...before, cashOffer: 1 };
  const mut = compareProductionFields(before, after);
  assert(mut.changed && mut.fields[0]?.field === "cashOffer", "detects cashOffer mutation");

  console.log("\n5. Staff-confirmed variant resolved");
  let identity: CardCandidateBundle = {
    category: "pokemon",
    suspects: [GRUSHA_REVERSE],
    suspectAssessments: [],
    lockedIdentity: {
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      confidence: 0.5,
      category: "pokemon",
      canonicalName: "Grusha",
      variantTags: [],
      requiredEvidenceSatisfied: false,
      missingRequiredEvidence: [],
      unresolvedVariantRisks: ["finish uncertain"],
      staffMessage: "test",
    },
    candidateGenerationNotes: [],
    createdAt: new Date().toISOString(),
  };
  identity = applyStaffSuspectSelection(identity, {
    suspectId: GRUSHA_REVERSE.suspectId,
    confirmedBy: "test",
    imageRefs: { frontImageUrl: "https://example.com/f.jpg", backImageUrl: "" },
  });
  identity = applyStaffConfirmedVariantResolution(identity);
  assert(
    identity.variantUncertaintyStatus === "resolved_by_staff_confirmation",
    "variant resolved by staff",
  );
  assert(
    (identity.historicalVariantUncertainty?.length ?? 0) > 0,
    "historical uncertainty preserved",
  );

  console.log("\n6. Variant status blocks preview when unresolved");
  const unresolved = resolveVariantUncertaintyStatus({
    identity: {
      ...identity,
      staffSelection: undefined,
      variantUncertaintyStatus: undefined,
    },
    evidence: {
      ranAt: new Date().toISOString(),
      imageEvidence: {
        identificationMode: "continue_with_variant_uncertainty",
      } as never,
      categoryClassification: {} as never,
      detectiveGuide: {} as never,
    },
  });
  assert(unresolved === "unresolved", "unresolved when no staff confirm");

  console.log("\n7. Offer preview action staff_confirmed_preview_ready");
  const market: CardFlowV2MarketBundle = {
    mode: "staff_confirmed_identity_market",
    lockedIdentityStatus: "not_locked_variant_uncertainty",
    selectedSuspectId: GRUSHA_REVERSE.suspectId,
    snapshots: [grushaSnapshot()],
    recommendedStaffAction: "",
    warnings: [],
    createdAt: new Date().toISOString(),
  };
  const card = baseCard({
    cardFlowV2Identity: identity,
    cardFlowV2Market: market,
  });
  const settings = { id: "t", ...DEFAULT_STORE_SETTINGS };
  const md = buildMarketValueDecision({
    identity,
    market,
    itemType: "raw",
  });
  const preview = buildV2OfferPreview({
    card,
    decision: md,
    settings,
    rules: [],
    identity,
    market,
  });
  assert(
    preview.recommendedAction === "staff_confirmed_preview_ready" ||
      preview.recommendedAction === "eligible_for_future_guarded_offer",
    "not staff_review solely for resolved variant",
  );
  assert(!md.blockers.includes("variant_uncertainty"), "no variant blocker when staff resolved");

  console.log("\n8. Morgan still blocked on source_disagreement");
  const morgan = buildMorganRegressionCard();
  const morganMd = buildMarketValueDecision({
    identity: morgan.cardFlowV2Identity,
    market: morgan.cardFlowV2Market,
    itemType: morgan.itemType,
  });
  assert(
    morganMd.blockers.includes("source_disagreement"),
    "Morgan source_disagreement",
  );

  console.log("\n10. CJ Stroud sports parallel still blocks");
  const { buildCjStroudRegressionCard } = await import(
    "../src/lib/card-flow-v2/regression/live-audit-fixtures"
  );
  const cj = buildCjStroudRegressionCard();
  const cjMd = buildMarketValueDecision({
    identity: cj.cardFlowV2Identity,
    market: cj.cardFlowV2Market,
    evidence: cj.cardFlowV2Evidence,
    itemType: cj.itemType,
  });
  assert(
    cjMd.blockers.includes("sports_parallel_uncertainty") ||
      cjMd.blockers.includes("active_only"),
    "CJ Stroud still blocked",
  );

  console.log("\n9. Preservation keeps staff + variant resolution");
  const prevIdentity = identity;
  const preserved = await applyStaffConfirmationPreservation({
    previousIdentity: prevIdentity,
    identity: {
      ...identity,
      staffSelection: undefined,
      suspects: [GRUSHA_REVERSE],
    },
    market,
    imageRefs: { frontImageUrl: "https://example.com/f.jpg", backImageUrl: "" },
  });
  assert(
    preserved.identity?.staffSelection?.suspectId === GRUSHA_REVERSE.suspectId,
    "preserved staff selection",
  );
  assert(
    preserved.identity?.variantUncertaintyStatus === "resolved_by_staff_confirmation",
    "variant still resolved after preserve",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
