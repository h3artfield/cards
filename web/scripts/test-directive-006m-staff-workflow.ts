/**
 * Directive 006M — V2 primary staff workflow tests.
 * Run: npm run test:directive-006m-staff-workflow
 */
import { runCardAuditV2 } from "../src/lib/card-flow-v2/audit/run-card-audit-v2";
import { applyStaffConfirmPricingRefresh } from "../src/lib/card-flow-v2/staff-confirm-pricing";
import { applyStaffSuspectSelection, applyManualStaffPrintingEntry, appendManualSuspect } from "../src/lib/card-flow-v2/staff-suspect-selection";
import { applyStaffConfirmedVariantResolution } from "../src/lib/card-flow-v2/variant-uncertainty";
import { assertPreviewDoesNotMutateProduction } from "../src/lib/card-flow-v2/offer/v2-offer-preview";
import { buildMorganRegressionCard } from "../src/lib/card-flow-v2/regression/live-audit-fixtures";
import {
  buildCardFlowV2VersionMetadata,
  CURRENT_V2_POLICY,
  detectStaleV2Metadata,
  stampCardFlowV2Bundles,
} from "../src/lib/card-flow-v2/version-metadata";
import { resolveV2ReviewStatus } from "../src/lib/card-flow-v2/v2-review-status";
import { buildV2ReviewQueue } from "../src/lib/card-flow-v2/v2-review-queue";
import type { CardSuspect } from "../src/lib/card-flow-v2/types";
import type { CardFlowV2MarketBundle, CandidateMarketSnapshot } from "../src/lib/card-flow-v2/market/types";
import { stubMarketSnapshotDiagnostics } from "../src/lib/card-flow-v2/market/source-health";
import type { ScannedCard } from "../src/lib/types";
import { DEFAULT_STORE_SETTINGS } from "../src/lib/constants";

process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
process.env.CARD_FLOW_V2_MARKET_ENABLED = "true";
process.env.CARD_FLOW_V2_AUDIT_ENABLED = "true";
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";
process.env.CARD_FLOW_V2_STAFF_CONFIRMATION_ENABLED = "true";

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
  suspectId: "pokemon:grusha:184:reverse",
  category: "pokemon",
  label: "Grusha 184 reverse holo",
  catalogSource: "pokemon_tcg",
  canonicalName: "Grusha",
  collectorNumber: "184",
  finish: "reverse_holo",
  variantTags: ["reverse_holo"],
  expectedEvidence: [],
};

const GRUSHA_NORMAL: CardSuspect = {
  suspectId: "pokemon:grusha:184:normal",
  category: "pokemon",
  label: "Grusha 184 normal",
  catalogSource: "pokemon_tcg",
  canonicalName: "Grusha",
  collectorNumber: "184",
  finish: "normal",
  variantTags: ["normal"],
  expectedEvidence: [],
};

