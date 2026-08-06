/**
 * Phase 2 tests — suspect matching and identity lock gate (no live API).
 * Run: npm run test:card-flow-v2-identity
 */
import {
  applyStaffSuspectSelection,
  buildSuspectPickerRows,
  getMtgVariantStaffExplanations,
  getVariantStaffExplanations,
  getStaffSelectedSuspect,
} from "../src/lib/card-flow-v2/staff-suspect-selection";
import { buildScryfallQueries } from "../src/lib/processing/catalog-pricing";
import { normalizeScryfallCollectorNumber } from "../src/lib/processing/scryfall-client";
import { getDetectiveGuide } from "../src/lib/card-flow-v2/detective-guides";
import { isCardFlowV2IdentityEnabled } from "../src/lib/card-flow-v2/feature-flag";
import {
  pokemonRawToSuspects,
  scryfallRawToSuspects,
  ygoRawToSuspects,
  priceChartingToSuspects,
} from "../src/lib/card-flow-v2/catalog-normalizers";
import {
  scoreSuspectDeterministic,
  scoreSuspectsDeterministic,
} from "../src/lib/card-flow-v2/suspect-matcher";
import {
  augmentMtgSuspectAssessments,
  applyMtgFoilIdentityLockAdjustments,
  applyMtgFrameIdentityLockAdjustments,
  applyMtgListIdentityLockAdjustments,
  listOriginRefMatchesEvidence,
  parseListOriginRef,
} from "../src/lib/card-flow-v2/mtg-suspect-scoring";
import {
  buildMtgFoilStaffExplanation,
  detectMtgFoilFinishTrap,
} from "../src/lib/card-flow-v2/mtg-foil-trap";
import {
  buildMtgFrameStaffExplanation,
  detectMtgFrameTreatmentTrap,
} from "../src/lib/card-flow-v2/mtg-frame-trap";
import {
  augmentSportsSuspectAssessments,
  applySportsPrizmIdentityLockAdjustments,
} from "../src/lib/card-flow-v2/sports-suspect-scoring";
import {
  buildSportsPrizmStaffExplanation,
  detectSportsPrizmTrap,
} from "../src/lib/card-flow-v2/sports-prizm-trap";
import {
  augmentYgoSuspectAssessments,
  applyYgoEditionIdentityLockAdjustments,
} from "../src/lib/card-flow-v2/ygo-suspect-scoring";
import {
  buildYgoEditionStaffExplanation,
  detectYgoEditionTrap,
} from "../src/lib/card-flow-v2/ygo-edition-trap";
import {
  augmentPokemonSuspectAssessments,
  applyPokemonReversePatternLockAdjustments,
} from "../src/lib/card-flow-v2/pokemon-suspect-scoring";
import {
  buildPokemonReversePatternStaffExplanation,
  detectPokemonReversePatternTrap,
  expandPokemonPatternSuspects,
} from "../src/lib/card-flow-v2/pokemon-reverse-trap";
import { setSupportsMasterBallReverse } from "../src/lib/card-flow-v2/knowledge/pokemon-patterns";
import {
  buildMtgListStaffExplanation,
  detectMtgListOriginRefTrap,
} from "../src/lib/card-flow-v2/mtg-list-trap";
import { runIdentityLockGate } from "../src/lib/card-flow-v2/identity-lock-gate";
import type {
  CardCandidateBundle,
  CardSuspect,
  CategoryDetectiveGuide,
  ImageEvidenceReport,
  MtgFoilWashInspection,
  MtgFrameTreatmentInspection,
  MtgListMarkInspection,
  PokemonReversePatternInspection,
  SportsPrizmStampInspection,
  YgoEditionInspection,
} from "../src/lib/card-flow-v2/types";

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

function evidence(partial: Partial<ImageEvidenceReport>): ImageEvidenceReport {
  return {
    imageUsability: "good",
    canAttemptIdentification: true,
    canAutoLockIdentity: false,
    detectedCardCount: 1,
    detectedSides: ["front"],
    visualProblems: [],
    extractedText: [],
    evidenceSlots: [],
    missingCriticalEvidence: [],
    identificationMode: "continue_with_variant_uncertainty",
    staffMessage: "",
    ...partial,
  };
}

function slot(
  field: string,
  value: string | null,
  status: "observed" | "unknown" = "observed",
) {
  return {
    field,
    value,
    status,
    confidence: status === "observed" ? 0.9 : 0.2,
    source: "front_image" as const,
  };
}

function lockGate(
  suspects: CardSuspect[],
  imageEvidence: ImageEvidenceReport,
  guide: CategoryDetectiveGuide,
  category: "pokemon" | "mtg" | "yugioh" | "sports" = "pokemon",
) {
  const assessments = scoreSuspectsDeterministic(suspects, imageEvidence, guide);
  return runIdentityLockGate({
    suspects,
    assessments,
    detectiveGuide: guide,
    imageEvidence,
    category,
  });
}

console.log("Card Flow V2 Phase 2 — identity tests\n");

console.log("Feature flag");
const prevId = process.env.CARD_FLOW_V2_IDENTITY_ENABLED;
delete process.env.CARD_FLOW_V2_IDENTITY_ENABLED;
assert(isCardFlowV2IdentityEnabled() === false, "identity flag off by default");
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = "true";
assert(isCardFlowV2IdentityEnabled() === true, "identity flag on when set");
process.env.CARD_FLOW_V2_IDENTITY_ENABLED = prevId;

