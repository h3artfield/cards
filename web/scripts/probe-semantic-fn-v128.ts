import { readFileSync } from "node:fs";
import { parseOracleSemantics } from "../src/lib/deck-builder/golden-catalog/oracle-semantic-parse";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import { evaluateCaseSemantic } from "./oracle-action-semantic-matcher";

const caseId = process.argv[2] ?? "dev-exp-chk-v4-014";
const env = JSON.parse(
  readFileSync("data/oracle-action-eval-development-generalization-expansion-check-v4.json", "utf8"),
);
const c = env.cases.find((x: { id: string }) => x.id === caseId);
const p = parseOracleSemantics({ oracleId: c.oracleId, oracleText: c.oracleText });
const gold = c.expectedPrimitiveActions.filter((e: { negative?: boolean }) => !e.negative);
console.log("gold", gold);
for (const a of p.actions.filter((x) => x.reviewStatus === "accepted")) {
  console.log({
    type: a.actionType,
    opt: a.optionalEffect,
    text: a.provenance.actionSpan.text.slice(0, 80),
    parent: a.parentAbilityId,
    segIdx: a.segmentAbilityIndex,
  });
}
console.log(
  "legacy",
  evaluateCaseUnified(
    c,
    p.legacy.actions.map((a) => ({
      actionType: a.actionType,
      evidenceText: a.evidenceText,
      evidenceStart: a.evidenceStart,
      evidenceEnd: a.evidenceEnd,
      faceId: a.faceId,
      abilityIndex: a.abilityIndex,
      loyaltyCost: a.loyaltyCost,
      modalOptionId: a.modalOptionId,
      reviewStatus: a.reviewStatus,
      optionalEffect: a.optionalEffect,
      optional: a.optional,
    })),
  ),
);
console.log("semantic", evaluateCaseSemantic(c, p));
