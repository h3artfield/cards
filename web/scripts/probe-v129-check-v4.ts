import { readFileSync } from "node:fs";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";
import { buildLoyaltyAbilities } from "../src/lib/deck-builder/golden-catalog/oracle-action-structural-blocks";
import { segmentCardFaces } from "../src/lib/deck-builder/golden-catalog/oracle-ability-segmentation";

const ids = [
  "dev-exp-chk-v4-003",
  "dev-exp-chk-v4-004",
  "dev-exp-chk-v4-014",
  "dev-exp-chk-v4-019",
  "dev-exp-chk-v4-020",
  "dev-exp-chk-v4-021",
  "dev-exp-chk-v4-022",
];
const env = JSON.parse(
  readFileSync("data/oracle-action-eval-development-generalization-expansion-check-v4.json", "utf8"),
);

for (const id of ids) {
  const c = env.cases.find((x: { id: string }) => x.id === id);
  console.log("===", id, c.cardName, "===");
  console.log(c.oracleText);
  const faces = segmentCardFaces(c.oracleText);
  for (const f of faces) {
    const blocks = buildLoyaltyAbilities(c.oracleId, f.faceId, f.text, f.start);
    if (blocks.length) console.log("loyalty blocks", blocks.map((b) => ({ cost: b.loyaltyCost, text: b.fullAbilityText.slice(0, 80) })));
  }
  const p = parseOracleSemantics({ oracleId: c.oracleId, oracleText: c.oracleText });
  console.log(
    "actions",
    p.actions
      .filter((a) => a.reviewStatus === "accepted")
      .map((a) => ({
        t: a.actionType,
        opt: a.optionalEffect,
        loyalty: p.abilities.find((ab) => ab.abilityId === a.parentAbilityId)?.loyaltyCost,
        text: a.provenance.actionSpan.text.slice(0, 80),
      })),
  );
  console.log("");
}
