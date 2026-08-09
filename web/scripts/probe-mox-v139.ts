import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { evaluateCaseSemantic } from "./oracle-action-semantic-matcher";

const raw = JSON.parse(readFileSync(resolve("data/oracle-action-eval-development-v26-v14.json"), "utf8")).cases;
const c = applyGoldMigrationV135(raw).find((x: { id: string }) => x.id === "dev-v9-001")!;
const p = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText });
console.log("mox metrics", evaluateCaseSemantic(c, p));
for (const a of p.actions.filter((x) => x.reviewStatus === "accepted")) {
  console.log({
    type: a.actionType,
    text: a.provenance.actionSpan.text,
    src: a.extractionSource,
    ctx: a.executionContext,
    opt: a.optionalEffect,
    clause: a.clauseId,
  });
}