function grushaSnapshot(suspectId: string): CandidateMarketSnapshot {
  const stub = stubMarketSnapshotDiagnostics(0);
  return {
    suspectId,
    lockedIdentityUsed: false,
    marketProductName: "Grusha reverse holo",
    searchPlan: {
      planId: "grusha",
      lockedIdentityUsed: false,
      category: "pokemon",
      marketProductName: "Grusha",
      gradeContext: "raw",
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
    confidence: "medium",
    pricingMethod: "tcgplayer_pricecharting_blend",
    warnings: [],
    tcgplayerMapping: {
      attempted: true,
      availableVariantNames: ["reverse holofoil"],
      variantsFound: ["reverse holofoil"],
      marketPrice: 0.13,
      selectedVariantName: "reverse holofoil",
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
      summaryLabel: "TCGplayer + PriceCharting blend",
    },
  };
}

function withCurrentMetadata(card: ScannedCard): ScannedCard {
  const category = card.category ?? card.cardFlowV2Identity?.category;
  const meta = buildCardFlowV2VersionMetadata(category);
  const interim: ScannedCard = { ...card, cardFlowV2VersionMetadata: meta };
  const audit = runCardAuditV2({ card: interim });
  const stamped = stampCardFlowV2Bundles(
    {
      evidence: card.cardFlowV2Evidence,
      identity: card.cardFlowV2Identity,
      market: card.cardFlowV2Market,
      audit,
      offerPreview: card.cardFlowV2OfferPreview,
    },
    category,
  );
  return {
    ...interim,
    cardFlowV2VersionMetadata: stamped.cardFlowV2VersionMetadata,
    cardFlowV2Evidence: stamped.evidence ?? card.cardFlowV2Evidence,
    cardFlowV2Identity: stamped.identity ?? card.cardFlowV2Identity,
    cardFlowV2Market: stamped.market ?? card.cardFlowV2Market,
    cardFlowV2Audit: stamped.audit,
    cardFlowV2OfferPreview: stamped.offerPreview ?? card.cardFlowV2OfferPreview,
  };
}

function tyrannosaurusCard(): ScannedCard {
  return {
    id: "579ba1f4-6106-4716-9c94-a0130be39ea3",
    orderId: "49e5b55e-fc9d-4bcf-b505-fda9976f880d",
    frontImageUrl: "https://example.com/f.jpg",
    backImageUrl: "",
    itemType: "raw",
    detectedName: "Ravenous Tyrannosaurus",
    category: "magic",
    marketPrice: 49.99,
    cashOffer: 25,
    tradeOffer: 32.49,
    status: "approved",
    pricingJson: { source: "pricecharting" },
    cardFlowV2Identity: {
      category: "mtg",
      suspects: [
        {
          suspectId: "scryfall:mar-93",
          category: "mtg",
          label: "Ravenous Tyrannosaurus · MAR · #93",
          catalogSource: "scryfall",
          setCode: "MAR",
          collectorNumber: "93",
          variantTags: [],
          expectedEvidence: [],
        },
      ],
      suspectAssessments: [],
      lockedIdentity: {
        locked: false,
        lockStatus: "not_locked_variant_uncertainty",
        confidence: 0.9,
        category: "mtg",
        setCode: "MAR",
        collectorNumber: "93",
        variantTags: [],
        requiredEvidenceSatisfied: true,
        missingRequiredEvidence: [],
        unresolvedVariantRisks: [],
        staffMessage: "Staff confirmed MAR #93",
      },
      staffSelection: { suspectId: "scryfall:mar-93", confirmedAt: new Date().toISOString() },
      candidateGenerationNotes: [],
      createdAt: new Date().toISOString(),
    },
    cardFlowV2Market: {
      mode: "staff_confirmed_identity_market",
      lockedIdentityStatus: "not_locked_variant_uncertainty",
      selectedSuspectId: "scryfall:mar-93",
      snapshots: [
        {
          suspectId: "scryfall:mar-93",
          lockedIdentityUsed: true,
          marketProductName: "Ravenous MAR #93",
          searchPlan: {} as never,
          rawComps: [],
          compAssessments: [],
          acceptedComps: [],
          rejectedComps: [],
          maybeComps: [],
          valueMedian: 7.91,
          confidence: "low",
          pricingMethod: "price_signal_only",
          warnings: [],
          sourceHealth: [],
          queryAudits: [],
          marketOutcome: { pricingSignals: 1, summaryLabel: "Scryfall" } as never,
          priceChartingMapping: {
            attempted: true,
            reasonIfSkipped: "pricecharting_product_identity_mismatch",
            identityMismatch: {
              expectedSetCode: "MAR",
              expectedCollectorNumber: "93",
              priceChartingTitle: "Ravenous Tyrannosaurus [Borderless] #18",
              parsedCollectorNumber: "18",
              reason: "collector_number_mismatch",
            },
            tiersExcluded: [],
            warnings: [],
          },
        },
      ],
      recommendedStaffAction: "Review production price",
      warnings: [],
      createdAt: new Date().toISOString(),
    },
    cardFlowV2OfferPreview: {
      enabled: true,
      eligible: false,
      recommendedAction: "staff_review_required",
      createdAt: new Date().toISOString(),
      marketDecision: {
        usableForOfferPreview: false,
        basis: "scryfall_print_price",
        marketValue: 7.91,
        confidence: "low",
        blockers: [],
        warnings: [],
        sourceValues: [],
        explanation: "",
      },
    },
    createdAt: new Date().toISOString(),
  };
}

async function buildGrushaCard(): Promise<ScannedCard> {
  let identity = applyStaffSuspectSelection(
    {
      category: "pokemon",
      suspects: [GRUSHA_REVERSE, GRUSHA_NORMAL],
      suspectAssessments: [],
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
    },
    { suspectId: GRUSHA_REVERSE.suspectId, confirmedBy: "staff@test.com" },
  );
  identity = applyStaffConfirmedVariantResolution(identity);
  const market: CardFlowV2MarketBundle = {
    mode: "candidate_market_comparison",
    lockedIdentityStatus: "manual_review_recommended",
    identitySource: "candidate",
    snapshots: [
      grushaSnapshot(GRUSHA_REVERSE.suspectId),
      grushaSnapshot(GRUSHA_NORMAL.suspectId),
    ],
    recommendedStaffAction: "Pick printing",
    warnings: [],
    createdAt: new Date().toISOString(),
  };
  const base: ScannedCard = {
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
  const result = await applyStaffConfirmPricingRefresh({
    card: base,
    identity,
    market,
    settings: { id: "test", ...DEFAULT_STORE_SETTINGS },
    rules: [],
    confirmedBy: "staff@test.com",
  });
  return withCurrentMetadata({
    ...base,
    cardFlowV2Identity: result.cardFlowV2Identity,
    cardFlowV2Market: result.cardFlowV2Market,
    cardFlowV2Audit: result.cardFlowV2Audit,
    cardFlowV2OfferPreview: result.cardFlowV2OfferPreview,
  });
}

async function main() {
  console.log("Directive 006M — V2 primary staff workflow\n");

  console.log("1. V2 version metadata is written on each bundle");
  {
    const meta = buildCardFlowV2VersionMetadata("mtg");
    const stamped = stampCardFlowV2Bundles(
      {
        evidence: {
          ranAt: new Date().toISOString(),
          imageEvidence: {} as never,
          categoryClassification: {} as never,
          detectiveGuide: {} as never,
        },
        identity: { category: "mtg" } as never,
        market: { mode: "no_market_run" } as never,
        audit: { cardId: "x" } as never,
        offerPreview: { enabled: true } as never,
      },
      "mtg",
    );
    assert(meta.directiveVersion === "006M", "directiveVersion 006M");
    assert(
      meta.marketPolicyVersion === "006K-pricecharting-identity-enforcement",
      "marketPolicyVersion 006K",
    );
    assert(
      meta.auditPolicyVersion === "006L-pricing-safety",
      "auditPolicyVersion 006L",
    );
    assert(
      stamped.evidence?.versionMetadata?.directiveVersion === "006M",
      "evidence bundle stamped",
    );
    assert(
      stamped.identity?.versionMetadata?.directiveVersion === "006M",
      "identity bundle stamped",
    );
    assert(
      stamped.market?.versionMetadata?.directiveVersion === "006M",
      "market bundle stamped",
    );
    assert(
      stamped.audit?.versionMetadata?.directiveVersion === "006M",
      "audit bundle stamped",
    );
    assert(
      stamped.offerPreview?.versionMetadata?.directiveVersion === "006M",
      "offer preview stamped",
    );
  }

  console.log("\n2. Cards processed before current policy version are marked stale");
  {
    const staleMeta = {
      ...buildCardFlowV2VersionMetadata("mtg"),
      marketPolicyVersion: "006J-old",
    };
    const stale = detectStaleV2Metadata(staleMeta);
    assert(stale.stale === true, "stale when market policy old");
    assert(stale.staleFields.includes("marketPolicyVersion"), "marketPolicyVersion flagged");

    const card: ScannedCard = {
      ...tyrannosaurusCard(),
      cardFlowV2VersionMetadata: staleMeta,
    };
    const audit = runCardAuditV2({ card });
    assert(
      audit.issues.includes("stale_v2_reprocess_recommended"),
      "audit includes stale_v2_reprocess_recommended",
    );
  }

  console.log("\n3–6. V2 review status for Ravenous, Grusha, Morgan");
  {
    const ravenousUnconfirmed = withCurrentMetadata({
      ...tyrannosaurusCard(),
      cardFlowV2Identity: {
        ...tyrannosaurusCard().cardFlowV2Identity!,
        staffSelection: undefined,
      },
    });
    const ravenousUnconfirmedStatus = resolveV2ReviewStatus({
      card: ravenousUnconfirmed,
    });
    assert(
      ravenousUnconfirmedStatus === "v2_production_price_warning",
      "Ravenous without staff confirm gets v2_production_price_warning",
    );

    const ravenousConfirmed = withCurrentMetadata(tyrannosaurusCard());
    const ravenousConfirmedStatus = resolveV2ReviewStatus({
      card: ravenousConfirmed,
    });
    assert(
      ravenousConfirmedStatus === "v2_staff_confirmed_blocked",
      "Ravenous with staff confirm skips stale V1 production warning",
    );

    const ravenousReady = withCurrentMetadata({
      ...tyrannosaurusCard(),
      cardFlowV2OfferPreview: {
        ...tyrannosaurusCard().cardFlowV2OfferPreview!,
        eligible: true,
        recommendedAction: "staff_confirmed_preview_ready",
      },
    });
    assert(
      resolveV2ReviewStatus({ card: ravenousReady }) === "v2_staff_confirmed_ready",
      "Ravenous staff confirmed + eligible is ready (not production warning)",
    );

    const grusha = await buildGrushaCard();
    const grushaStatus = resolveV2ReviewStatus({ card: grusha });
    assert(
      grushaStatus === "v2_staff_confirmed_ready",
      "Grusha gets v2_staff_confirmed_ready",
    );

    const morgan = withCurrentMetadata(buildMorganRegressionCard());
    const morganStatus = resolveV2ReviewStatus({ card: morgan });
    assert(
      morganStatus === "v2_source_disagreement",
      "Morgan gets v2_source_disagreement",
    );
  }

  console.log("\n7. Review queue includes pricing warnings and source disagreement");
  {
    const queue = buildV2ReviewQueue(
      [withCurrentMetadata(tyrannosaurusCard()), withCurrentMetadata(buildMorganRegressionCard())],
      { [tyrannosaurusCard().orderId]: "ORD-1", [buildMorganRegressionCard().orderId]: "ORD-2" },
    );
    assert(queue.length >= 2, "queue has at least 2 items");
    const ravenousItem = queue.find((q) => q.name?.includes("Ravenous"));
    const morganItem = queue.find((q) => q.name === "Morgan");
    assert(
      ravenousItem?.reasons.includes("v1_possible_wrong_pricecharting_mapping") === true,
      "Ravenous in queue with production warning reason",
    );
    assert(
      morganItem?.reasons.includes("source_disagreement") === true,
      "Morgan in queue with source_disagreement",
    );
  }

  console.log("\n8. V2 workflows do not mutate production fields");
  {
    const card = tyrannosaurusCard();
    const before = assertPreviewDoesNotMutateProduction(card);
    assert(before.marketPrice === 49.99, "marketPrice snapshot");
    assert(before.status === "approved", "status snapshot");
    const grushaResult = await applyStaffConfirmPricingRefresh({
      card,
      identity: card.cardFlowV2Identity!,
      market: undefined,
      settings: { id: "test", ...DEFAULT_STORE_SETTINGS },
      rules: [],
    });
    assert(grushaResult.productionUnchanged === true, "staff confirm productionUnchanged");
    assert(
      grushaResult.productionFields.marketPrice === 49.99,
      "marketPrice unchanged after refresh",
    );
  }

  console.log("\n9. Manual printing entry appends suspect and confirms");
  {
    const base = tyrannosaurusCard().cardFlowV2Identity!;
    const { identity: withManual, suspectId } = appendManualSuspect(base, {
      name: "Custom Card",
      setCode: "TST",
      cardNumber: "42",
      finish: "foil",
    });
    assert(withManual.suspects.some((s) => s.suspectId === suspectId), "manual suspect added");
    assert(
      withManual.suspects.find((s) => s.suspectId === suspectId)?.label.includes("Custom Card") === true,
      "manual label includes name",
    );

    const confirmed = applyManualStaffPrintingEntry(base, {
      name: "Hand Entered",
      setCode: "ABC",
      cardNumber: "1",
      finish: "nonfoil",
      confirmedBy: "staff@test.com",
    });
    assert(
      confirmed.staffSelection?.suspectId?.startsWith("manual-") === true,
      "manual entry sets staff selection",
    );
  }

  console.log("\n10. Current policy metadata matches directive minimums");
  {
    assert(CURRENT_V2_POLICY.directiveVersion === "006M", "CURRENT directive 006M");
    assert(
      CURRENT_V2_POLICY.offerPreviewPolicyVersion === "006J-pricing-readiness",
      "offer preview 006J",
    );
    assert(
      CURRENT_V2_POLICY.knowledgeVersions.riftbound === "006G-riftbound-knowledge",
      "riftbound knowledge 006G",
    );
  }

  console.log("\n11. Fresh metadata is not stale");
  {
    const fresh = detectStaleV2Metadata(buildCardFlowV2VersionMetadata("pokemon"));
    assert(fresh.stale === false, "fresh metadata not stale");
  }

  console.log(`\n006M staff workflow: ${failed === 0 ? "ALL PASS" : `${failed} FAILED`}`);
  console.log(`  ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