console.log("\n1. Pokémon exact name + number → strong suspect");
const morganRaw = {
  id: "sv3-178",
  name: "Morgan",
  number: "178/167",
  rarity: "Rare Holo",
  set: { name: "Team Up", id: "sm9" },
  tcgplayer: { prices: { holofoil: { market: 40 } } },
  images: { large: "https://example.com/morgan.jpg" },
};
const morganSuspects = pokemonRawToSuspects(morganRaw);
assert(morganSuspects.length >= 1, "generates morgan suspect");
const pokemonGuide = getDetectiveGuide("pokemon");
const morganEvidence = evidence({
  evidenceSlots: [
    slot("card_name", "Morgan"),
    slot("collector_number", "178/167"),
    slot("set_name", "Team Up"),
  ],
  identificationMode: "safe_to_continue",
});
const morganScore = scoreSuspectDeterministic(
  morganSuspects[0]!,
  morganEvidence,
  pokemonGuide,
);
assert(morganScore.matchScore >= 0.65, "strong score for exact pokemon match");
assert(morganScore.supportingEvidence.length >= 2, "multiple supporting evidence fields");

console.log("\n2. Pokémon unclear holo → multiple suspects");
const multiFinishRaw = {
  id: "test-1",
  name: "Pikachu",
  number: "25/102",
  set: { name: "Base Set", id: "base1" },
  tcgplayer: {
    prices: {
      normal: { market: 5 },
      holofoil: { market: 15 },
    },
  },
};
const multiSuspects = pokemonRawToSuspects(multiFinishRaw);
assert(multiSuspects.length >= 2, "splits holo and normal suspects");
const unclearFoilEvidence = evidence({
  evidenceSlots: [
    slot("card_name", "Pikachu"),
    slot("collector_number", "25/102"),
    slot("foil_pattern", null, "unknown"),
  ],
});
const unclearLock = lockGate(multiSuspects, unclearFoilEvidence, pokemonGuide);
assert(!unclearLock.locked, "does not lock when foil unclear");
assert(
  unclearLock.lockStatus === "not_locked_variant_uncertainty" ||
    unclearLock.lockStatus === "not_locked_missing_required_evidence" ||
    unclearLock.lockStatus === "not_locked_low_confidence",
  "variant uncertainty or missing evidence when foil unknown",
);

console.log("\n2b. Pokémon reverse pattern — Master Ball / normal trap");
assert(
  setSupportsMasterBallReverse("sv8pt5", "Prismatic Evolutions"),
  "Prismatic Evolutions supports Master Ball reverse",
);
const peRaw = {
  id: "pe-pika",
  name: "Pikachu",
  number: "25",
  set: { name: "Prismatic Evolutions", id: "sv8pt5" },
  tcgplayer: {
    prices: { normal: { market: 1 }, reverseHolofoil: { market: 3 } },
  },
};
const peSuspects = pokemonRawToSuspects(peRaw);
const peExpandedTrap = detectPokemonReversePatternTrap(
  peSuspects,
  evidence({
    evidenceSlots: [
      slot("card_name", "Pikachu"),
      slot("collector_number", "25"),
      slot("set_code", "sv8pt5"),
    ],
  }),
);
assert(Boolean(peExpandedTrap?.masterBallEligible), "PE trap is master-ball eligible");
const peWithPattern = expandPokemonPatternSuspects(peSuspects, peExpandedTrap!);
assert(peWithPattern.length >= 4, "PE adds Master Ball and Poké Ball suspects");
function patternInspection(
  partial: Partial<PokemonReversePatternInspection>,
): PokemonReversePatternInspection {
  return {
    attempted: true,
    reversePattern: "unknown",
    confidence: 0.85,
    cropQuality: "clear",
    inspectedRegions: ["text_box"],
    evidenceNotes: [],
    ...partial,
  };
}
const peBase = scoreSuspectsDeterministic(
  peWithPattern,
  evidence({
    evidenceSlots: [
      slot("card_name", "Pikachu"),
      slot("collector_number", "25"),
      slot("foil_pattern", null, "unknown"),
    ],
  }),
  pokemonGuide,
);
const peMbId = peWithPattern.find((s) =>
  String(s.finish).includes("master_ball"),
)!.suspectId;
const peNormalId = peWithPattern.find((s) => s.finish === "normal")!.suspectId;
const peMbScore = augmentPokemonSuspectAssessments(
  peWithPattern,
  peBase,
  patternInspection({ reversePattern: "master_ball" }),
);
assert(
  peMbScore.find((a) => a.suspectId === peMbId)!.matchScore >= 0.9,
  "Master Ball pattern → Master Ball suspect boosted",
);
const peNoneScore = augmentPokemonSuspectAssessments(
  peWithPattern,
  peBase,
  patternInspection({ reversePattern: "none", cropQuality: "clear" }),
);
assert(
  peNoneScore.find((a) => a.suspectId === peNormalId)!.matchScore >= 0.88,
  "No pattern + clear crop → normal boosted",
);
const peStaff = buildPokemonReversePatternStaffExplanation({
  trap: peExpandedTrap!,
  inspection: patternInspection({ reversePattern: "master_ball" }),
});
assert(
  peStaff.includes("Master Ball") && peStaff.includes("Reverse pattern inspection"),
  "Pokémon staff explanation mentions pattern inspection",
);

