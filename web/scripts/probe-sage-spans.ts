import { segmentAbilities, segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { detectGrantedRulesSpans } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-granted-rules-span-detector";

const text = "Flying\nWhenever you cast a noncreature spell, creatures you control gain lifelink until end of turn.";
const oracleId = "02c741d0-99d3-48e5-9846-0fea5a0a29fe";
for (const face of segmentCardFaces(text)) {
  for (const ab of segmentAbilities(oracleId, face.faceId, face.text, face.start)) {
    console.log("ability:", JSON.stringify(ab.paragraphText));
    console.log("spans:", detectGrantedRulesSpans(ab.paragraphText, ab.abilityId));
  }
}
