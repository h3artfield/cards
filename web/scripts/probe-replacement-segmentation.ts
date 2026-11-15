import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";

const id = process.argv[2] ?? "rc3-pos-cat-0017";
const c = JSON.parse(readFileSync(resolve("data/oracle-action-eval-rc3-positive-training-catalog-v133.json"), "utf8")).cases.find(
  (x: { id: string }) => x.id === id,
);
if (!c) throw new Error(`case not found: ${id}`);

const faces = segmentCardFaces(c.oracleText);
for (const f of faces) {
  console.log("FACE", f.faceId);
  const abs = segmentAbilities(c.oracleId, f.faceId, f.text, f.start);
  for (const a of abs) {
    console.log(" ability", a.abilityIndex, a.abilityType, a.paragraphText);
    const insteadIdx = a.paragraphText.search(/\binstead\b/i);
    const would = insteadIdx > 0 && /\bwould\b/i.test(a.paragraphText.slice(0, insteadIdx));
    console.log("  insteadIdx", insteadIdx, "isReplacement", would);
  }
}