console.log("\n3. MTG name + collector, missing finish, foil+nonfoil exist");
const boltRaw = {
  id: "bolt-1",
  name: "Lightning Bolt",
  collector_number: "161",
  set: { name: "Magic 2010", code: "m10" },
  prices: { usd: "1.5", usd_foil: "8" },
  image_uris: { normal: "https://example.com/bolt.jpg" },
};
const boltSuspects = scryfallRawToSuspects(boltRaw);
assert(boltSuspects.length === 2, "foil and nonfoil scryfall suspects");
const plstRaw = {
  id: "plst-aa",
  name: "Argentum Armor",
  collector_number: "AFC-198",
  set: "plst",
  set_name: "The List",
  prices: { usd: "3.49" },
};
const plstSuspects = scryfallRawToSuspects(plstRaw);
assert(plstSuspects[0]?.setName === "The List", "Scryfall set_name parsed");
assert(plstSuspects[0]?.setCode === "plst", "Scryfall string set code parsed");
assert(plstSuspects[0]?.variantTags.includes("the_list"), "The List variant tag");
assert(
  plstSuspects[0]?.label.includes("The List (plst)"),
  "Scryfall label includes set name and code",
);

console.log("\n3c. MTG The List — bottom line origin ref trap");
assert(
  parseListOriginRef("AFC-198")?.setCode === "AFC",
  "parseListOriginRef set code",
);
const argentumSuspects = [
  ...scryfallRawToSuspects({
    id: "afc",
    name: "Argentum Armor",
    collector_number: "198",
    set: "afc",
    set_name: "Forgotten Realms Commander",
    prices: { usd: "2.45" },
  }),
  ...plstSuspects,
];
const listTrapEvidence = evidence({
  evidenceSlots: [
    slot("card_name", "Argentum Armor"),
    slot("set_code", "AFC"),
    slot("collector_number", "198"),
    slot("the_list_mark", "yes"),
  ],
});
assert(
  listOriginRefMatchesEvidence(argentumSuspects[1]!, listTrapEvidence),
  "List suspect matches AFC+198 bottom line",
);
const listTrapAssessments = augmentMtgSuspectAssessments(
  argentumSuspects,
  scoreSuspectsDeterministic(
    argentumSuspects,
    listTrapEvidence,
    getDetectiveGuide("mtg"),
  ),
  listTrapEvidence,
);
assert(
  listTrapAssessments[0]?.suspectId === argentumSuspects[1]?.suspectId,
  "The List ranks first when mark observed and origin ref matches",
);
assert(!listTrapAssessments[0]?.canEliminate, "The List not eliminated on ref match");

const listTrapNoMarkEvidence = evidence({
  evidenceSlots: [
    slot("card_name", "Argentum Armor"),
    slot("set_code", "AFC"),
    slot("collector_number", "198"),
  ],
});
const listTrapNoMark = augmentMtgSuspectAssessments(
  argentumSuspects,
  scoreSuspectsDeterministic(
    argentumSuspects,
    listTrapNoMarkEvidence,
    getDetectiveGuide("mtg"),
  ),
  listTrapNoMarkEvidence,
);
assert(
  listTrapNoMark[0]?.suspectId === argentumSuspects[1]?.suspectId,
  "The List ranks first on AFC+198 bottom line even without mark (origin ref trap)",
);

function listInspection(
  partial: Partial<MtgListMarkInspection>,
): MtgListMarkInspection {
  return {
    attempted: true,
    listMarkVisible: "unknown",
    confidence: 0.85,
    cropQuality: "unknown",
    inspectedRegions: ["bottom_left_margin"],
    evidenceNotes: [],
    ...partial,
  };
}

function foilWashInspection(
  partial: Partial<MtgFoilWashInspection>,
): MtgFoilWashInspection {
  return {
    attempted: true,
    foilWashVisible: "unknown",
    stampOnlyShine: "unknown",
    confidence: 0.85,
    cropQuality: "unknown",
    inspectedRegions: ["art_window"],
    evidenceNotes: [],
    ...partial,
  };
}

function augmentArgentum(
  ev: ImageEvidenceReport,
  inspection?: MtgListMarkInspection,
  foil?: MtgFoilWashInspection,
) {
  return augmentMtgSuspectAssessments(
    argentumSuspects,
    scoreSuspectsDeterministic(
      argentumSuspects,
      ev,
      getDetectiveGuide("mtg"),
    ),
    ev,
    inspection,
    foil,
  );
}

console.log("\n3d. MTG List mark micro-vision scoring");
const argentumEvidence = evidence({
  evidenceSlots: [
    slot("card_name", "Argentum Armor"),
    slot("set_code", "AFC"),
    slot("collector_number", "198"),
  ],
});
const plstId = argentumSuspects[1]!.suspectId;
const afcId = argentumSuspects[0]!.suspectId;

