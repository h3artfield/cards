import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { extractClauseNativeActions } from "../src/lib/deck-builder/golden-catalog/oracle-rc3-clause-native";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const id = process.argv[2] ?? "rc3-pos-cat-0017";
const c = JSON.parse(readFileSync(resolve("data/oracle-action-eval-rc3-positive-training-catalog-v133.json"), "utf8")).cases.find(
  (x: { id: string }) => x.id === id,
);

const v1 = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText });
console.log(
  "v1",
  v1.actions.map((a) => ({ type: a.actionType, text: a.evidenceText, face: a.faceId, status: a.reviewStatus })),
);

const native = extractClauseNativeActions({ oracleId: c.oracleId, oracleText: c.oracleText });
console.log("replacementEffects", JSON.stringify(native.replacementEffects, null, 2));
console.log(
  "actions",
  native.actions.map((a) => ({
    type: a.actionType,
    face: a.cardFaceId,
    text: a.evidenceText,
    status: a.reviewStatus,
    ctx: (a as { executionContext?: string }).executionContext,
  })),
);
