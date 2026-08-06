/**
 * Directive 006P — admin V2 shadow reprocess (cloud path + fail-fast policy).
 * Run: npm run test:directive-006p-v2-reprocess
 */
import {
  buildV2ReprocessSummary,
  mergeV2ShadowBundlesOnly,
} from "../src/lib/card-flow-v2/v2-reprocess-summary";
import { snapshotProductionFields } from "../src/lib/card-flow-v2/shadow-v2-reprocess";
import type { ScannedCard } from "../src/lib/types";

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
process.env.CARD_FLOW_V2_OFFER_PREVIEW_ENABLED = "true";
process.env.CARD_FLOW_V2_OFFER_INFLUENCE = "true";

function baseCard(overrides: Partial<ScannedCard> = {}): ScannedCard {
  return {
    id: "f9708817-ce8d-4f67-9373-a8614c5f90db",
    orderId: "o1",
    frontImageUrl: "https://example.com/f.jpg",
    backImageUrl: "",
    itemType: "raw",
    status: "manual_review",
    detectedName: "Argentum Armor",
    marketPrice: 3.49,
    cashOffer: 1.75,
    tradeOffer: 2.27,
    createdAt: new Date().toISOString(),
    cardFlowV2Evidence: {
      ranAt: new Date().toISOString(),
      imageEvidence: {
        identificationMode: "continue_with_variant_uncertainty",
        evidenceSlots: [
          { field: "set_code", value: "AFC", status: "confirmed", confidence: 0.9 },
          { field: "collector_number", value: "198", status: "confirmed", confidence: 0.9 },
          { field: "the_list_mark", value: "no", status: "confirmed", confidence: 0.85 },
        ],
      } as never,
      categoryClassification: {} as never,
      detectiveGuide: {} as never,
    },
    cardFlowV2Identity: {
      category: "mtg",
      suspects: [
        {
          suspectId: "scryfall:plst-AFC-198",
          category: "mtg",
          label: "The List (plst) · AFC-198",
          catalogSource: "scryfall",
          canonicalName: "Argentum Armor",
          setCode: "plst",
          setName: "The List",
          collectorNumber: "AFC-198",
          finish: "nonfoil",
          variantTags: ["the_list"],
          expectedEvidence: [],
        },
        {
          suspectId: "scryfall:afc-198",
          category: "mtg",
          label: "Forgotten Realms Commander (afc) · 198",
          catalogSource: "scryfall",
          canonicalName: "Argentum Armor",
          setCode: "afc",
          setName: "Forgotten Realms Commander",
          collectorNumber: "198",
          finish: "nonfoil",
          variantTags: [],
          expectedEvidence: [],
        },
      ],
      suspectAssessments: [
        {
          suspectId: "scryfall:afc-198",
          matchScore: 0.88,
          reasoning: "set_code AFC matches bottom line origin ref trap",
        },
        {
          suspectId: "scryfall:plst-AFC-198",
          matchScore: 0.62,
          reasoning: "List suspect penalized when fork mark not detected",
        },
      ] as never,
      lockedIdentity: {
        locked: false,
        lockStatus: "not_locked_variant_uncertainty",
        confidence: 0.5,
        category: "mtg",
        canonicalName: "Argentum Armor",
        variantTags: [],
        requiredEvidenceSatisfied: false,
        missingRequiredEvidence: ["the_list_mark"],
        unresolvedVariantRisks: ["The List origin ref vs printing"],
        staffMessage: "Confirm List vs AFC printing",
      },
      candidateGenerationNotes: [
        "MTG List origin ref trap: bottom line AFC-198 is origin, not set",
        "List mark inspection attempted",
      ],
      mtgListMarkInspection: {
        attempted: true,
        listMarkVisible: "unknown",
        confidence: 0.4,
        cropQuality: "usable",
        inspectedRegions: ["bottom_left_margin"],
        evidenceNotes: ["Fork icon region cropped; mark unclear on prior pass"],
        staffSummary: "Fork icon region cropped; mark unclear on prior pass",
      },
      createdAt: new Date().toISOString(),
    },
    ...overrides,
  };
}

async function main() {
  console.log("Directive 006P — V2 shadow reprocess\n");

  console.log("1. mergeV2ShadowBundlesOnly preserves production");
  const original = baseCard();
  const refreshed = {
    ...original,
    marketPrice: 99,
    cashOffer: 50,
    tradeOffer: 60,
    status: "approved" as const,
    cardFlowV2Audit: { riskLevel: "low" } as never,
  };
  const merged = mergeV2ShadowBundlesOnly(original, refreshed);
  assert(merged.marketPrice === 3.49, "marketPrice unchanged");
  assert(merged.cashOffer === 1.75, "cashOffer unchanged");
  assert(merged.status === "manual_review", "status unchanged");
  assert(merged.cardFlowV2Audit != null, "V2 audit merged");

  console.log("\n2. buildV2ReprocessSummary shape");
  const before = snapshotProductionFields(original);
  const summary = buildV2ReprocessSummary(original, before);
  assert(summary.cardName === "Argentum Armor", "card name");
  assert(summary.evidenceSlots.length === 3, "evidence slots filtered");
  assert(
    summary.evidenceSlots.some((s) => s.field === "the_list_mark"),
    "the_list_mark slot present",
  );
  assert(summary.topSuspects.length === 2, "top suspects");
  assert(summary.listRelatedNotes.length >= 1, "List-related notes");
  assert(summary.productionUnchanged === true, "production unchanged flag");

  console.log("\n3. skipOfferInfluence path (admin shadow reprocess contract)");
  assert(
    process.env.CARD_FLOW_V2_OFFER_INFLUENCE === "true",
    "offer influence flag may be on globally",
  );
  const { restoreProductionFields } = await import(
    "../src/lib/card-flow-v2/shadow-v2-reprocess"
  );
  const withMutatedProd = { ...original, marketPrice: 99, cashOffer: 50 };
  const restored = restoreProductionFields(withMutatedProd, before);
  assert(restored.marketPrice === before.marketPrice, "restoreProductionFields");
  assert(restored.cashOffer === before.cashOffer, "restoreProductionFields cash");

  console.log("\n4. v2-reprocess route contract fields");
  assert(typeof summary.productionUnchanged === "boolean", "productionUnchanged boolean");
  assert(summary.topSuspectScores[0]?.score != null, "top suspect scores");

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
