/**
 * Directive 012 — TCGplayer Japan catalog lookup for scan-derived Pokémon.
 * Run: npm run test:directive-012-tcgplayer-japan
 */
import {
  buildScanDerivedPokemonSuspect,
  extractPokemonScanIdentity,
  suspectBlocksTcgplayerPricing,
} from "../src/lib/card-flow-v2/pokemon-japanese-fallback";
import { referenceImagesFromSuspect } from "../src/lib/card-flow-v2/suspect-reference-image";
import { buildTcgplayerProductUrl } from "../src/lib/card-flow-v2/market/tcgplayer-product-url";
import { buildSuspectSearchPlan } from "../src/lib/card-flow-v2/market/search-plan-builder";
import { suspectBlocksTcgplayerPricingFromPlan } from "../src/lib/card-flow-v2/market/tcgplayer-japanese-guard";
import {
  isExactJapanesePokemonTcgplayerMatch,
  tcgplayerProductImageUrl,
} from "../src/lib/card-flow-v2/tcgplayer-japan-catalog";
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

function torkoalEvidence(): ImageEvidenceReport {
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

console.log("\nDirective 012 — TCGplayer Japan catalog\n");

console.log("Exact match guard");
const scan = extractPokemonScanIdentity(torkoalEvidence());
assert(Boolean(scan), "scan identity extracted");
const tcgRow = {
  productId: 566124,
  productName: "Torkoal - 069/066",
  productLineName: "Pokemon Japan",
  productLineId: 85,
  setName: "SV5a: Crimson Haze",
  setCode: "SV5a",
  customAttributes: { number: "069/066" },
};
const englishRow = {
  productId: 999,
  productName: "Torkoal",
  productLineName: "Pokemon",
  productLineId: 3,
  setName: "Chilling Reign",
  setCode: "cre",
  customAttributes: { number: "172/198" },
};
assert(
  isExactJapanesePokemonTcgplayerMatch(tcgRow, scan!),
  "TCGplayer Japan row accepted",
);
assert(
  !isExactJapanesePokemonTcgplayerMatch(englishRow, scan!),
  "English TCGplayer row rejected",
);

console.log("\nSuspect wiring");
const tcgProduct = {
  productId: "566124",
  productName: "Torkoal - 069/066",
  productLineName: "Pokemon Japan",
  setName: "SV5a: Crimson Haze",
  setCode: "SV5a",
  cardNumber: "069/066",
  marketPrice: 2.61,
  lowestPrice: 1.68,
  productUrl: "https://www.tcgplayer.com/product/566124",
  imageUrl: tcgplayerProductImageUrl(566124),
  resolutionSource: "pricecharting_tcg_id" as const,
};
const built = buildScanDerivedPokemonSuspect(
  scan!,
  "tcgplayer_japan_exact",
  undefined,
  tcgProduct,
);
assert(
  !suspectBlocksTcgplayerPricing(built.suspect),
  "TCG pricing allowed when Japan product attached",
);
const refs = referenceImagesFromSuspect(built.suspect);
assert(refs.hasReferenceImage, "reference image present");
assert(refs.referenceImageSource === "tcgplayer", "reference source is TCGplayer");
assert(
  refs.referenceImageUrl?.includes("566124") === true,
  "reference image uses TCGplayer CDN",
);

const plan = buildSuspectSearchPlan(built.suspect);
assert(plan.tcgplayerJapanProductId === "566124", "market plan carries Japan product id");
assert(
  !suspectBlocksTcgplayerPricingFromPlan(plan),
  "market fetch uses Japan catalog not English API",
);

const tcgLink = buildTcgplayerProductUrl({ suspect: built.suspect });
assert(
  tcgLink === "https://www.tcgplayer.com/product/566124",
  "staff link opens verified Japan product page",
);

console.log("\nEnrichment gate — language en but Japanese native name");
const englishLangBuilt = buildScanDerivedPokemonSuspect(
  { ...scan!, language: "en" },
  "manual_price_required",
);
assert(
  englishLangBuilt.suspect.rawCatalogData &&
    (englishLangBuilt.suspect.rawCatalogData as { nativeName?: string }).nativeName ===
      "コータス",
  "native name preserved on scan-derived meta",
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
