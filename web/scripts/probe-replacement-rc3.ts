import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { evaluateCaseSemantic } from "./oracle-action-semantic-matcher";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const ids = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["rc3-pos-cat-0017", "rc3-pos-cat-0018", "rc3-pos-cat-0019", "rc3-pos-cat-0020"];

const raw = JSON.parse(readFileSync(resolve("data/oracle-action-eval-rc3-positive-training-catalog-v133.json"), "utf8")) as {
  cases: OracleActionEvalCaseV2[];
};
const cases = applyGoldMigrationV135(raw.cases.filter((c) => ids.includes(c.id)));

for (const c of cases) {
  const parse = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
  const m = evaluateCaseSemantic(c, parse);
  console.log("\n===", c.id, m);
  for (const a of parse.actions) {
    console.log({
      type: a.actionType,
      status: a.reviewStatus,
      face: parse.abilities.find((ab) => ab.abilityId === a.parentAbilityId)?.faceId,
      clause: a.clauseId,
      text: a.provenance.actionSpan.text.slice(0, 60),
      ctx: a.executionContext,
    });
  }
}