const markYes = augmentArgentum(
  argentumEvidence,
  listInspection({ listMarkVisible: "yes", cropQuality: "clear", confidence: 0.92 }),
);
assert(
  markYes[0]?.suspectId === plstId && (markYes[0]?.matchScore ?? 0) >= 0.9,
  "List mark visible → PLST boosted above origin printing",
);
assert(
  (markYes.find((a) => a.suspectId === afcId)?.matchScore ?? 1) <= 0.82,
  "List mark visible → origin printing capped/penalized",
);

const markUnknown = augmentArgentum(
  argentumEvidence,
  listInspection({ listMarkVisible: "unknown", cropQuality: "poor" }),
);
assert(
  markUnknown.some((a) => a.suspectId === plstId && !a.canEliminate),
  "List mark unknown + origin-ref → PLST remains candidate",
);
assert(
  markUnknown[0]?.suspectId === plstId,
  "List mark unknown + origin-ref → PLST still ranks first",
);

const markNoClear = augmentArgentum(
  argentumEvidence,
  listInspection({ listMarkVisible: "no", cropQuality: "clear", confidence: 0.88 }),
);
const plstNoClear = markNoClear.find((a) => a.suspectId === plstId)!;
const afcNoClear = markNoClear.find((a) => a.suspectId === afcId)!;
assert(
  plstNoClear.matchScore < (markUnknown.find((a) => a.suspectId === plstId)?.matchScore ?? 0),
  "List mark no + clear crop → PLST receives penalty",
);

const markNoPoor = augmentArgentum(
  argentumEvidence,
  listInspection({ listMarkVisible: "no", cropQuality: "poor", confidence: 0.6 }),
);
const plstNoPoor = markNoPoor.find((a) => a.suspectId === plstId)!;
assert(
  plstNoPoor.matchScore >= plstNoClear.matchScore,
  "List mark no + poor crop → no clear-crop penalty applied",
);

const plstAssessment = markUnknown.find((a) => a.suspectId === plstId)!;
assert(
  !plstAssessment.contradictingEvidence.some((c) =>
    /set code|collector number|collector:/i.test(c),
  ),
  "PLST AFC-198 does not get false set/number contradictions",
);

const trap = detectMtgListOriginRefTrap(argentumSuspects, argentumEvidence);
assert(Boolean(trap), "origin-ref trap detected for AFC+198 vs PLST AFC-198");
const staffExplanation = buildMtgListStaffExplanation({
  trap: trap!,
  inspection: listInspection({ listMarkVisible: "unknown", cropQuality: "poor" }),
});
const identityWithInspection: CardCandidateBundle = {
  category: "mtg",
  suspects: argentumSuspects,
  suspectAssessments: markUnknown,
  lockedIdentity: runIdentityLockGate({
    suspects: argentumSuspects,
    assessments: markUnknown,
    detectiveGuide: getDetectiveGuide("mtg"),
    imageEvidence: argentumEvidence,
    category: "mtg",
  }),
  candidateGenerationNotes: [],
  createdAt: new Date().toISOString(),
  mtgListMarkInspection: {
    ...listInspection({ listMarkVisible: "unknown", cropQuality: "poor" }),
    staffSummary: staffExplanation,
  },
};
assert(
  Boolean(
    getMtgVariantStaffExplanations(identityWithInspection)[0]?.includes(
      "List mark inspection",
    ),
  ),
  "Staff UI receives List mark inspection explanation",
);
assert(
  staffExplanation.includes("AFC #198") && staffExplanation.includes("List mark inspection"),
  "Staff explanation mentions bottom line and inspection result",
);

const lockedListUnknown = applyMtgListIdentityLockAdjustments(
  {
    locked: true,
    lockStatus: "locked",
    confidence: 0.92,
    category: "mtg",
    variantTags: ["the_list"],
    requiredEvidenceSatisfied: true,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    winningSuspectId: plstId,
    staffMessage: "Auto lock",
  },
  argentumSuspects,
  markUnknown,
  listInspection({ listMarkVisible: "unknown", cropQuality: "poor" }),
);
assert(!lockedListUnknown.locked, "PLST not auto-locked when List mark unconfirmed");

