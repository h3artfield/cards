/**
 * Directive 010 — Japanese Pokémon version picker fallback.
 * Run: npm run test:directive-010-jp-pokemon-fallback
 */
import {
  buildScanDerivedPokemonSuspect,
  ensurePokemonScanDerivedFallback,
  evidenceToManualEntryDefaults,
  extractPokemonScanIdentity,
  filterJapaneseCatalogSuspects,
  hasMinimumPokemonPickerEvidence,
  isExactJapanesePokemonPriceChartingMatch,
  shouldInjectScanDerivedPokemon,
  suspectBlocksTcgplayerPricing,
} from "../src/lib/card-flow-v2/pokemon-japanese-fallback";
import { buildSuspectPickerRows } from "../src/lib/card-flow-v2/staff-suspect-selection";
import { resolveClerkScanIdentityDisplay } from "../src/lib/card-flow-v2/clerk-scan-identity-display";
import { resolveClerkDisplayOffers } from "../src/lib/card-flow-v2/clerk-card-insights";
import { staffEditOffersForCondition } from "../src/lib/card-flow-v2/staff-edit-condition-ladder";
import { buildTcgplayerProductUrl } from "../src/lib/card-flow-v2/market/tcgplayer-product-url";
import { suspectBlocksTcgplayerPricingFromPlan } from "../src/lib/card-flow-v2/market/tcgplayer-japanese-guard";
import { buildSuspectSearchPlan } from "../src/lib/card-flow-v2/market/search-plan-builder";
import { buildPokemonQueries } from "../src/lib/processing/catalog-pricing";
import {
  pokemonJapaneseNameToEnglish,
  pokemonNumbersMatch,
  pokemonSetIdsForPrintedTotal,
  pokemonSetIdsFromVision,
} from "../src/lib/processing/pokemon-utils";
import { scoreSuspectDeterministic } from "../src/lib/card-flow-v2/suspect-matcher";
import { getDetectiveGuide } from "../src/lib/card-flow-v2/detective-guides";
import { buildMarketValueDecision } from "../src/lib/card-flow-v2/offer/market-value-decision";
import type { CardCandidateBundle, ImageEvidenceReport } from "../src/lib/card-flow-v2/types";
import type { VisionResult } from "../src/lib/types";

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

function bb000006Evidence(): ImageEvidenceReport {
  return {
    identificationMode: "continue_with_variant_uncertainty",
    evidenceSlots: [
      { field: "card_name", value: "コータス", status: "observed", confidence: 0.92 },
      { field: "set_name", value: "Crimson Haze", status: "observed", confidence: 0.9 },
      { field: "set_code", value: "SV5a", status: "observed", confidence: 0.88 },
      {
        field: "collector_number",
        value: "069/066",
        status: "observed",
        confidence: 0.9,
      },
      { field: "language", value: "jp", status: "observed", confidence: 0.95 },
    ],
  } as ImageEvidenceReport;
}

console.log("\nDirective 010 — Japanese Pokémon fallback\n");

console.log("Set mapping");
assert(pokemonSetIdsForPrintedTotal(66).includes("sv5a"), "066 → sv5a mapping");
const vision: VisionResult = {
  category: "pokemon",
  confidence: 0.9,
  itemType: "raw",
  conditionEstimate: "NM",
  cardName: "コータス",
  setName: "Crimson Haze",
  setCode: "SV5a",
  cardNumber: "069/066",
};
assert(
  pokemonSetIdsFromVision(vision).includes("sv5a"),
  "pokemonSetIdsFromVision includes sv5a from set code + denominator",
);
const conflictingVision: VisionResult = {
  ...vision,
  setName: "Chilling Reign",
};
const conflictingIds = pokemonSetIdsFromVision(conflictingVision);
assert(
  conflictingIds.includes("sv5a") && !conflictingIds.includes("swsh6"),
  "explicit sv5a set code blocks Chilling Reign swsh6 inference",
);

console.log("\nNumber matching");
assert(
  pokemonNumbersMatch("069/066", "69/066"),
  "full slash match",
);
assert(
  !pokemonNumbersMatch("069/066", "69/198"),
  "denominator mismatch rejects Chilling Reign #69",
);

console.log("\nName aliases");
assert(
  pokemonJapaneseNameToEnglish("コータス") === "Torkoal",
  "コータス → Torkoal alias",
);
const queries = buildPokemonQueries(vision);
assert(
  queries.some((q) => q.includes("Torkoal") && q.includes("sv5a")),
  "buildPokemonQueries uses English alias + sv5a",
);
assert(
  !queries.some((q) => q.includes("コータス")),
  "buildPokemonQueries skips non-Latin name-only query",
);

