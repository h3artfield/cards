/**
 * Directive 006G — Riftbound knowledge + catalog tests.
 * Run: npm run test:riftbound-knowledge
 */
import {
  parseRiftboundCollectorNumber,
  getRiftboundFinishLockRule,
  getRiftboundLockBlockers,
  inferRiftboundSignatureType,
  RIFTBOUND_DETECTIVE_GUIDE,
  riftboundRequiresStaffReviewForPreview,
  riftboundSetCodeHasFoilVariants,
} from "../src/lib/card-flow-v2/knowledge/riftbound";
import { searchRiftboundLocalFixtures } from "../src/lib/card-flow-v2/catalogs/riftbound-fixtures";
import { generateRiftboundCandidates } from "../src/lib/card-flow-v2/riftbound-candidate-generator";
import {
  assessRiftboundCompVariant,
  riftboundVariantContextFromSuspect,
} from "../src/lib/card-flow-v2/market/riftbound-comp-rules";
import { getDetectiveGuide } from "../src/lib/card-flow-v2/detective-guides";
import type { ImageEvidenceReport } from "../src/lib/card-flow-v2/types";

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

function stubEvidence(slots: Record<string, string>): ImageEvidenceReport {
  return {
    imageUsability: "good",
    canAttemptIdentification: true,
    canAutoLockIdentity: false,
    detectedCardCount: 1,
    detectedSides: ["front"],
    visualProblems: [],
    extractedText: [],
    evidenceSlots: Object.entries(slots).map(([field, value]) => ({
      field,
      value,
      status: "observed" as const,
      confidence: 0.9,
      source: "front_image" as const,
    })),
    missingCriticalEvidence: [],
    identificationMode: "continue_with_variant_uncertainty",
    staffMessage: "test",
  };
}