console.log("\n3e. MTG foil wash — foil vs nonfoil same printing");
const boltUnclearFinish = evidence({
  evidenceSlots: [
    slot("card_name", "Lightning Bolt"),
    slot("collector_number", "161"),
    slot("set_code", "m10"),
    slot("foil_pattern", null, "unknown"),
  ],
});
const foilTrap = detectMtgFoilFinishTrap(boltSuspects, boltUnclearFinish);
assert(Boolean(foilTrap), "Foil finish trap detected for m10 #161 foil+nonfoil");
const boltFoilId = boltSuspects.find((s) => s.finish === "foil")!.suspectId;
const boltNonfoilId = boltSuspects.find((s) => s.finish === "nonfoil")!.suspectId;
const boltBase = scoreSuspectsDeterministic(
  boltSuspects,
  boltUnclearFinish,
  getDetectiveGuide("mtg"),
);
const washYes = augmentMtgSuspectAssessments(
  boltSuspects,
  boltBase,
  boltUnclearFinish,
  undefined,
  foilWashInspection({ foilWashVisible: "yes", cropQuality: "clear" }),
);
assert(
  washYes.find((a) => a.suspectId === boltFoilId)!.matchScore >= 0.9,
  "Foil wash yes → foil suspect boosted",
);
assert(
  washYes.find((a) => a.suspectId === boltNonfoilId)!.matchScore <= 0.78,
  "Foil wash yes → nonfoil capped/penalized",
);
const washNo = augmentMtgSuspectAssessments(
  boltSuspects,
  boltBase,
  boltUnclearFinish,
  undefined,
  foilWashInspection({
    foilWashVisible: "no",
    stampOnlyShine: "yes",
    cropQuality: "clear",
  }),
);
assert(
  washNo.find((a) => a.suspectId === boltNonfoilId)!.matchScore >= 0.88,
  "Stamp-only / no wash + clear crop → nonfoil boosted",
);
const washUnknown = augmentMtgSuspectAssessments(
  boltSuspects,
  boltBase,
  boltUnclearFinish,
  undefined,
  foilWashInspection({ foilWashVisible: "unknown", cropQuality: "poor" }),
);
assert(
  !washUnknown.find((a) => a.suspectId === boltFoilId)!.canEliminate,
  "Unknown wash → foil not eliminated",
);
const foilStaff = buildMtgFoilStaffExplanation({
  trap: foilTrap!,
  inspection: foilWashInspection({ foilWashVisible: "unknown", cropQuality: "poor" }),
});
assert(
  foilStaff.includes("foil and nonfoil") && foilStaff.includes("Foil wash inspection"),
  "Foil staff explanation mentions trap and inspection",
);

const boltEvidence = evidence({
  evidenceSlots: [
    slot("card_name", "Lightning Bolt"),
    slot("collector_number", "161"),
    slot("set_code", "m10"),
    slot("foil_pattern", null, "unknown"),
  ],
});
const boltLock = lockGate(boltSuspects, boltEvidence, getDetectiveGuide("mtg"), "mtg");
assert(!boltLock.locked, "MTG does not lock without finish when both exist");

function frameInspection(
  partial: Partial<MtgFrameTreatmentInspection>,
): MtgFrameTreatmentInspection {
  return {
    attempted: true,
    frameTreatment: "unknown",
    confidence: 0.85,
    cropQuality: "unknown",
    inspectedRegions: ["art_window"],
    evidenceNotes: [],
    ...partial,
  };
}

function ygoEditionInspection(
  partial: Partial<YgoEditionInspection>,
): YgoEditionInspection {
  return {
    attempted: true,
    edition: "unknown",
    holoStampColor: "unknown",
    confidence: 0.85,
    cropQuality: "unknown",
    inspectedRegions: ["edition_line"],
    evidenceNotes: [],
    ...partial,
  };
}

function prizmStampInspection(
  partial: Partial<SportsPrizmStampInspection>,
): SportsPrizmStampInspection {
  return {
    attempted: true,
    prizmStampVisible: "unknown",
    confidence: 0.85,
    cropQuality: "unknown",
    inspectedRegions: ["back_prizm_stamp"],
    evidenceNotes: [],
    ...partial,
  };
}

console.log("\n3f. MTG frame treatment — borderless vs regular");
const greavesRegular = scryfallRawToSuspects({
  id: "greaves-reg",
  name: "Lightning Greaves",
  collector_number: "234",
  set: { name: "Commander Masters", code: "cmm" },
  prices: { usd: "1.2" },
});
const greavesBorderless = scryfallRawToSuspects({
  id: "greaves-bl",
  name: "Lightning Greaves",
  collector_number: "234",
  set: { name: "Commander Masters", code: "cmm" },
  frame_effects: ["borderless"],
  prices: { usd: "3.5" },
});
const greavesSuspects = [...greavesRegular, ...greavesBorderless];
assert(greavesSuspects.length === 2, "regular + borderless greaves suspects");
const greavesEvidence = evidence({
  evidenceSlots: [
    slot("card_name", "Lightning Greaves"),
    slot("set_code", "cmm"),
    slot("collector_number", "234"),
    slot("frameTreatment", null, "unknown"),
  ],
});
const frameTrap = detectMtgFrameTreatmentTrap(greavesSuspects, greavesEvidence);
assert(Boolean(frameTrap), "Frame trap detected for borderless vs regular");
const blId = greavesBorderless[0]!.suspectId;
const regId = greavesRegular[0]!.suspectId;
const greavesBase = scoreSuspectsDeterministic(
  greavesSuspects,
  greavesEvidence,
  getDetectiveGuide("mtg"),
);
const frameBorderless = augmentMtgSuspectAssessments(
  greavesSuspects,
  greavesBase,
  greavesEvidence,
  undefined,
  undefined,
  frameInspection({ frameTreatment: "borderless", cropQuality: "clear", confidence: 0.9 }),
);
assert(
  frameBorderless.find((a) => a.suspectId === blId)!.matchScore >= 0.88,
  "Borderless inspection → borderless printing boosted",
);
const frameRegular = augmentMtgSuspectAssessments(
  greavesSuspects,
  greavesBase,
  greavesEvidence,
  undefined,
  undefined,
  frameInspection({ frameTreatment: "regular", cropQuality: "clear", confidence: 0.88 }),
);
assert(
  frameRegular.find((a) => a.suspectId === regId)!.matchScore >= 0.86,
  "Regular frame inspection → regular printing boosted",
);
const frameStaff = buildMtgFrameStaffExplanation({
  trap: frameTrap!,
  inspection: frameInspection({ frameTreatment: "unknown", cropQuality: "poor" }),
});
assert(
  frameStaff.includes("frame treatments") && frameStaff.includes("Frame inspection"),
  "Frame staff explanation mentions trap and inspection",
);