console.log("\nScan identity extraction (BB-000006)");
const ev = bb000006Evidence();
assert(hasMinimumPokemonPickerEvidence(ev), "minimum picker evidence present");
const scan = extractPokemonScanIdentity(ev);
assert(scan?.displayName === "Torkoal", "displayName is Torkoal");
assert(scan?.nativeName === "コータス", "nativeName preserved");
assert(scan?.setCode === "SV5A", "set code normalized");
assert(scan?.collectorNumber === "069/066", "collector number preserved");
assert(scan?.language === "jp", "language jp");

console.log("\nName contradiction eliminates Inkay");
const guide = getDetectiveGuide("pokemon");
const inkayAssessment = scoreSuspectDeterministic(
  {
    suspectId: "inkay",
    category: "pokemon",
    label: "Inkay · Chilling Reign · 69",
    canonicalName: "Inkay",
    catalogSource: "pokemon_tcg",
    setCode: "swsh6",
    collectorNumber: "69",
    variantTags: [],
    expectedEvidence: [],
  },
  ev,
  guide,
);
assert(inkayAssessment.canEliminate, "Inkay eliminated when scan says Torkoal");
assert(inkayAssessment.matchScore < 0.2, "Inkay score collapsed");

console.log("\nScan-derived suspect");
const built = buildScanDerivedPokemonSuspect(scan!, "manual_price_required");
assert(
  built.suspect.catalogSource === "scan_derived_fallback",
  "catalogSource scan_derived_fallback",
);
assert(built.suspect.label.includes("Torkoal"), "label includes English name");
assert(built.suspect.label.includes("コータス"), "label includes Japanese name");
assert(built.suspect.label.includes("Crimson Haze"), "label includes set");
assert(built.suspect.label.includes("069/066"), "label includes number");
assert(built.assessment.canConfirm, "staff can confirm scan-derived suspect");

console.log("\nEmpty catalog → scan-derived guarantee");
const ensured = ensurePokemonScanDerivedFallback({
  suspects: [],
  assessments: [],
  imageEvidence: ev,
});
assert(ensured.suspects.length === 1, "ensure injects one scan-derived suspect");
assert(ensured.assessments.length === 1, "ensure injects assessment");
assert(
  ensured.suspects[0]?.catalogSource === "scan_derived_fallback",
  "first suspect is scan-derived",
);

console.log("\nNon-empty catalog still gets scan-derived first (JP)");
const inkaySuspect = {
  suspectId: "pokemon:inkay:swsh6:69",
  category: "pokemon" as const,
  label: "Inkay · Chilling Reign · 69 · reverse holo",
  canonicalName: "Inkay",
  catalogSource: "pokemon_tcg" as const,
  setName: "Chilling Reign",
  setCode: "swsh6",
  collectorNumber: "69",
  finish: "reverse_holo",
  variantTags: [],
  expectedEvidence: [],
};
const ensuredWithNoise = ensurePokemonScanDerivedFallback({
  suspects: [inkaySuspect],
  assessments: [
    {
      suspectId: inkaySuspect.suspectId,
      matchScore: 0.88,
      canConfirm: false,
      canEliminate: false,
      supportingEvidence: [],
      contradictingEvidence: [],
      missingEvidence: [],
      variantRisks: [],
      reasoning: "wrong",
    },
  ],
  imageEvidence: ev,
});
assert(
  ensuredWithNoise.suspects[0]?.catalogSource === "scan_derived_fallback",
  "scan-derived ranks first even when Inkay present",
);
assert(
  ensuredWithNoise.assessments[0]?.matchScore > 0.9,
  "scan-derived assessment outranks wrong catalog hit",
);

console.log("\nPicker rows never empty when evidence sufficient");
const identity: CardCandidateBundle = {
  category: "pokemon",
  suspects: ensured.suspects,
  suspectAssessments: ensured.assessments,
  lockedIdentity: {
    locked: false,
    lockStatus: "not_locked_no_candidates",
    confidence: 0,
    category: "pokemon",
    variantTags: [],
    requiredEvidenceSatisfied: false,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    staffMessage: "Pick a printing.",
  },
};
const rows = buildSuspectPickerRows(identity);
assert(rows.length === 1, "picker has one row");
assert(rows[0]?.scanDerived === true, "row marked scan-derived");
assert(
  rows[0]?.scanDerivedBadge?.includes("catalog not found"),
  "scan-derived badge text",
);
assert(
  rows[0]?.pricingStatusLabel === "Manual review required",
  "manual price label when no PC match",
);

