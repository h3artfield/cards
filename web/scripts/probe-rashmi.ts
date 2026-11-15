import { readFileSync } from "node:fs";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";

const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v26.json", "utf8")) as {
  cases: Array<{ id: string; oracleId: string; oracleText: string; cardName?: string; expectedPrimitiveActions: unknown[] }>;
};
const c = dev.cases.find((x) => x.id === "eval-0150")!;
const raw = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText });
console.log(
  "accepted",
  raw.actions
    .filter((a) => a.reviewStatus === "accepted")
    .map((a) => ({
      p: normalizeToPrimitive(a.actionType, a.evidenceText),
      e: a.evidenceText.slice(0, 80),
      loyalty: a.loyaltyCost,
      modal: a.modalOptionId,
    })),
);
console.log("needs_review", raw.actions.filter((a) => a.reviewStatus === "needs_review").map((a) => ({ type: a.actionType, e: a.evidenceText.slice(0, 80), reason: a.abstainReason })));
const u = evaluateCaseUnified(
  c as never,
  raw.actions.map((a) => ({
    actionType: a.actionType,
    evidenceText: a.evidenceText,
    evidenceStart: a.evidenceStart,
    evidenceEnd: a.evidenceEnd,
    faceId: a.faceId,
    abilityIndex: a.abilityIndex,
    loyaltyCost: a.loyaltyCost,
    modalOptionId: a.modalOptionId,
    reviewStatus: a.reviewStatus,
  })),
);
console.log("metrics", u.accepted);
console.log("gold", c.expectedPrimitiveActions);
