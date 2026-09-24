import { readFileSync } from "node:fs";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { inferSupportedPrimitiveFromEvidence } from "./oracle-action-eval-shared";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v20.json", "utf8"));

for (const c of dev.cases as OracleActionEvalCaseV2[]) {
  const raw = extractOracleActionsV1({
    oracleId: c.oracleId,
    oracleText: c.oracleText,
    cardFace: c.cardFace,
  });
  for (const a of raw.actions.filter((x) => x.reviewStatus === "accepted")) {
    const primitive = normalizeToPrimitive(a.actionType, a.evidenceText);
    const supported = inferSupportedPrimitiveFromEvidence(c.oracleText, a.evidenceText);
    if (!supported) {
      console.log(c.id, c.cardName, primitive, JSON.stringify(a.evidenceText.slice(0, 80)));
    }
  }
}
