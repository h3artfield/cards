/**
 * Directive 011 — version picker visual reference compare.
 * Run: npm run test:directive-011-visual-compare
 */
import { referenceImagesFromSuspect } from "../src/lib/card-flow-v2/suspect-reference-image";
import { buildSuspectPickerRows } from "../src/lib/card-flow-v2/staff-suspect-selection";
import type { CardCandidateBundle, CardSuspect } from "../src/lib/card-flow-v2/types";

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

function scryfallSuspect(): CardSuspect {
  return {
    suspectId: "scryfall:test:nonfoil",
    category: "mtg",
    label: "Lightning Bolt · M10 · #146 · nonfoil",
    canonicalName: "Lightning Bolt",
    catalogSource: "scryfall",
    catalogId: "test",
    setName: "Magic 2010",
    setCode: "m10",
    collectorNumber: "146",
    finish: "nonfoil",
    variantTags: [],
    expectedEvidence: [],
    referenceImageUrls: ["https://cards.scryfall.io/normal/front/a/b.jpg"],
    rawCatalogData: {
      image_uris: {
        normal: "https://cards.scryfall.io/normal/front/a/b.jpg",
      },
      scryfall_uri: "https://scryfall.com/card/m10/146",
    },
  };
}

function pokemonSuspect(): CardSuspect {
  return {
    suspectId: "pokemon_tcg:sv1-001:normal",
    category: "pokemon",
    label: "Sprigatito · Scarlet & Violet · 001/198",
    canonicalName: "Sprigatito",
    catalogSource: "pokemon_tcg",
    catalogId: "sv1-001",
    setName: "Scarlet & Violet",
    setCode: "sv1",
    collectorNumber: "001/198",
    variantTags: [],
    expectedEvidence: [],
    referenceImageUrls: ["https://images.pokemontcg.io/sv1/1_hires.png"],
    rawCatalogData: {
      images: { large: "https://images.pokemontcg.io/sv1/1_hires.png" },
    },
  };
}

function scanDerivedSuspect(): CardSuspect {
  return {
    suspectId: "scan_derived:pokemon:sv5a:069/066:torkoal:jp",
    category: "pokemon",
    label: "Torkoal / コータス · Crimson Haze · SV5A · 069/066",
    canonicalName: "Torkoal",
    catalogSource: "scan_derived_fallback",
    setName: "Crimson Haze",
    setCode: "SV5A",
    collectorNumber: "069/066",
    language: "jp",
    variantTags: ["scan_derived", "japanese"],
    expectedEvidence: [],
    rawCatalogData: {
      identitySource: "scan_derived_fallback",
      catalogVerified: false,
      catalogSource: null,
      displayName: "Torkoal",
      nativeName: "コータス",
      pricingStatus: "manual_price_required",
    },
  };
}

console.log("\nDirective 011 — visual reference compare\n");

console.log("Reference image extraction");
const scryfall = referenceImagesFromSuspect(scryfallSuspect());
assert(scryfall.hasReferenceImage, "Scryfall suspect has reference image");
assert(scryfall.referenceImageSource === "scryfall", "Scryfall source label");
assert(
  scryfall.referenceImageUrl?.includes("scryfall.io"),
  "Scryfall image URL resolved",
);

const poke = referenceImagesFromSuspect(pokemonSuspect());
assert(poke.hasReferenceImage, "Pokémon suspect has reference image");
assert(poke.referenceImageSource === "pokemon_tcg", "Pokémon TCG source");

const scan = referenceImagesFromSuspect(scanDerivedSuspect());
assert(!scan.hasReferenceImage, "Scan-derived without catalog has no reference");
assert(scan.referenceImageSource === "unknown", "Unknown source when no image");

console.log("\nPicker rows expose compare fields");
const identity: CardCandidateBundle = {
  category: "mtg",
  suspects: [scryfallSuspect(), pokemonSuspect(), scanDerivedSuspect()],
  suspectAssessments: [],
  lockedIdentity: {
    locked: false,
    lockStatus: "not_locked_no_candidates",
    confidence: 0,
    category: "mtg",
    variantTags: [],
    requiredEvidenceSatisfied: false,
    missingRequiredEvidence: [],
    unresolvedVariantRisks: [],
    staffMessage: "Pick a printing.",
  },
};
const rows = buildSuspectPickerRows(identity);
assert(rows.length === 3, "three picker rows");
assert(rows[0]?.hasReferenceImage === true, "MTG row hasReferenceImage");
assert(
  rows[0]?.referenceImageSourceLabel === "Scryfall",
  "Scryfall source label on row",
);
assert(rows[2]?.hasReferenceImage === false, "scan-derived row has no image");
assert(
  rows[2]?.referenceImageUrl == null,
  "scan-derived row referenceImageUrl empty",
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