console.log("\nManual entry prefill");
const manual = evidenceToManualEntryDefaults(ev);
assert(manual.name.includes("Torkoal"), "manual name prefilled with English");
assert(manual.name.includes("コータス"), "manual name prefilled with Japanese");
assert(manual.setCode === "SV5A", "manual set code prefilled");
assert(manual.cardNumber === "069/066", "manual number prefilled");
assert(manual.language === "jp", "manual language prefilled");

console.log("\nPriceCharting exact vs name-only");
const torkoalIdentity = scan!;
const exactProduct = {
  "product-name": "Torkoal #69 Crimson Haze Japanese",
  "console-name": "Pokemon Japanese Scarlet & Violet",
};
const nameOnlyProduct = {
  "product-name": "Torkoal [Reverse Holo]",
  "console-name": "Pokemon Scarlet & Violet",
};
assert(
  isExactJapanesePokemonPriceChartingMatch(exactProduct, torkoalIdentity),
  "exact Japanese PC match accepted",
);
assert(
  !isExactJapanesePokemonPriceChartingMatch(nameOnlyProduct, torkoalIdentity),
  "name-only English PC match rejected",
);

console.log("\nPriceCharting exact match with set_code only (SV5A)");
const codeOnlyIdentity = {
  ...torkoalIdentity,
  setName: undefined,
};
const crimsonHazeProduct = {
  "product-name": "Torkoal [Art Rare] #69",
  "console-name": "Pokemon Japanese Crimson Haze",
};
assert(
  isExactJapanesePokemonPriceChartingMatch(crimsonHazeProduct, codeOnlyIdentity),
  "SV5A set code resolves to Crimson Haze console match",
);

console.log("\nPricing safety — scan-derived blocks auto preview");
const scanIdentity: CardCandidateBundle = {
  ...identity,
  staffSelection: {
    suspectId: built.suspect.suspectId,
    confirmedAt: new Date().toISOString(),
  },
};
const decision = buildMarketValueDecision({
  identity: scanIdentity,
  market: {
    mode: "candidate_snapshots",
    createdAt: new Date().toISOString(),
    snapshots: [],
  },
});
assert(
  !decision.usableForOfferPreview &&
    decision.blockers.includes("manual_review_required"),
  "scan-derived without exact PC blocks offer preview",
);

console.log("\nEnglish multi-variant — no scan-derived override");
function sadaEvidence(): ImageEvidenceReport {
  return {
    identificationMode: "continue_with_variant_uncertainty",
    evidenceSlots: [
      {
        field: "card_name",
        value: "Professor Sada's Vitality",
        status: "observed",
        confidence: 0.92,
      },
      {
        field: "set_name",
        value: "Paradox Rift",
        status: "observed",
        confidence: 0.9,
      },
      {
        field: "set_code",
        value: "PAR",
        status: "observed",
        confidence: 0.88,
      },
      {
        field: "collector_number",
        value: "239",
        status: "observed",
        confidence: 0.85,
      },
      { field: "language", value: "en", status: "observed", confidence: 0.95 },
    ],
  } as ImageEvidenceReport;
}
const sadaEv = sadaEvidence();
const sadaScan = extractPokemonScanIdentity(sadaEv);
const regularSuspect = {
  suspectId: "pokemon:sada:par:239:regular",
  category: "pokemon" as const,
  label: "Professor Sada's Vitality · Paradox Rift · 239",
  canonicalName: "Professor Sada's Vitality",
  catalogSource: "pokemon_tcg" as const,
  setName: "Paradox Rift",
  setCode: "par",
  collectorNumber: "239",
  finish: "normal",
  variantTags: [],
  expectedEvidence: [],
};
const sarSuspect = {
  suspectId: "pokemon:sada:par:245:sar",
  category: "pokemon" as const,
  label: "Professor Sada's Vitality · Paradox Rift · 245 · special illustration rare",
  canonicalName: "Professor Sada's Vitality",
  catalogSource: "pokemon_tcg" as const,
  setName: "Paradox Rift",
  setCode: "par",
  collectorNumber: "245",
  finish: "special_illustration_rare",
  variantTags: ["sar"],
  expectedEvidence: [],
};
const catalogVariants = [regularSuspect, sarSuspect];
const injectPolicy = shouldInjectScanDerivedPokemon({
  scanIdentity: sadaScan!,
  suspects: catalogVariants,
});
assert(!injectPolicy.inject, "English catalog name match skips scan-derived inject");
const ensuredEnglish = ensurePokemonScanDerivedFallback({
  suspects: catalogVariants,
  assessments: [
    {
      suspectId: regularSuspect.suspectId,
      matchScore: 0.82,
      canConfirm: false,
      canEliminate: false,
      supportingEvidence: [],
      contradictingEvidence: [],
      missingEvidence: [],
      variantRisks: [],
      reasoning: "number match",
    },
    {
      suspectId: sarSuspect.suspectId,
      matchScore: 0.78,
      canConfirm: false,
      canEliminate: false,
      supportingEvidence: [],
      contradictingEvidence: [],
      missingEvidence: [],
      variantRisks: [],
      reasoning: "finish variant",
    },
  ],
  imageEvidence: sadaEv,
});
assert(
  ensuredEnglish.suspects.length === 2,
  "English multi-variant catalog unchanged by ensure",
);
assert(
  !ensuredEnglish.suspects.some((s) => s.catalogSource === "scan_derived_fallback"),
  "no scan-derived row injected for English catalog hits",
);
const englishIdentity: CardCandidateBundle = {
  category: "pokemon",
  suspects: catalogVariants,
  suspectAssessments: ensuredEnglish.assessments,
  lockedIdentity: {
    locked: false,
    lockStatus: "not_locked_no_candidates",
    confidence: 0,
    category: "pokemon",
    variantTags: [],
    requiredEvidenceSatisfied: false,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    staffMessage: "Pick a printing.",
  },
};
const englishRows = buildSuspectPickerRows(englishIdentity);
assert(englishRows.length === 2, "picker shows both English finish variants");