async function main() {
  console.log("Riftbound knowledge tests\n");

  console.log("1. parse 061/298 OGN — not overnumbered");
  const base = parseRiftboundCollectorNumber("061/298", "OGN");
  assert(!base.isOvernumbered, "061/298 not overnumbered");
  assert(!base.hasAltArtSuffix, "no alt suffix");

  console.log("\n2. parse 303 OGN — overnumbered");
  const on = parseRiftboundCollectorNumber("303", "OGN");
  assert(on.isOvernumbered === true, "303 is overnumbered");

  console.log("\n3. parse 30a — alternate art");
  const alt = parseRiftboundCollectorNumber("30a", "OGN");
  assert(alt.hasAltArtSuffix === true, "30a alt art suffix");

  console.log("\n4. parse 303* — signature asterisk");
  const sig = parseRiftboundCollectorNumber("303*", "OGN");
  assert(sig.hasSignatureAsterisk === true, "303* has asterisk");
  assert(sig.isOvernumbered === true, "303* overnumbered");

  console.log("\n5. OGS no foil variants");
  assert(riftboundSetCodeHasFoilVariants("OGS") === false, "OGS no foil");
  assert(riftboundSetCodeHasFoilVariants("OGN") === true, "OGN has foil");

  console.log("\n6. Common/Uncommon finish lock when both exist");
  const commonLock = getRiftboundFinishLockRule({
    setCode: "OGN",
    rarity: "common",
    hasFoilAndNonfoilSuspects: true,
  });
  assert(commonLock.finishRequiredToLock === true, "common needs finish");

  console.log("\n7. Rare default foil does not require finish lock");
  const rareLock = getRiftboundFinishLockRule({
    setCode: "OGN",
    rarity: "rare",
  });
  assert(rareLock.finishRequiredToLock === false, "rare default foil ok");

  console.log("\n8. Signature visible without asterisk — uncertain");
  const blockers = getRiftboundLockBlockers({
    identity: {
      name: "Ahri",
      setCode: "OGN",
      collectorNumber: "303",
      parsedCollectorNumber: parseRiftboundCollectorNumber("303", "OGN"),
      signatureType: "unknown",
    },
  });
  assert(blockers.includes("signature_status_uncertain"), "signature uncertain");

  console.log("\n9. Separate signature vs non-signature suspects");
  const cards = searchRiftboundLocalFixtures({ name: "Ahri" });
  const sigCard = cards.find((c) => c.identity.signatureType === "official_signature_overnumber");
  const onCard = cards.find(
    (c) => c.identity.rarity === "overnumbered" && c.identity.signatureType === "none",
  );
  assert(Boolean(sigCard && onCard), "both signature and non-signature fixtures");

  console.log("\n10–13. Comp variant rejection");
  const baseCtx = { isAltArt: false, isOvernumbered: false, isSignature: false, isBase: true, isUltimate: false };
  const altCtx = { isAltArt: true, isOvernumbered: false, isSignature: false, isBase: false, isUltimate: false };
  const onCtx = { isAltArt: false, isOvernumbered: true, isSignature: false, isBase: false, isUltimate: false };
  const sigCtx = { isAltArt: false, isOvernumbered: true, isSignature: true, isBase: false, isUltimate: false };

  assert(
    assessRiftboundCompVariant("Riftbound Ahri Alternate Art #30a", baseCtx) === "wrong_finish",
    "base rejects alt art comp",
  );
  assert(
    assessRiftboundCompVariant("Riftbound Ahri Overnumbered #303", baseCtx) === "wrong_finish",
    "base rejects overnumbered comp",
  );
  assert(
    assessRiftboundCompVariant("Riftbound Ahri Overnumbered #303", sigCtx) === "wrong_finish",
    "signature rejects non-signature comp",
  );
  assert(
    assessRiftboundCompVariant("Ahri hand signed autograph #303", sigCtx) === "wrong_finish",
    "aftermarket signed rejected for official signature",
  );

  console.log("\n14. Ultimate blocks preview");
  const ultReview = riftboundRequiresStaffReviewForPreview({
    identity: { name: "Baron Nashor", rarity: "ultimate" },
  });
  assert(ultReview.required === true, "ultimate requires staff review");

  console.log("\n15. High-value signature requires staff review");
  const sigReview = riftboundRequiresStaffReviewForPreview({
    identity: {
      name: "Ahri",
      signatureType: "official_signature_overnumber",
      parsedCollectorNumber: parseRiftboundCollectorNumber("303*", "OGN"),
    },
    marketValue: 2482,
  });
  assert(sigReview.required === true, "signature requires staff review");

  console.log("\nRegression — detective guide richer than generic");
  const generic = getDetectiveGuide("unknown");
  assert(
    RIFTBOUND_DETECTIVE_GUIDE.variantTraps.length > generic.variantTraps.length,
    "riftbound guide richer",
  );
  assert(
    RIFTBOUND_DETECTIVE_GUIDE.identificationFormula != null,
    "has identification formula",
  );

  console.log("\nRegression — candidate generation separates variants");
  const gen = await generateRiftboundCandidates({
    imageEvidence: stubEvidence({
      card_name: "Ahri",
      set_code: "OGN",
      collector_number: "30a",
    }),
    categoryClassification: { category: "riftbound", confidence: 0.9, evidence: [], detectedSides: ["front"], needsHigherVision: false },
    detectiveGuide: RIFTBOUND_DETECTIVE_GUIDE,
  });
  assert(
    gen.suspects.every((s) => s.collectorNumber?.endsWith("a") || s.variantTags.includes("alternate_art")),
    "alt-art search yields alt suspects only",
  );

  console.log("\nRegression — OGS no foil suspects");
  const ogsGen = await generateRiftboundCandidates({
    imageEvidence: stubEvidence({
      card_name: "Jinx",
      set_code: "OGS",
      collector_number: "012",
    }),
    categoryClassification: { category: "riftbound", confidence: 0.9, evidence: [], detectedSides: ["front"], needsHigherVision: false },
    detectiveGuide: RIFTBOUND_DETECTIVE_GUIDE,
  });
  assert(
    !ogsGen.suspects.some((s) => s.finish === "foil"),
    "OGS excludes foil suspects",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