console.log("\n3g. Yu-Gi-Oh edition — 1st vs Unlimited");
const sdySuspects = ygoRawToSuspects({
  id: "46986414",
  name: "Dark Magician",
  card_sets: [
    {
      set_code: "SDY",
      set_name: "Starter Deck: Yugi",
      set_rarity: "Ultra Rare",
      set_edition: "1st Edition",
    },
    {
      set_code: "SDY",
      set_name: "Starter Deck: Yugi",
      set_rarity: "Ultra Rare",
    },
  ],
});
assert(sdySuspects.length === 2, "SDY 1st + Unlimited suspects");
const sdyEvidence = evidence({
  evidenceSlots: [
    slot("card_name", "Dark Magician"),
    slot("set_code", "SDY"),
    slot("edition", null, "unknown"),
  ],
});
const ygoTrap = detectYgoEditionTrap(sdySuspects, sdyEvidence);
assert(Boolean(ygoTrap), "YGO edition trap detected for SDY 1st vs Unlimited");
const firstId = sdySuspects.find((s) => s.edition?.includes("1st"))!.suspectId;
const unlimitedId = sdySuspects.find((s) => !s.edition?.includes("1st"))!.suspectId;
const sdyBase = scoreSuspectsDeterministic(
  sdySuspects,
  sdyEvidence,
  getDetectiveGuide("yugioh"),
);
const editionFirst = augmentYgoSuspectAssessments(
  sdySuspects,
  sdyBase,
  ygoEditionInspection({ edition: "first", cropQuality: "clear", confidence: 0.92 }),
);
assert(
  editionFirst.find((a) => a.suspectId === firstId)!.matchScore >= 0.9,
  "1st Edition stamp → 1st printing boosted",
);
const editionUnlimited = augmentYgoSuspectAssessments(
  sdySuspects,
  sdyBase,
  ygoEditionInspection({ edition: "unlimited", cropQuality: "clear", confidence: 0.9 }),
);
assert(
  editionUnlimited.find((a) => a.suspectId === unlimitedId)!.matchScore >= 0.88,
  "No stamp + clear crop → Unlimited boosted",
);
const ygoStaff = buildYgoEditionStaffExplanation({
  trap: ygoTrap!,
  inspection: ygoEditionInspection({ edition: "unknown", cropQuality: "poor" }),
});
assert(
  ygoStaff.includes("1st Edition") && ygoStaff.includes("Edition inspection"),
  "YGO staff explanation mentions edition trap",
);
const lockedYgoUnknown = applyYgoEditionIdentityLockAdjustments(
  {
    locked: true,
    lockStatus: "locked",
    confidence: 0.9,
    category: "yugioh",
    variantTags: [],
    requiredEvidenceSatisfied: true,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    winningSuspectId: firstId,
    staffMessage: "Auto lock",
  },
  sdySuspects,
  editionFirst.map((a) =>
    a.suspectId === firstId ? { ...a, matchScore: 0.85 } : a,
  ),
  ygoEditionInspection({ edition: "unknown", cropQuality: "poor" }),
);
assert(!lockedYgoUnknown.locked, "YGO not auto-locked when edition unconfirmed");

