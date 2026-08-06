/**
 * Durable live audit/regression cards for Morgan and CJ Stroud.
 * Seeded to Firestore via npm run card-flow-v2:seed-regression-cards
 */
import type { ScannedCard, CardCategory as LegacyCardCategory } from "../../types";
import type { CardCandidateBundle, LockedCardIdentity, CardCategory } from "../types";
import type {
  CandidateMarketSnapshot,
  CardFlowV2MarketBundle,
} from "../market/types";
import { stubMarketSnapshotDiagnostics } from "../market/source-health";
import { computeCardOfferPreviewV2 } from "../offer/run-card-offer-preview-v2";
import { DEFAULT_STORE_SETTINGS } from "../../constants";

export const LIVE_REGRESSION_ORDER_NUMBER = "BB-V2-REGRESSION";

export const MORGAN_REGRESSION_CARD_ID =
  "c1a00005-0178-4000-8000-000000000001";
export const CJ_STROUD_REGRESSION_CARD_ID =
  "c1a00005-0339-4000-8000-000000000002";

export const LIVE_REGRESSION_CARD_IDS = [
  MORGAN_REGRESSION_CARD_ID,
  CJ_STROUD_REGRESSION_CARD_ID,
] as const;

function lockedPokemonMorgan(): LockedCardIdentity {
  return {
    locked: true,
    lockStatus: "locked",
    confidence: 0.92,
    category: "pokemon",
    canonicalName: "Morgan",
    setName: "Team Up",
    setCode: "sm9",
    collectorNumber: "178/181",
    finish: "holofoil",
    variantTags: ["holofoil"],
    requiredEvidenceSatisfied: true,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    staffMessage: "Regression fixture — Morgan Team Up 178 holofoil locked.",
  };
}

function morganSnapshot(): CandidateMarketSnapshot {
  const stub = stubMarketSnapshotDiagnostics(0);
  return {
    lockedIdentityUsed: true,
    marketProductName: "Morgan 178 Team Up holofoil",
    searchPlan: {
      planId: "morgan-regression",
      lockedIdentityUsed: true,
      category: "pokemon",
      marketProductName: "Morgan 178 Team Up",
      gradeContext: "raw",
      identityFinish: "holofoil",
      exactQueries: [],
      narrowQueries: [],
      broadQueries: [],
      requiredTerms: ["Morgan", "Team Up", "178"],
      forbiddenTerms: [],
      queryExclusionTerms: [],
      warnings: [],
    },
    rawComps: [],
    compAssessments: [],
    acceptedComps: [],
    rejectedComps: [],
    maybeComps: [],
    confidence: "low",
    pricingMethod: "price_signal_disagreement",
    warnings: ["TCGplayer and PriceCharting disagree — do not blend."],
    tcgplayerMapping: {
      attempted: true,
      availableVariantNames: ["holofoil"],
      variantsFound: ["holofoil"],
      marketPrice: 49.93,
      selectedVariantName: "holofoil",
    },
    priceChartingMapping: {
      attempted: true,
      tierSelected: "Ungraded",
      tiersExcluded: [],
      loosePrice: 18.48,
      warnings: [],
    },
    ...stub,
    marketOutcome: {
      ...stub.marketOutcome,
      pricingSignals: 2,
      summaryLabel: "pricing signals disagree",
      pricingSignalDetails: [
        { source: "tcgplayer", label: "holofoil", price: 49.93 },
        { source: "pricecharting", label: "Ungraded", price: 18.48 },
      ],
    },
  };
}

function cjStroudIdentity(): CardCandidateBundle {
  const suspect = {
    suspectId: "sports:2023-prizm-339:silver",
    category: "sports" as const,
    label: "CJ Stroud Silver Prizm 339",
    catalogSource: "pricecharting" as const,
    canonicalName: "CJ Stroud",
    setName: "2023 Panini Prizm",
    collectorNumber: "339",
    finish: "silver",
    variantTags: ["prizm", "silver", "rookie"],
    expectedEvidence: [],
  };
  return {
    category: "sports",
    suspects: [suspect],
    suspectAssessments: [],
    lockedIdentity: {
      locked: false,
      lockStatus: "not_locked_variant_uncertainty",
      confidence: 0.55,
      category: "sports",
      canonicalName: "CJ Stroud",
      variantTags: ["silver prizm"],
      requiredEvidenceSatisfied: false,
      missingRequiredEvidence: ["parallel_confirmation"],
      unresolvedVariantRisks: ["Silver Prizm parallel unresolved"],
      staffMessage: "Regression fixture — staff-confirmed Silver Prizm with parallel caution.",
    },
    staffSelection: {
      suspectId: suspect.suspectId,
      confirmedAt: new Date().toISOString(),
      confirmedBy: "regression-fixture",
      fingerprint: {
        category: "sports",
        catalogSource: "pricecharting",
        canonicalName: "CJ Stroud",
        setName: "2023 Panini Prizm",
        collectorNumber: "339",
        finish: "silver",
      },
      confirmedImageUrls: {
        front: "https://example.com/regression/cj-stroud-front.jpg",
      },
    },
    candidateGenerationNotes: ["Live regression fixture"],
    createdAt: new Date().toISOString(),
  };
}

