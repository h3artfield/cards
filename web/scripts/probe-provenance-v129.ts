import { readFileSync } from "node:fs";
import { segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";

const env = JSON.parse(readFileSync("data/oracle-action-eval-development-v26.json", "utf8"));
for (const id of ["dev-opt-034", "eval-0013"]) {
  const c = env.cases.find((x: { id: string }) => x.id === id);
  console.log("===", id, "===");
  console.log("text len", c.oracleText.length);
  console.log("faces", segmentCardFaces(c.oracleText));
  const parse = parseOracleSemantics({ oracleId: c.oracleId, oracleText: c.oracleText });
  for (const a of parse.actions.filter((x) => x.provenance.targetSpan)) {
    const parent = parse.abilities.find((ab) => ab.abilityId === a.parentAbilityId);
    console.log({
      action: a.provenance.actionSpan,
      target: a.provenance.targetSpan,
      parentSpan: parent?.abilitySpan,
      parentFace: parent?.faceId,
    });
  }
}
