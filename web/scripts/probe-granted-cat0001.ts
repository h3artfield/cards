import { readFileSync } from "node:fs";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { detectQuoteSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-quote-span-detector";
import { detectGrantedRulesSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector";
import { classifyGrantedRulesSpan } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-classifier";
import { findGrantedQuoteContexts } from "../src/lib/deck-builder/golden-catalog/oracle-granted-ability-extraction";

const c = (
  JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
    cases: Array<{ id: string; oracleId: string; oracleText: string }>;
  }
).cases.find((x) => x.id === "rc3-pos-cat-0001")!;

for (const face of segmentCardFaces(c.oracleText)) {
  for (const ab of segmentAbilities(c.oracleId, face.faceId, face.text, face.start)) {
    console.log("ability", ab.abilityIndex, ab.paragraphText.slice(0, 80));
    console.log("quotes", detectQuoteSpans(ab.paragraphText));
    const spans = detectGrantedRulesSpans(ab.paragraphText);
    console.log("granted spans", spans.map((s) => s.innerText));
    for (const s of spans) console.log("  class", classifyGrantedRulesSpan(ab.paragraphText, s).classification);
    console.log("contexts", findGrantedQuoteContexts(ab.paragraphText, "p").map((x) => x.innerText));
  }
}
