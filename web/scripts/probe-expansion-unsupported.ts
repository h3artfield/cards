import { readFileSync } from "node:fs";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { inferSupportedPrimitiveFromEvidence } from "./oracle-action-eval-shared";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const exp = JSON.parse(
  readFileSync("data/oracle-action-eval-development-generalization-expansion-v1.json", "utf8"),
) as { cases: OracleActionEvalCaseV2[] };

const training = exp.cases.filter(
  (c) => (c as { expansionMetadata?: { split?: string } }).expansionMetadata?.split === "expansion-training",
);

for (const c of training) {
  const raw = extractOracleActionsV1({
    oracleId: c.oracleId,
    oracleText: c.oracleText,
    cardFace: c.cardFace,
  });
  for (const a of raw.actions.filter((x) => x.reviewStatus === "accepted")) {
    const prim = normalizeToPrimitive(a.actionType, a.evidenceText);
    const gold = c.expectedPrimitiveActions.filter((e) => !e.negative);
    const matched = gold.some((e) => e.actionType === prim);
    const forbidden = c.forbiddenPrimitiveActions?.includes(prim);
    const supported = inferSupportedPrimitiveFromEvidence(c.oracleText, a.evidenceText);
    if (!matched && !forbidden && !supported) {
      console.log("UNSUPPORTED", c.id, c.cardName, prim, a.evidenceText);
    }
  }
}

const r = evaluateCaseSet(training, "expansion_training");
console.log("eval unsupported", r.authoritativeClassification.counts.genuinely_unsupported_by_oracle);