console.log("\n3h. Sports Prizm — base vs Silver Prizm parallel");
const stroudBase: CardSuspect = {
  suspectId: "sports:stroud:base",
  category: "sports",
  label: "CJ Stroud · 2023 Panini Prizm (base)",
  canonicalName: "CJ Stroud",
  catalogSource: "pricecharting",
  catalogId: "stroud",
  setName: "2023 Panini Prizm",
  finish: "raw",
  variantTags: ["raw"],
  expectedEvidence: [],
  rawCatalogData: { "console-name": "2023 Panini Prizm" },
};
const stroudParallel: CardSuspect = {
  suspectId: "sports:stroud:silver",
  category: "sports",
  label: "CJ Stroud · 2023 Panini Prizm · Silver Prizm",
  canonicalName: "CJ Stroud",
  catalogSource: "pricecharting",
  catalogId: "stroud",
  setName: "2023 Panini Prizm",
  finish: "parallel",
  variantTags: ["parallel", "silver prizm"],
  expectedEvidence: [],
  rawCatalogData: { "console-name": "2023 Panini Prizm", parallel: "Silver Prizm" },
};
const stroudSuspects = [stroudBase, stroudParallel];
const stroudEvidence = evidence({
  evidenceSlots: [
    slot("player_name", "CJ Stroud"),
    slot("card_number", "339"),
    slot("parallelName", null, "unknown"),
  ],
});
const prizmTrap = detectSportsPrizmTrap(stroudSuspects, stroudEvidence);
assert(Boolean(prizmTrap), "Sports Prizm trap detected for base vs parallel");
const stroudBaseScores = scoreSuspectsDeterministic(
  stroudSuspects,
  stroudEvidence,
  getDetectiveGuide("sports"),
);
const stampYes = augmentSportsSuspectAssessments(
  stroudSuspects,
  stroudBaseScores,
  prizmStampInspection({ prizmStampVisible: "yes", cropQuality: "clear", confidence: 0.92 }),
);
assert(
  stampYes.find((a) => a.suspectId === stroudParallel.suspectId)!.matchScore >= 0.9,
  "PRIZM stamp visible → parallel boosted",
);
const stampNo = augmentSportsSuspectAssessments(
  stroudSuspects,
  stroudBaseScores,
  prizmStampInspection({ prizmStampVisible: "no", cropQuality: "clear", confidence: 0.9 }),
);
assert(
  stampNo.find((a) => a.suspectId === stroudBase.suspectId)!.matchScore >= 0.88,
  "No PRIZM stamp → base boosted",
);
const prizmStaff = buildSportsPrizmStaffExplanation({
  trap: prizmTrap!,
  inspection: prizmStampInspection({ prizmStampVisible: "unknown", cropQuality: "poor" }),
});
assert(
  prizmStaff.includes("PRIZM") && prizmStaff.includes("back"),
  "Sports Prizm staff explanation mentions back stamp",
);
const lockedPrizmUnknown = applySportsPrizmIdentityLockAdjustments(
  {
    locked: true,
    lockStatus: "locked",
    confidence: 0.9,
    category: "sports",
    variantTags: [],
    requiredEvidenceSatisfied: true,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    winningSuspectId: stroudParallel.suspectId,
    staffMessage: "Auto lock",
  },
  stroudSuspects,
  stampYes.map((a) =>
    a.suspectId === stroudParallel.suspectId ? { ...a, matchScore: 0.86 } : a,
  ),
  prizmStampInspection({ prizmStampVisible: "unknown", cropQuality: "poor" }),
);
assert(!lockedPrizmUnknown.locked, "Sports not auto-locked when Prizm stamp unconfirmed");

console.log("\n4. MTG same artwork different set — no set evidence");
const diffSetSuspects = [
  ...scryfallRawToSuspects({
    id: "a",
    name: "Lightning Bolt",
    collector_number: "161",
    set: { name: "M10", code: "m10" },
    prices: { usd: "1" },
  }),
  ...scryfallRawToSuspects({
    id: "b",
    name: "Lightning Bolt",
    collector_number: "209",
    set: { name: "A25", code: "a25" },
    prices: { usd: "2" },
  }),
];
const noSetEvidence = evidence({
  evidenceSlots: [slot("card_name", "Lightning Bolt")],
});
const noSetLock = lockGate(
  diffSetSuspects,
  noSetEvidence,
  getDetectiveGuide("mtg"),
  "mtg",
);
assert(!noSetLock.locked, "does not lock MTG without set/collector evidence");

console.log("\n5. Yu-Gi-Oh same name different rarity/edition");
const ygoSuspects = ygoRawToSuspects({
  id: "89631139",
  name: "Blue-Eyes White Dragon",
  card_sets: [
    { set_code: "SDK", set_name: "Starter Deck", set_rarity: "Ultra Rare" },
    { set_code: "LOB", set_name: "Legend of Blue Eyes", set_rarity: "Ultra Rare", set_edition: "1st Edition" },
  ],
});
assert(ygoSuspects.length >= 2, "ygo expands card_sets into suspects");
const ygoEvidence = evidence({
  evidenceSlots: [slot("card_name", "Blue-Eyes White Dragon")],
});
const ygoLock = lockGate(ygoSuspects, ygoEvidence, getDetectiveGuide("yugioh"), "yugioh");
assert(!ygoLock.locked, "ygo does not lock without set/rarity/edition");

console.log("\n6. Sports player + card number, unclear parallel");
const sportsSuspects = priceChartingToSuspects(
  {
    id: "123",
    "product-name": "CJ Stroud",
    "console-name": "2023 Panini Prizm",
  },
  "sports",
);
const sportsEvidence = evidence({
  evidenceSlots: [
    slot("player_name", "CJ Stroud"),
    slot("card_number", "339"),
    slot("parallel_indicator", null, "unknown"),
  ],
});
const sportsLock = lockGate(
  sportsSuspects,
  sportsEvidence,
  getDetectiveGuide("sports"),
  "sports",
);
assert(!sportsLock.locked, "sports does not lock with unclear parallel");

console.log("\n7. Sports serial number visible");
const serialEvidence = evidence({
  evidenceSlots: [
    slot("player_name", "CJ Stroud"),
    slot("serial_number", "12/99"),
    slot("parallel_indicator", "numbered"),
  ],
});
const serialScore = scoreSuspectDeterministic(
  sportsSuspects[0]!,
  serialEvidence,
  getDetectiveGuide("sports"),
);
assert(serialScore.supportingEvidence.length > 0, "serial evidence supports suspect");

