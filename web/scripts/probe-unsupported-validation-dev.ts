/**
 * Dev-only: count accepted unsupported on validation v10 with current parser.
 * NOT an authorized validation milestone rerun.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { inferSupportedPrimitiveFromEvidence } from "./oracle-action-eval-shared";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const v10Path = resolve(process.cwd(), "data/oracle-action-eval-validation-v10.json");
const v10 = JSON.parse(readFileSync(v10Path, "utf8"));

let unsupported = 0;
const items: unknown[] = [];

for (const c of v10.cases as OracleActionEvalCaseV2[]) {
  const raw = extractOracleActionsV1({
    oracleId: c.oracleId,
    oracleText: c.oracleText,
    cardFace: c.cardFace,
  });
  for (const a of raw.actions.filter((x) => x.reviewStatus === "accepted")) {
    const primitive = normalizeToPrimitive(a.actionType, a.evidenceText);
    const supported = inferSupportedPrimitiveFromEvidence(c.oracleText, a.evidenceText);
    if (!supported || supported !== primitive) {
      unsupported += 1;
      items.push({
        caseId: c.id,
        cardName: c.cardName,
        actionType: primitive,
        supported,
        evidence: a.evidenceText,
        quantityType: a.quantityType,
        quantityExpression: a.quantityExpression,
      });
    }
  }
}

console.log(JSON.stringify({ unsupported, items }, null, 2));
