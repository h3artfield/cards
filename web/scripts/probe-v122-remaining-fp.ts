/** Remaining accepted FPs on v26 + expansion v2 canonical rerun. */
import { readFileSync } from "node:fs";
import { evaluateCaseSet } from "./eval-oracle-action-extraction-v6";
import { extractOracleActionsV1 } from "../src/lib/deck-builder/golden-catalog/oracle-action-parser-v1";
import { normalizeToPrimitive } from "../src/lib/deck-builder/golden-catalog/oracle-action-taxonomy";
import { matchGoldToActions } from "./oracle-action-unified-matcher";
import type { OracleActionEvalCaseV2 } from "./audit-oracle-action-eval-cases";

const dev = JSON.parse(readFileSync("data/oracle-action-eval-development-v26.json", "utf8"));
const exp = JSON.parse(readFileSync("data/oracle-action-eval-development-generalization-expansion-v2.json", "utf8"));
const training = exp.cases.filter((c: { expansionMetadata?: { split?: string } }) => c.expansionMetadata?.split === "expansion-training");

function fps(cases: OracleActionEvalCaseV2[]) {
  const out: Array<Record<string, string>> = [];
  for (const tc of cases) {
    const raw = extractOracleActionsV1({ oracleId: tc.oracleId, oracleText: tc.oracleText, cardFace: tc.cardFace });
    const expected = tc.expectedPrimitiveActions.filter((e) => !e.negative);
    const actions = raw.actions.map((a, i) => ({
      index: i,
      primitive: normalizeToPrimitive(a.actionType, a.evidenceText),
      evidenceText: a.evidenceText,
      reviewStatus: a.reviewStatus,
    }));
    const m = matchGoldToActions({ expected, actions, tier: "accepted", oracleText: tc.oracleText });
    for (const idx of m.unmatchedActionIndices) {
      const a = actions[idx];
      if (a.reviewStatus !== "accepted" || !a.primitive) continue;
      out.push({ caseId: tc.id, cardName: tc.cardName ?? "", primitive: a.primitive!, evidence: a.evidenceText });
    }
  }
  return out;
}

console.log("DEV FP", JSON.stringify(fps(dev.cases), null, 2));
console.log("EXP FP", JSON.stringify(fps(training), null, 2));
