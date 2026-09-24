import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";

const t =
  'Your opponents can\'t gain life.\n−2: Create a 1/1 red Devil creature token with "When this token dies, it deals 1 damage to any target."';
const r = extractOracleActionsV1({ oracleId: "x", oracleText: t });
for (const a of r.actions) {
  console.log(a.reviewStatus, a.actionType, a.evidenceText);
}
