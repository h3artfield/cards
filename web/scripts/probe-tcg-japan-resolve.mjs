import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const { extractPokemonScanIdentity, buildScanDerivedPokemonSuspect, tryPriceChartingExactJapanesePokemon } =
  await import("../src/lib/card-flow-v2/pokemon-japanese-fallback.ts");
const { enrichPokemonScanDerivedTcgplayerJapan, resolveTcgplayerJapanPokemon, fetchTcgplayerProductDetails } =
  await import("../src/lib/card-flow-v2/tcgplayer-japan-catalog.ts");
const { referenceImagesFromSuspect } = await import("../src/lib/card-flow-v2/suspect-reference-image.ts");

const evidence = {
  identificationMode: "continue_with_variant_uncertainty",
  evidenceSlots: [
    { field: "card_name", value: "Torkoal", status: "observed", confidence: 0.92 },
    { field: "set_name", value: "Crimson Haze", status: "observed", confidence: 0.9 },
    { field: "set_code", value: "SV5A", status: "observed", confidence: 0.88 },
    { field: "collector_number", value: "069/066", status: "observed", confidence: 0.9 },
    { field: "language", value: "jp", status: "observed", confidence: 0.95 },
  ],
};

const scan = extractPokemonScanIdentity(evidence);
console.log("scan", scan);

const pc = await tryPriceChartingExactJapanesePokemon(scan);
console.log("pc exact", pc ? { id: pc.id, name: pc["product-name"], tcg: pc["tcg-id"] } : null);

const tcgDirect = await fetchTcgplayerProductDetails(566124);
console.log("tcg566124", tcgDirect?.productName, tcgDirect?.productLineName);

const resolved = await resolveTcgplayerJapanPokemon(scan);
console.log("resolved", resolved);

const built = buildScanDerivedPokemonSuspect(scan, "manual_price_required");
const enriched = await enrichPokemonScanDerivedTcgplayerJapan({
  suspects: [built.suspect],
  imageEvidence: evidence,
});
console.log("notes", enriched.notes);
console.log("refs", referenceImagesFromSuspect(enriched.suspects[0]));
