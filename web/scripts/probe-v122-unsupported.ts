import { readFileSync } from "node:fs";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { inferSupportedPrimitiveFromEvidence, spanValid } from "./oracle-action-eval-shared";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v25.json", "utf8")) as {
  cases: OracleActionEvalCaseV2[];
};

console.log("=== unsupported / invalid span accepted ===");
for (const c of dev.cases) {
  const raw = extractOracleActionsV1({
    oracleId: c.oracleId,
    oracleText: c.oracleText,
    cardFace: c.cardFace,
  });
  for (const a of raw.actions.filter((x) => x.reviewStatus === "accepted")) {
    const p = normalizeToPrimitive(a.actionType, a.evidenceText);
    const s = inferSupportedPrimitiveFromEvidence(c.oracleText, a.evidenceText);
    const valid = spanValid(c.oracleText, a.evidenceText, a.evidenceStart, a.evidenceEnd);
    if (!s || !valid) {
      console.log(JSON.stringify({ caseId: c.id, cardName: c.cardName, p, s, valid, evidence: a.evidenceText }));
    }
  }
}

console.log("\n=== structure-only with accepted deal_damage X ===");
for (const c of dev.cases) {
  const expected = c.expectedPrimitiveActions.filter((e) => !e.negative);
  if (expected.length > 0) continue;
  const raw = extractOracleActionsV1({
    oracleId: c.oracleId,
    oracleText: c.oracleText,
    cardFace: c.cardFace,
  });
  for (const a of raw.actions.filter((x) => x.reviewStatus === "accepted")) {
    console.log(JSON.stringify({ caseId: c.id, cardName: c.cardName, type: a.actionType, evidence: a.evidenceText, qty: a.quantityType }));
  }
}

const r = evaluateCaseSet(dev.cases, "dev");
console.log("\n=== metrics ===", JSON.stringify(r.metricsByEmissionTier.acceptedOnly));
console.log("auth", JSON.stringify(r.authoritativeClassification.counts));
console.log("fpByCat", JSON.stringify(r.falsePositiveClassification));
