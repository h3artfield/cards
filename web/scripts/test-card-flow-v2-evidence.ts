/**
 * Phase 1 tests for Card Flow V2 evidence parsers and guides (no live OpenAI).
 * Run: npm run test:card-flow-v2
 */
import { parseImageEvidenceResponse } from "../src/lib/card-flow-v2/image-evidence-agent";
import { applyPokemonFoilSafetyRules } from "../src/lib/card-flow-v2/pokemon-foil-evidence";
import {
  applyCategoryConfidenceRules,
  parseCategoryClassificationResponse,
} from "../src/lib/card-flow-v2/category-classifier-agent";
import {
  getDetectiveGuide,
  listDetectiveGuideCategories,
} from "../src/lib/card-flow-v2/detective-guides";
import { isCardFlowV2EvidenceEnabled } from "../src/lib/card-flow-v2/feature-flag";

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

console.log("Card Flow V2 — Phase 1 tests\n");

console.log("Feature flag defaults off");
const prev = process.env.CARD_FLOW_V2_EVIDENCE_ENABLED;
delete process.env.CARD_FLOW_V2_EVIDENCE_ENABLED;
assert(isCardFlowV2EvidenceEnabled() === false, "disabled when env unset");
process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = "true";
assert(isCardFlowV2EvidenceEnabled() === true, "enabled when env is true");
process.env.CARD_FLOW_V2_EVIDENCE_ENABLED = prev;

console.log("\nDetective guides");
for (const cat of ["pokemon", "yugioh", "mtg", "sports", "riftbound", "unknown"]) {
  const guide = getDetectiveGuide(cat as "pokemon");
  assert(guide.category === cat, `guide loads for ${cat}`);
  assert(guide.lockRequirements.length > 0, `${cat} has lock requirements`);
}
assert(listDetectiveGuideCategories().length >= 6, "lists guide categories");

console.log("\nPokémon card front/back — blurry but usable");
const pokemonEvidence = parseImageEvidenceResponse({
  imageUsability: "limited",
  canAttemptIdentification: true,
  canAutoLockIdentity: false,
  detectedCardCount: 1,
  detectedSides: ["front", "back"],
  visualProblems: ["blur"],
  extractedText: ["Pikachu", "025/185"],
  evidenceSlots: [
    {
      field: "card_name",
      value: "Pikachu",
      status: "observed",
      confidence: 0.85,
      source: "front_image",
    },
    {
      field: "collector_number",
      value: "025/185",
      status: "observed",
      confidence: 0.7,
      source: "front_image",
    },
    {
      field: "foil_pattern",
      value: null,
      status: "unknown",
      confidence: 0.2,
      source: "front_image",
    },
  ],
  missingCriticalEvidence: ["foil_pattern"],
  identificationMode: "continue_with_variant_uncertainty",
  staffMessage:
    "Name and number visible despite blur; foil treatment unknown — show candidate versions.",
});
assert(
  pokemonEvidence.identificationMode === "continue_with_variant_uncertainty",
  "continues with variant uncertainty",
);
assert(pokemonEvidence.canAutoLockIdentity === false, "does not auto-lock");

console.log("\nMTG — missing bottom-left collector detail");
const mtgEvidence = parseImageEvidenceResponse({
  imageUsability: "good",
  canAttemptIdentification: true,
  canAutoLockIdentity: false,
  detectedCardCount: 1,
  detectedSides: ["front"],
  visualProblems: ["cut_off"],
  evidenceSlots: [
    {
      field: "card_name",
      value: "Lightning Bolt",
      status: "observed",
      confidence: 0.9,
      source: "front_image",
    },
    {
      field: "set_code",
      value: null,
      status: "unknown",
      confidence: 0,
      source: "front_image",
      note: "bottom-left collector block cut off",
    },
  ],
  missingCriticalEvidence: ["set_code", "collector_number"],
  identificationMode: "candidate_list_only",
  staffMessage: "Title visible; bottom-left set/number blocked — show possible versions.",
});
assert(
  mtgEvidence.identificationMode === "candidate_list_only",
  "candidate list when collector detail missing",
);

