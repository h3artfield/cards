import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseOracleSemanticsRC3 } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse-rc3";
import { applyGoldMigrationV135 } from "./lib/rc3-gold-migration-v135";
import { evaluateCaseSemantic } from "./oracle-action-semantic-matcher";

const cat = applyGoldMigrationV135(
  (JSON.parse(readFileSync(resolve("data/oracle-action-eval-rc3-positive-training-catalog-v133.json"), "utf8")) as {
    cases: Array<{ id: string; oracleId: string; oracleText: string; expectedPrimitiveActions: unknown[]; forbiddenPrimitiveActions?: string[] }>;
  }).cases,
);
const c = cat.find((x) => x.id === "rc3-pos-cat-0007")!;
console.log("forbidden:", c.forbiddenPrimitiveActions);
console.log("gold L2:", c.expectedPrimitiveActions.filter((g: { negative?: boolean }) => !g.negative).map((g: { actionType: string; evidenceContains?: string }) => ({ type: g.actionType, ev: g.evidenceContains?.slice(0, 50) })));
const p = parseOracleSemanticsRC3({ oracleId: c.oracleId, oracleText: c.oracleText });
console.log("metrics:", evaluateCaseSemantic(c, p));
console.log(
  "emitted:",
  p.actions
    .filter((a) => a.reviewStatus === "accepted")
    .map((a) => ({ type: a.actionType, text: a.provenance.actionSpan.text.slice(0, 60) })),
);