function cjStroudSnapshot(): CandidateMarketSnapshot {
  const stub = stubMarketSnapshotDiagnostics(0);
  return {
    lockedIdentityUsed: false,
    marketProductName: "CJ Stroud Silver Prizm #339",
    searchPlan: {
      planId: "cj-stroud-regression",
      lockedIdentityUsed: false,
      category: "sports",
      marketProductName: "CJ Stroud Silver Prizm",
      gradeContext: "raw",
      exactQueries: [],
      narrowQueries: [],
      broadQueries: [],
      requiredTerms: ["CJ Stroud", "Prizm", "339"],
      forbiddenTerms: [],
      queryExclusionTerms: [],
      warnings: ["Parallel unresolved"],
    },
    rawComps: [],
    compAssessments: [],
    acceptedComps: [],
    rejectedComps: [],
    maybeComps: [],
    confidence: "none",
    pricingMethod: "active_listings_only_sanity_check",
    warnings: ["Active listings only — not sold value."],
    ...stub,
    marketOutcome: {
      acceptedSoldComps: 0,
      maybeListings: 8,
      rejectedListings: 2,
      pricingSignals: 0,
      summaryLabel: "active listings sanity check only — no sold comps",
    },
    sourceHealth: [
      {
        source: "ebay_sold",
        attempted: true,
        httpStatus: 403,
        rawResultCount: 0,
        normalizedResultCount: 0,
        acceptedCount: 0,
        maybeCount: 0,
        rejectedCount: 0,
        priceSignalsFound: 0,
        fatalError: "authorization_or_scope_failure",
        warnings: [],
      },
      {
        source: "ebay_active",
        attempted: true,
        httpStatus: 200,
        rawResultCount: 8,
        normalizedResultCount: 8,
        acceptedCount: 0,
        maybeCount: 8,
        rejectedCount: 0,
        priceSignalsFound: 0,
        warnings: [],
      },
    ],
  };
}

function toLegacyCategory(category: CardCategory): LegacyCardCategory {
  if (category === "mtg") return "magic";
  if (category === "pokemon" || category === "sports" || category === "yugioh") {
    return category;
  }
  return "other";
}

function baseFixtureCard(
  id: string,
  name: string,
  identity: CardCandidateBundle,
  market: CardFlowV2MarketBundle,
): ScannedCard {
  const card: ScannedCard = {
    id,
    orderId: "regression-order-placeholder",
    frontImageUrl: "https://example.com/regression/front.jpg",
    backImageUrl: "",
    itemType: "raw",
    detectedName: name,
    category: toLegacyCategory(identity.category),
    status: "manual_review",
    marketPrice: 0,
    cashOffer: 0,
    tradeOffer: 0,
    cardFlowV2Identity: identity,
    cardFlowV2Market: market,
    createdAt: new Date().toISOString(),
  };
  card.cardFlowV2OfferPreview = computeCardOfferPreviewV2({
    card,
    identity,
    market,
    settings: { id: "regression", ...DEFAULT_STORE_SETTINGS },
    rules: [],
  });
  return card;
}

export function buildMorganRegressionCard(): ScannedCard {
  const identity: CardCandidateBundle = {
    category: "pokemon",
    suspects: [],
    suspectAssessments: [],
    lockedIdentity: lockedPokemonMorgan(),
    candidateGenerationNotes: ["Live regression fixture"],
    createdAt: new Date().toISOString(),
  };
  const market: CardFlowV2MarketBundle = {
    mode: "locked_identity_market",
    lockedIdentityStatus: "locked",
    snapshots: [morganSnapshot()],
    recommendedStaffAction: "Source disagreement — staff review required.",
    warnings: [],
    createdAt: new Date().toISOString(),
  };
  return baseFixtureCard(
    MORGAN_REGRESSION_CARD_ID,
    "Morgan",
    identity,
    market,
  );
}

export function buildCjStroudRegressionCard(): ScannedCard {
  const identity = cjStroudIdentity();
  const market: CardFlowV2MarketBundle = {
    mode: "staff_confirmed_identity_market",
    lockedIdentityStatus: "not_locked_variant_uncertainty",
    selectedSuspectId: "sports:2023-prizm-339:silver",
    snapshots: [cjStroudSnapshot()],
    recommendedStaffAction: "Verify Silver Prizm parallel before pricing.",
    warnings: ["Sports parallel uncertainty"],
    createdAt: new Date().toISOString(),
  };
  return baseFixtureCard(
    CJ_STROUD_REGRESSION_CARD_ID,
    "CJ Stroud",
    identity,
    market,
  );
}

export function getLiveRegressionFixtureCards(): ScannedCard[] {
  return [buildMorganRegressionCard(), buildCjStroudRegressionCard()];
}

/** Merge stored cards with fixtures (fixtures fill gaps for audit). */
export function mergeLiveRegressionFixtures(
  cards: ScannedCard[],
): ScannedCard[] {
  const byId = new Map(cards.map((c) => [c.id, c]));
  for (const fixture of getLiveRegressionFixtureCards()) {
    if (!byId.has(fixture.id)) {
      byId.set(fixture.id, fixture);
    }
  }
  return [...byId.values()];
}

export function isLiveRegressionFixtureId(id: string): boolean {
  return (LIVE_REGRESSION_CARD_IDS as readonly string[]).includes(id);
}