console.log("\nSports — unclear parallel");
const sportsEvidence = parseImageEvidenceResponse({
  imageUsability: "limited",
  canAttemptIdentification: true,
  canAutoLockIdentity: false,
  detectedCardCount: 1,
  detectedSides: ["front", "back"],
  visualProblems: ["glare", "sleeve_reflection"],
  evidenceSlots: [
    {
      field: "player_name",
      value: "Dan Marino",
      status: "observed",
      confidence: 0.88,
      source: "front_image",
    },
    {
      field: "parallel_indicator",
      value: null,
      status: "unknown",
      confidence: 0.15,
      source: "front_image",
    },
  ],
  missingCriticalEvidence: ["parallel_indicator", "card_number"],
  identificationMode: "continue_with_variant_uncertainty",
  staffMessage: "Player visible; parallel surface unclear due to glare.",
});
assert(
  sportsEvidence.missingCriticalEvidence.includes("parallel_indicator"),
  "flags missing parallel evidence",
);

console.log("\nSlab — readable label");
const slabEvidence = parseImageEvidenceResponse({
  imageUsability: "good",
  canAttemptIdentification: true,
  canAutoLockIdentity: false,
  detectedCardCount: 1,
  detectedSides: ["slab_front"],
  evidenceSlots: [
    {
      field: "slab_company",
      value: "PSA",
      status: "observed",
      confidence: 0.95,
      source: "slab_label",
    },
    {
      field: "slab_grade",
      value: "10",
      status: "observed",
      confidence: 0.95,
      source: "slab_label",
    },
    {
      field: "cert_number",
      value: "12345678",
      status: "observed",
      confidence: 0.9,
      source: "slab_label",
    },
  ],
  missingCriticalEvidence: ["collector_number"],
  identificationMode: "continue_with_variant_uncertainty",
  staffMessage: "Slab label readable; still need collector number from card face.",
});
assert(
  slabEvidence.evidenceSlots.some((s) => s.field === "slab_company"),
  "captures slab company from label",
);

console.log("\nPoor but still usable image");
const poorEvidence = parseImageEvidenceResponse({
  imageUsability: "poor",
  canAttemptIdentification: true,
  canAutoLockIdentity: false,
  detectedCardCount: 1,
  detectedSides: ["front"],
  visualProblems: ["blur", "too_dark", "angled"],
  identificationMode: "manual_review",
  staffMessage: "Poor quality but partial text visible — staff review recommended.",
});
assert(poorEvidence.canAttemptIdentification === true, "does not reject poor photos");
assert(poorEvidence.imageUsability === "poor", "records poor usability");

console.log("\nCategory classifier confidence rules");
const highConf = applyCategoryConfidenceRules({
  category: "pokemon",
  confidence: 0.92,
  evidence: ["Pokémon HP layout"],
  detectedSides: ["front"],
});
assert(highConf.category === "pokemon" && !highConf.needsHigherVision, "high confidence accepted");

const midConf = applyCategoryConfidenceRules({
  category: "mtg",
  confidence: 0.72,
  evidence: ["mana symbols"],
  detectedSides: ["front"],
});
assert(midConf.needsHigherVision === true, "mid confidence flags higher vision");

const lowConf = parseCategoryClassificationResponse({
  category: "sports",
  confidence: 0.45,
  evidence: ["unclear"],
  detectedSides: ["front"],
  possibleCategories: [
    { category: "sports", confidence: 0.45, reason: "Possible athlete photo" },
    { category: "pokemon", confidence: 0.3, reason: "Unlikely" },
  ],
});
assert(lowConf.category === "unknown", "low confidence becomes unknown");
assert(
  (lowConf.possibleCategories?.length ?? 0) > 0,
  "keeps possible categories when uncertain",
);

console.log("\nPokémon weak normal finish → unknown");
const weakNormal = applyPokemonFoilSafetyRules(
  parseImageEvidenceResponse({
    imageUsability: "good",
    canAttemptIdentification: true,
    evidenceSlots: [
      {
        field: "foil_pattern",
        value: "normal",
        status: "observed",
        confidence: 0.7,
        source: "front_image",
      },
    ],
    identificationMode: "safe_to_continue",
    staffMessage: "",
  }),
);
const foilSlot = weakNormal.evidenceSlots.find((s) => s.field === "foil_pattern");
assert(foilSlot?.status === "unknown", "weak normal downgraded to unknown");
assert(
  weakNormal.identificationMode === "continue_with_variant_uncertainty",
  "variant uncertainty mode when finish soft",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