console.log("\nJapanese catalog filter");
const chillingReignTorkoal = {
  suspectId: "pokemon:torkoal:swsh6:69",
  category: "pokemon" as const,
  label: "Torkoal · Chilling Reign · 69",
  canonicalName: "Torkoal",
  catalogSource: "pokemon_tcg" as const,
  setName: "Chilling Reign",
  setCode: "swsh6",
  collectorNumber: "69",
  variantTags: [],
  expectedEvidence: [],
};
const filtered = filterJapaneseCatalogSuspects({
  suspects: [chillingReignTorkoal, built.suspect],
  assessments: [
    {
      suspectId: chillingReignTorkoal.suspectId,
      matchScore: 0.9,
      canConfirm: true,
      canEliminate: false,
      supportingEvidence: [],
      contradictingEvidence: [],
      missingEvidence: [],
      variantRisks: [],
      reasoning: "wrong set",
    },
    built.assessment,
  ],
  imageEvidence: ev,
});
assert(
  filtered.suspects.length === 1 &&
    filtered.suspects[0]?.catalogSource === "scan_derived_fallback",
  "Chilling Reign English printing removed for JP sv5a scan",
);

console.log("\nClerk display keeps Japanese scan after confirm");
const jpCard = {
  id: "c1",
  orderId: "o1",
  frontImageUrl: "https://example.com/f.jpg",
  backImageUrl: "",
  itemType: "raw" as const,
  status: "manual_review" as const,
  setName: "Chilling Reign",
  cardNumber: "069/066",
  createdAt: new Date().toISOString(),
  cardFlowV2Evidence: { imageEvidence: ev },
  cardFlowV2Identity: {
    ...identity,
    staffSelection: {
      suspectId: built.suspect.suspectId,
      confirmedAt: new Date().toISOString(),
      confirmedBy: "staff@test.com",
    },
  },
};
const display = resolveClerkScanIdentityDisplay(jpCard);
assert(display.setLabel === "Crimson Haze", "card face shows scan set not English catalog");
assert(display.setCode === "SV5A", "card face shows scan set code");
assert(display.secondaryName === "コータス", "card face shows Japanese name");
assert(display.language === "Japanese", "card face shows Japanese language");

console.log("\nTCGplayer blocked for Japanese scan-derived");
assert(
  suspectBlocksTcgplayerPricing(built.suspect),
  "scan-derived suspect blocks TCG pricing",
);
const jpPlan = buildSuspectSearchPlan(built.suspect);
assert(
  suspectBlocksTcgplayerPricingFromPlan(jpPlan),
  "market plan skips English TCG lookup",
);

console.log("\nTCGplayer link uses Pokemon Japan search");
const tcgLink = buildTcgplayerProductUrl({
  suspect: built.suspect,
  snapshot: {
    tcgplayerMapping: {
      attempted: true,
      productId: "999999",
      productUrl: "https://www.tcgplayer.com/product/999999",
      marketPrice: 16.21,
      variantsFound: [],
      availableVariantNames: [],
    },
  } as never,
});
assert(
  tcgLink?.includes("pokemon-japan") === true,
  "TCG link targets Pokemon Japan category",
);
assert(
  tcgLink?.includes("999999") === false,
  "TCG link ignores English catalog product id",
);