console.log("\n8. Slab readable label can lock");
const slabSuspects = priceChartingToSuspects(
  { id: "456", "product-name": "Charizard", "console-name": "Base Set" },
  "sports",
  { graded: true, gradingCompany: "PSA", grade: "10" },
);
const slabEvidence = evidence({
  evidenceSlots: [
    slot("card_name", "Charizard"),
    slot("slab_company", "PSA"),
    slot("slab_grade", "10"),
    slot("cert_number", "12345678"),
  ],
  identificationMode: "safe_to_continue",
});
const slabAssessments = scoreSuspectsDeterministic(
  slabSuspects,
  slabEvidence,
  getDetectiveGuide("sports"),
);
const gradedSuspect = slabSuspects.find((s) => s.finish === "graded");
const gradedAssessment = slabAssessments.find(
  (a) => a.suspectId === gradedSuspect?.suspectId,
);
assert(
  (gradedAssessment?.matchScore ?? 0) > (slabAssessments[1]?.matchScore ?? 0),
  "graded suspect scores higher with slab evidence",
);

console.log("\n9. Slab label/card mismatch → manual review");
const mismatchEvidence = evidence({
  evidenceSlots: [
    slot("card_name", "Wrong Name"),
    slot("slab_company", "PSA"),
    slot("slab_grade", "10"),
  ],
  identificationMode: "manual_review",
});
const mismatchLock = lockGate(slabSuspects, mismatchEvidence, getDetectiveGuide("sports"), "sports");
assert(
  mismatchLock.lockStatus === "manual_review_recommended" ||
    !mismatchLock.locked,
  "slab/name mismatch recommends manual review or no lock",
);

console.log("\n10. No candidates → not_locked_no_candidates");
const emptyLock = runIdentityLockGate({
  suspects: [],
  assessments: [],
  detectiveGuide: pokemonGuide,
  imageEvidence: morganEvidence,
  category: "pokemon",
});
assert(
  emptyLock.lockStatus === "not_locked_no_candidates",
  "empty suspects → not_locked_no_candidates",
);

console.log("\n11. MTG guide surfaces identification formula when not locked");
const mtgGuide = getDetectiveGuide("mtg");
assert(
  Boolean(mtgGuide.identificationFormula?.includes("set code")),
  "mtg guide includes identification formula",
);
assert(
  noSetLock.staffMessage.includes("Safe lookup:"),
  "not-locked MTG staff message includes safe lookup formula",
);

console.log("\n12. Scryfall query builder uses set code + collector number");
const scryfallQueries = buildScryfallQueries({
  category: "magic",
  itemType: "raw",
  cardName: "She-Hulk, Jade Defender",
  setCode: "MSH",
  cardNumber: "0188",
  conditionEstimate: "LP",
  confidence: 0.9,
});
assert(
  scryfallQueries.some((q) => q.includes("set:msh") && q.includes("cn:188")),
  "buildScryfallQueries prefers set+collector",
);
assert(
  normalizeScryfallCollectorNumber("0188") === "188",
  "normalizeScryfallCollectorNumber strips leading zeros",
);

console.log("\n13. Staff suspect selection persists on identity bundle");
const pickerIdentity = {
  category: "mtg" as const,
  suspects: boltSuspects,
  suspectAssessments: scoreSuspectsDeterministic(
    boltSuspects,
    boltEvidence,
    getDetectiveGuide("mtg"),
  ),
  lockedIdentity: boltLock,
  candidateGenerationNotes: [],
  createdAt: new Date().toISOString(),
};
const foilId = boltSuspects.find((s) => s.finish === "foil")!.suspectId;
const withStaff = applyStaffSuspectSelection(pickerIdentity, {
  suspectId: foilId,
  confirmedBy: "test@staff",
});
assert(
  getStaffSelectedSuspect(withStaff)?.finish === "foil",
  "staff selection resolves foil suspect",
);
const rows = buildSuspectPickerRows(withStaff);
assert(rows.length === boltSuspects.length, "picker rows cover all suspects");

console.log("\n14. Pokémon parallel finish — do not hard-eliminate reverse holo on weak normal claim");
const pokeSuspects = pokemonRawToSuspects({
  id: "grusha",
  name: "Grusha",
  number: "184",
  set: { name: "Paldea Evolved", id: "sv2" },
  tcgplayer: { prices: { normal: "0.1", reverseHolofoil: "0.12" } },
});
const grushaEvidence = evidence({
  evidenceSlots: [
    slot("card_name", "Grusha"),
    slot("set_name", "Paldea Evolved"),
    slot("collector_number", "184"),
    {
      field: "foil_pattern",
      value: "normal",
      status: "observed" as const,
      confidence: 0.75,
      source: "front_image" as const,
    },
  ],
});
const grushaAssessments = scoreSuspectsDeterministic(
  pokeSuspects,
  grushaEvidence,
  getDetectiveGuide("pokemon"),
);
const reverseSuspect = pokeSuspects.find((s) =>
  String(s.finish).includes("reverse"),
);
const reverseAssessment = grushaAssessments.find(
  (a) => a.suspectId === reverseSuspect?.suspectId,
);
const normalAssessment = grushaAssessments.find(
  (a) => a.suspectId === pokeSuspects.find((s) => s.finish === "normal")?.suspectId,
);
assert(
  (reverseAssessment?.matchScore ?? 0) >= 0.65,
  "reverse holo stays competitive when normal claim is soft",
);
assert(
  !reverseAssessment?.canEliminate,
  "reverse holo not eliminated on weak normal finish evidence",
);
assert(
  Math.abs((reverseAssessment?.matchScore ?? 0) - (normalAssessment?.matchScore ?? 0)) < 0.15,
  "normal and reverse holo scores stay close when finish uncertain",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
