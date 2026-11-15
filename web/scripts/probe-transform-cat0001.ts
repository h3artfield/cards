import { readFileSync } from "node:fs";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { applyRC3Transforms } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-transform";
import { clearRC3PromotedFamilies } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-promotion";

const c = (
  JSON.parse(readFileSync("data/oracle-action-eval-rc3-positive-training-catalog-v133.json", "utf8")) as {
    cases: Array<{ id: string; oracleId: string; oracleText: string }>;
  }
).cases.find((x) => x.id === "rc3-pos-cat-0001")!;

clearRC3PromotedFamilies();
const v1 = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText });
console.log(
  "v1 add_mana",
  v1.actions.filter((a) => a.actionType === "add_mana").map((a) => a.evidenceText),
);
const rc3 = applyRC3Transforms(v1, { oracleId: c.oracleId, oracleText: c.oracleText });
console.log(
  "rc3 add_mana",
  rc3.actions
    .filter((a) => a.actionType === "add_mana")
    .map((a) => ({ ev: a.evidenceText, src: (a as { extractionSource?: string }).extractionSource })),
);
console.log(
  "rc3 all",
  rc3.actions.map((a) => `${a.actionType}:${a.evidenceText.slice(0, 40)}`),
);