console.log("\nClerk face avoids stale English TCG price");
const jpCardWithStaleTcg = {
  ...jpCard,
  marketPrice: 16.21,
  cashOffer: 9.72,
  tradeOffer: 11.35,
  cardFlowV2Market: {
    mode: "candidate_market_comparison" as const,
    lockedIdentityStatus: "not_locked" as const,
    snapshots: [
      {
        suspectId: built.suspect.suspectId,
        valueMedian: 1.72,
        pricingMethod: "price_signal_only_pricecharting",
        acceptedComps: [
          {
            status: "accepted",
            matchScore: 0.9,
            acceptedReasons: ["price_signal"],
            rejectionReasons: [],
            notes: [],
            comp: {
              source: "pricecharting",
              title: "Torkoal Crimson Haze",
              price: 1.72,
            },
          },
        ],
        tcgplayerMapping: {
          attempted: false,
          reasonIfSkipped: "Japanese printing",
          variantsFound: [],
          availableVariantNames: [],
        },
      },
    ],
    warnings: [],
    createdAt: new Date().toISOString(),
  },
  cardFlowV2OfferPreview: {
    marketDecision: {
      usableForOfferPreview: false,
      basis: "none" as const,
      confidence: "none" as const,
      blockers: ["manual_review_required" as const, "no_market_data" as const],
      warnings: [],
      sourceValues: [],
      explanation: "blocked",
    },
    createdAt: new Date().toISOString(),
  },
};
const clerkOffers = resolveClerkDisplayOffers({
  card: jpCardWithStaleTcg as never,
  offerPreview: jpCardWithStaleTcg.cardFlowV2OfferPreview as never,
  versionConfirmed: true,
});
assert(clerkOffers.market === 1.72, "clerk face uses PriceCharting shadow not stale TCG");
assert(clerkOffers.market !== 16.21, "clerk face rejects stale English TCG market");

console.log("\nClerk face uses Japan catalog preview not English condition ladder");
const japanCatalogSuspect = buildScanDerivedPokemonSuspect(
  scan!,
  "tcgplayer_japan_exact",
  undefined,
  {
    productId: "566124",
    productName: "Torkoal - 069/066",
    productLineName: "Pokemon Japan",
    productUrl: "https://www.tcgplayer.com/product/566124",
    imageUrl: "https://tcgplayer-cdn.tcgplayer.com/product/566124_in_1000x1000.jpg",
    resolutionSource: "pricecharting_tcg_id",
  },
);
const jpCardWithJapanPreview = {
  ...jpCardWithStaleTcg,
  cardFlowV2Identity: {
    ...scanIdentity,
    suspects: [japanCatalogSuspect.suspect],
    staffSelection: {
      suspectId: japanCatalogSuspect.suspect.suspectId,
      confirmedAt: new Date().toISOString(),
    },
  },
  conditionLadder: [
    { condition: "LP", marketValue: 16.21, cashOffer: 9.72, tradeOffer: 11.35 },
  ],
  cardFlowV2OfferPreview: {
    previewMarketValue: 1.34,
    previewCashOffer: 0.81,
    previewTradeOffer: 0.94,
    marketDecision: {
      usableForOfferPreview: true,
      basis: "tcgplayer_lowest_listing" as const,
      confidence: "medium" as const,
      marketValue: 1.34,
      blockers: [],
      warnings: [],
      sourceValues: [],
      explanation: "Japan catalog lowest listing",
    },
    createdAt: new Date().toISOString(),
  },
};
const japanClerkOffers = resolveClerkDisplayOffers({
  card: jpCardWithJapanPreview as never,
  offerPreview: jpCardWithJapanPreview.cardFlowV2OfferPreview as never,
  versionConfirmed: true,
});
assert(japanClerkOffers.market === 1.34, "clerk face uses Japan V2 preview");
assert(japanClerkOffers.market !== 16.21, "clerk face rejects stale English ladder");

console.log("\nStaff edit form avoids stale English TCG price");
const editOffers = staffEditOffersForCondition(
  jpCardWithStaleTcg as never,
  "LP",
);
assert(editOffers?.marketValue === 1.72, "edit form prefills PriceCharting reference");
assert(editOffers?.marketValue !== 16.21, "edit form rejects stale English TCG");

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
