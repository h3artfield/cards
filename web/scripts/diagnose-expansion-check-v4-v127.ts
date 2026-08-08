import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { evaluateCaseUnified } from "./oracle-action-unified-matcher";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const envelope = JSON.parse(
  readFileSync("data/oracle-action-eval-development-generalization-expansion-check-v4.json", "utf8"),
) as { cases: OracleActionEvalCaseV2[] };
const failures = [];
for (const c of envelope.cases) {
  const raw = extractOracleActionsV1({ oracleId: c.oracleId, oracleText: c.oracleText, cardFace: c.cardFace });
  const u = evaluateCaseUnified(
    c,
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
      optionalEffect: a.optionalEffect,
      optional: a.optional,
    })),
  );
  if (u.accepted.fp > 0 || u.accepted.fn > 0) {
    failures.push({
      caseId: c.id,
      cardName: c.cardName,
      family: (c as { expansionMetadata?: { family?: string } }).expansionMetadata?.family,
      ...u.accepted,
      gold: c.expectedPrimitiveActions.filter((e) => !e.negative),
      accepted: raw.actions
        .filter((a) => a.reviewStatus === "accepted")
        .map((a) => ({
          p: normalizeToPrimitive(a.actionType, a.evidenceText),
          e: a.evidenceText.slice(0, 70),
          loyalty: a.loyaltyCost,
          modal: a.modalOptionId,
        })),
    });
  }
}
const out = resolve(process.cwd(), "data/milestones/rc2-development-planning/expansion-check-v4-failure-diagnosis-v127.json");
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), failureCount: failures.length, failures }, null, 2));
console.log(JSON.stringify({ failureCount: failures.length, ids: failures.map((f) => f.caseId) }, null, 2));
